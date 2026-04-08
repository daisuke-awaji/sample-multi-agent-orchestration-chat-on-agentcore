/**
 * Moca Operations Alarms
 *
 * 3-Layer CloudWatch Alarm system for application error detection:
 *  Layer 1 — Lambda Runtime Errors (built-in metrics): unhandled exceptions, OOM, timeouts
 *  Layer 2 — Application Errors via Metric Filters (log-based): console.error() output
 *  Layer 3 — API/CDN Errors (infrastructure metrics): HTTP 5xx errors
 *
 * Only created when alertEmail is configured in environment config.
 */
import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';

export interface OperationsAlarmsProps {
  readonly resourcePrefix: string;
  readonly alertEmail: string;
  readonly backendApiFunction: lambda.IFunction;
  readonly triggerExecutorFunction: lambda.IFunction;
  readonly sessionStreamHandlerFunction: lambda.IFunction;
  readonly agentRuntimeLogGroupName: string;
  readonly httpApi: apigatewayv2.IHttpApi;
}

export class OperationsAlarms extends Construct {
  constructor(scope: Construct, id: string, props: OperationsAlarmsProps) {
    super(scope, id);

    const {
      resourcePrefix,
      alertEmail,
      backendApiFunction,
      triggerExecutorFunction,
      sessionStreamHandlerFunction,
      agentRuntimeLogGroupName,
      httpApi,
    } = props;

    // ── SNS Topic ──
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `${resourcePrefix}-ops-alerts`,
      displayName: `${resourcePrefix} Operations Alerts`,
      enforceSSL: true,
    });
    alertTopic.addSubscription(new sns_subscriptions.EmailSubscription(alertEmail));

    const alarmAction = new cloudwatch_actions.SnsAction(alertTopic);

    // ── Log Groups ──
    const triggerExecutorLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      'TriggerExecutorLogGroup',
      `/aws/lambda/${resourcePrefix}-trigger-executor`,
    );

    const backendApiLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      'BackendApiLogGroup',
      `/aws/lambda/${backendApiFunction.functionName}`,
    );

    const sessionStreamLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      'SessionStreamLogGroup',
      `/aws/lambda/${sessionStreamHandlerFunction.functionName}`,
    );

    const agentRuntimeLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      'AgentRuntimeLogGroup',
      agentRuntimeLogGroupName,
    );

    const appErrorNamespace = `${resourcePrefix}/ApplicationErrors`;

    // ── Metric Filters (Layer 2) ──
    const triggerExecutorFilter = new logs.MetricFilter(this, 'TriggerExecutorErrorFilter', {
      filterName: `${resourcePrefix}-trigger-executor-errors`,
      logGroup: triggerExecutorLogGroup,
      filterPattern: logs.FilterPattern.literal('"ERROR"'),
      metricNamespace: appErrorNamespace,
      metricName: 'TriggerExecutorErrors',
      metricValue: '1',
      defaultValue: 0,
    });

    const backendApiFilter = new logs.MetricFilter(this, 'BackendApiErrorFilter', {
      filterName: `${resourcePrefix}-backend-api-errors`,
      logGroup: backendApiLogGroup,
      filterPattern: logs.FilterPattern.literal('"ERROR"'),
      metricNamespace: appErrorNamespace,
      metricName: 'BackendApiErrors',
      metricValue: '1',
      defaultValue: 0,
    });

    const sessionStreamFilter = new logs.MetricFilter(this, 'SessionStreamErrorFilter', {
      filterName: `${resourcePrefix}-session-stream-errors`,
      logGroup: sessionStreamLogGroup,
      filterPattern: logs.FilterPattern.literal('"ERROR"'),
      metricNamespace: appErrorNamespace,
      metricName: 'SessionStreamErrors',
      metricValue: '1',
      defaultValue: 0,
    });

    const agentRuntimeFilter = new logs.MetricFilter(this, 'AgentRuntimeErrorFilter', {
      filterName: `${resourcePrefix}-agent-runtime-errors`,
      logGroup: agentRuntimeLogGroup,
      filterPattern: logs.FilterPattern.literal('"[ERROR]"'),
      metricNamespace: appErrorNamespace,
      metricName: 'AgentRuntimeErrors',
      metricValue: '1',
      defaultValue: 0,
    });

    // ── Helper to create alarm and add SNS action ──
    const createAlarm = (
      id: string,
      alarmName: string,
      metric: cloudwatch.IMetric,
      threshold: number,
      comparisonOperator: cloudwatch.ComparisonOperator,
      evaluationPeriods: number,
    ): cloudwatch.Alarm => {
      const alarm = new cloudwatch.Alarm(this, id, {
        alarmName,
        metric,
        threshold,
        comparisonOperator,
        evaluationPeriods,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(alarmAction);
      return alarm;
    };

    const fiveMin = cdk.Duration.minutes(5);
    const gte1 = cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD;

    // ── Layer 2: Application Error Alarms (Metric Filters) ──
    createAlarm(
      'TriggerAppErrorAlarm',
      `${resourcePrefix}-trigger-app-error`,
      triggerExecutorFilter.metric({ statistic: 'Sum', period: fiveMin }),
      1,
      gte1,
      1,
    );

    createAlarm(
      'BackendApiAppErrorAlarm',
      `${resourcePrefix}-backendapi-app-error`,
      backendApiFilter.metric({ statistic: 'Sum', period: fiveMin }),
      1,
      gte1,
      1,
    );

    createAlarm(
      'SessionStreamAppErrorAlarm',
      `${resourcePrefix}-session-stream-app-error`,
      sessionStreamFilter.metric({ statistic: 'Sum', period: fiveMin }),
      1,
      gte1,
      1,
    );

    createAlarm(
      'AgentRuntimeAppErrorAlarm',
      `${resourcePrefix}-agent-runtime-app-error`,
      agentRuntimeFilter.metric({ statistic: 'Sum', period: fiveMin }),
      1,
      gte1,
      1,
    );

    // ── Layer 1: Lambda Runtime Error Alarms (built-in metrics) ──
    createAlarm(
      'BackendApiLambdaErrorAlarm',
      `${resourcePrefix}-backendapi-lambda-error`,
      backendApiFunction.metricErrors({ period: fiveMin }),
      1,
      gte1,
      1,
    );

    createAlarm(
      'TriggerLambdaErrorAlarm',
      `${resourcePrefix}-trigger-lambda-error`,
      triggerExecutorFunction.metricErrors({ period: fiveMin }),
      1,
      gte1,
      1,
    );

    createAlarm(
      'SessionStreamLambdaErrorAlarm',
      `${resourcePrefix}-session-stream-lambda-error`,
      sessionStreamHandlerFunction.metricErrors({ period: fiveMin }),
      1,
      gte1,
      1,
    );

    // Lambda throttle: sum across all 3 functions
    const throttleExpression = new cloudwatch.MathExpression({
      expression: 'm1 + m2 + m3',
      usingMetrics: {
        m1: backendApiFunction.metricThrottles({ period: fiveMin }),
        m2: triggerExecutorFunction.metricThrottles({ period: fiveMin }),
        m3: sessionStreamHandlerFunction.metricThrottles({ period: fiveMin }),
      },
      period: fiveMin,
    });

    createAlarm(
      'LambdaThrottleAlarm',
      `${resourcePrefix}-lambda-throttle`,
      throttleExpression,
      1,
      gte1,
      1,
    );

    // ── Layer 3: API Gateway 5xx Alarm ──
    createAlarm(
      'Api5xxAlarm',
      `${resourcePrefix}-api-5xx`,
      new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: {
          ApiId: httpApi.apiId,
        },
        statistic: 'Sum',
        period: fiveMin,
      }),
      1,
      gte1,
      1,
    );

    // NOTE: CloudFront 5xxErrorRate alarm is not included because CloudFront
    // metrics are only available in us-east-1, and CDK cannot create cross-region
    // alarms from this stack (ap-northeast-1). A separate us-east-1 stack or
    // manual alarm would be needed for CloudFront monitoring.
  }
}
