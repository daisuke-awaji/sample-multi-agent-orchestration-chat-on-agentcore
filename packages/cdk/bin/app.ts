#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AgentCoreStack } from "../lib/agentcore-stack";

const app = new cdk.App();

new AgentCoreStack(app, "AgentCoreStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: "Amazon Bedrock AgentCore Gateway",
});
