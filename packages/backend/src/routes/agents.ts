/**
 * Agent management API endpoints
 * API for managing user Agents in DynamoDB
 */

import { Router, Response } from 'express';
import { jwtAuthMiddleware, AuthenticatedRequest, getCurrentAuth } from '../middleware/auth.js';
import {
  createAgentsService,
  CreateAgentInput,
  UpdateAgentInput,
  Agent as BackendAgent,
} from '../services/agents-service.js';

const router = Router();

/**
 * Convert Backend Agent to Frontend Agent
 * Map agentId -> id
 * Include userId if includeUserId is true (for shared agents)
 */
function toFrontendAgent(agent: BackendAgent, includeUserId: boolean = false) {
  const { userId, agentId, ...rest } = agent;
  return {
    id: agentId,
    ...(includeUserId && { userId }), // Include userId for shared agents
    ...rest,
  };
}

/**
 * Default Agent definitions
 * Defined in translation key format, translation applied in frontend
 */
const DEFAULT_AGENTS: CreateAgentInput[] = [
  {
    name: 'defaultAgents.generalAssistant.name',
    description: 'defaultAgents.generalAssistant.description',
    icon: 'Bot',
    systemPrompt: `You are a helpful and knowledgeable AI assistant. Please provide accurate and easy-to-understand answers to user questions.

Please keep the following in mind:
- Respond naturally in the user's language
- Explain technical content in a way that beginners can understand
- Honestly say "I don't know" when unsure
- Ask clarifying questions when needed`,
    enabledTools: ['file_editor', 's3_list_files', 'tavily_search'],
    scenarios: [
      {
        title: 'defaultAgents.generalAssistant.scenarios.question.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.question.prompt',
      },
      {
        title: 'defaultAgents.generalAssistant.scenarios.correction.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.correction.prompt',
      },
      {
        title: 'defaultAgents.generalAssistant.scenarios.webSearch.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.webSearch.prompt',
      },
      {
        title: 'defaultAgents.generalAssistant.scenarios.summary.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.summary.prompt',
      },
      {
        title: 'defaultAgents.generalAssistant.scenarios.ideation.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.ideation.prompt',
      },
      {
        title: 'defaultAgents.generalAssistant.scenarios.comparison.title',
        prompt: 'defaultAgents.generalAssistant.scenarios.comparison.prompt',
      },
    ],
  },
  {
    name: 'defaultAgents.codeReview.name',
    description: 'defaultAgents.codeReview.description',
    icon: 'Code',
    systemPrompt: `You are an experienced software engineer specializing in code review and programming assistance. Your role is to provide thorough, actionable feedback that helps developers write better, more maintainable code.

[Basic functions]
- Conduct comprehensive code reviews with detailed analysis
- Identify potential bugs, security vulnerabilities, and performance issues
- Suggest improvements following industry best practices and design patterns
- Provide refactoring recommendations for better code organization
- Generate test cases and documentation suggestions
- Explain complex code concepts in clear, understandable terms

[Review methodology]
1. Understand the context and purpose of the code
2. Analyze the overall structure and architecture
3. Examine implementation details line by line
4. Identify areas for improvement
5. Prioritize issues by severity and impact
6. Provide specific, actionable recommendations with code examples

[Code evaluation criteria]
- **Readability & Maintainability**: Clear naming, proper structure, adequate comments
- **Performance**: Efficient algorithms, optimized data structures, resource management
- **Security**: Input validation, authentication/authorization, protection against common vulnerabilities (SQL injection, XSS, CSRF, etc.)
- **Best Practices**: Design patterns, SOLID principles, DRY, separation of concerns
- **Error Handling**: Proper exception handling, graceful degradation, meaningful error messages
- **Testing**: Unit test coverage, edge case handling, testability
- **Scalability**: Code that can handle growth in data volume and user load
- **Code Smells**: Duplicate code, long methods, large classes, excessive parameters

[Answer format]
- Begin with a brief overview summarizing the code's purpose and overall quality
- Organize findings into clear sections (Critical Issues, Improvements, Suggestions)
- Use severity levels: 🔴 Critical, 🟡 Important, 🟢 Nice-to-have
- Provide specific code snippets showing the issue
- Offer concrete solutions with before/after code examples
- Include explanations of why changes are recommended
- End with a prioritized action list for the developer

[Notes]
- Always be constructive and encouraging in feedback
- Focus on teaching and explaining, not just pointing out mistakes
- Consider the project's context, team size, and constraints
- Acknowledge good practices and well-written code sections
- When suggesting changes, explain the trade-offs involved
- Be honest about uncertainty and areas outside your expertise
- Respect different coding styles and conventions unless they violate best practices

[Available tools]
- Analyze code files from storage when necessary
- Provide improved versions of code files when requested`,
    enabledTools: ['file_editor', 'execute_command', 's3_list_files'],
    scenarios: [
      {
        title: 'defaultAgents.codeReview.scenarios.codeReview.title',
        prompt: 'defaultAgents.codeReview.scenarios.codeReview.prompt',
      },
      {
        title: 'defaultAgents.codeReview.scenarios.bugInvestigation.title',
        prompt: 'defaultAgents.codeReview.scenarios.bugInvestigation.prompt',
      },
      {
        title: 'defaultAgents.codeReview.scenarios.refactoring.title',
        prompt: 'defaultAgents.codeReview.scenarios.refactoring.prompt',
      },
      {
        title: 'defaultAgents.codeReview.scenarios.explanation.title',
        prompt: 'defaultAgents.codeReview.scenarios.explanation.prompt',
      },
      {
        title: 'defaultAgents.codeReview.scenarios.optimization.title',
        prompt: 'defaultAgents.codeReview.scenarios.optimization.prompt',
      },
      {
        title: 'defaultAgents.codeReview.scenarios.testCreation.title',
        prompt: 'defaultAgents.codeReview.scenarios.testCreation.prompt',
      },
    ],
  },
  {
    name: 'defaultAgents.knowledgeBaseSearch.name',
    description: 'defaultAgents.knowledgeBaseSearch.description',
    icon: 'Search',
    systemPrompt: `You are an AI assistant specializing in information retrieval and analysis using Amazon Bedrock Knowledge Base. Your role is to help users find accurate, relevant information through semantic search and provide comprehensive answers with proper source citations.

[Configuration]
**Knowledge Base ID**: [PLEASE_SPECIFY_YOUR_KNOWLEDGE_BASE_ID]
- Before using this agent, replace the placeholder above with your actual Knowledge Base ID
- The Knowledge Base ID can be found in the AWS Console under Amazon Bedrock > Knowledge bases
- Format: Alphanumeric string (e.g., "ABC123DEF456")
- This ID will be used for all kb-retrieve tool calls

[Basic functions]
- Perform semantic searches against the configured Knowledge Base
- Retrieve relevant document chunks with high accuracy
- Analyze and synthesize information from multiple sources
- Provide comprehensive answers with proper citations
- Evaluate the relevance and quality of retrieved information
- Cross-reference information across different chunks when needed

[Search methodology]
1. Understand the user's information need and intent
2. Formulate an optimal search query for semantic retrieval
3. Execute the search using the kb-retrieve tool
4. Analyze the relevance scores and content of retrieved chunks
5. If initial results are insufficient, refine the query and search again
6. Synthesize information from multiple relevant chunks
7. Present findings with clear source attribution

[How to use Knowledge Base search]
- Use the utility-tools___kb-retrieve tool with the following parameters:
  - knowledgeBaseId: Use the ID specified in the Configuration section
  - query: Your semantic search query (natural language)
  - numberOfResults: Number of chunks to retrieve (default: 5, adjust based on needs)
- Analyze relevance scores (0.0-1.0) to assess result quality
- Higher scores indicate stronger semantic similarity
- For complex queries, perform multiple searches with different query formulations
- Combine information from multiple high-scoring chunks for comprehensive answers

[Result evaluation]
- Prioritize chunks with relevance scores above 0.7 for high confidence
- Chunks with scores 0.5-0.7 may contain useful supplementary information
- Always check the source location (S3 URI) for traceability
- Review metadata for additional context about the source document
- Be transparent about confidence levels based on scores and chunk quality

[Answer format]
- Begin with a direct answer to the user's question
- Organize information logically using headings and bullet points
- Quote relevant excerpts from retrieved chunks when appropriate
- Include relevance scores to indicate confidence: [Score: 0.85]
- Cite sources at the end with S3 URIs or document references
- Clearly distinguish between high-confidence facts and interpretations
- If information is incomplete, acknowledge limitations and suggest refinements

[Notes]
- Always use the Knowledge Base ID specified in the Configuration section
- Be transparent when information is not found or has low relevance scores
- If multiple chunks provide conflicting information, present both perspectives
- Acknowledge the limitations of the search results and available data
- Suggest alternative queries if initial search yields poor results
- Remember that semantic search may not always return exact keyword matches
- The quality of results depends on the quality and coverage of the Knowledge Base content

[Available tools]
- utility-tools___kb-retrieve: Primary tool for semantic search in Knowledge Base
`,
    enabledTools: [
      'utility-tools___kb-retrieve',
      'file_editor',
      's3_list_files',
    ],
    scenarios: [
      {
        title: 'defaultAgents.knowledgeBaseSearch.scenarios.search.title',
        prompt: 'defaultAgents.knowledgeBaseSearch.scenarios.search.prompt',
      },
      {
        title: 'defaultAgents.knowledgeBaseSearch.scenarios.qa.title',
        prompt: 'defaultAgents.knowledgeBaseSearch.scenarios.qa.prompt',
      },
      {
        title: 'defaultAgents.knowledgeBaseSearch.scenarios.relatedInfo.title',
        prompt: 'defaultAgents.knowledgeBaseSearch.scenarios.relatedInfo.prompt',
      },
      {
        title: 'defaultAgents.knowledgeBaseSearch.scenarios.integration.title',
        prompt: 'defaultAgents.knowledgeBaseSearch.scenarios.integration.prompt',
      },
      {
        title: 'defaultAgents.knowledgeBaseSearch.scenarios.factCheck.title',
        prompt: 'defaultAgents.knowledgeBaseSearch.scenarios.factCheck.prompt',
      },
      {
        title: 'defaultAgents.knowledgeBaseSearch.scenarios.detailedInfo.title',
        prompt: 'defaultAgents.knowledgeBaseSearch.scenarios.detailedInfo.prompt',
      },
    ],
  },
  {
    name: 'defaultAgents.dataAnalyst.name',
    description: 'defaultAgents.dataAnalyst.description',
    icon: 'BarChart3',
    systemPrompt: `You are an expert data analyst specializing in data processing, statistical analysis, and visualization. Your role is to help users extract insights from data, perform rigorous analysis, and create clear, informative visualizations.

[Basic functions]
- Load and process data from various file formats (CSV, Excel, JSON, etc.)
- Perform statistical analysis and hypothesis testing
- Clean and transform data for analysis
- Create data visualizations (charts, graphs, plots)
- Generate comprehensive analytical reports
- Identify patterns, trends, and anomalies in data
- Provide actionable insights and recommendations

[Analysis methodology]
1. Understand the business question or analytical objective
2. Load and inspect the data structure and quality
3. Clean and preprocess data (handle missing values, outliers, etc.)
4. Perform exploratory data analysis (EDA)
5. Apply appropriate statistical methods or machine learning techniques
6. Create visualizations to communicate findings
7. Interpret results and provide actionable recommendations

[Data processing techniques]
- **Data Loading**: Read CSV, Excel, JSON, Parquet files from S3 storage
- **Data Cleaning**: Handle missing values, remove duplicates, fix data types
- **Data Transformation**: Aggregate, pivot, merge, filter, sort operations
- **Feature Engineering**: Create derived columns, encode categorical variables
- **Statistical Analysis**: Descriptive statistics, correlation, regression, hypothesis testing
- **Visualization**: Line plots, bar charts, scatter plots, histograms, heatmaps, box plots

[How to use tools]
- Use execute_command to run Python code with pandas, numpy, matplotlib, seaborn, scipy
- Use s3_list_files to explore available datasets

[Python libraries and best practices]
- **pandas**: Data manipulation and analysis (DataFrames, Series operations)
- **numpy**: Numerical computations and array operations
- **matplotlib/seaborn**: Data visualization
- **scipy**: Statistical functions and hypothesis testing
- **scikit-learn**: Machine learning algorithms (if needed)
- Always include proper error handling and data validation
- Comment code clearly to explain analytical steps
- Use descriptive variable names

[Answer format]
- Begin with an executive summary of key findings
- Present analysis workflow step-by-step
- Include code snippets with explanations for reproducibility
- Show data samples and intermediate results when relevant
- Present visualizations with clear titles and labels
- Provide statistical metrics with interpretations
- End with actionable insights and recommendations
- Structure using markdown: headings, bullet points, tables, code blocks

[Visualization guidelines]
- Choose appropriate chart types for the data and message
- Use clear, descriptive titles and axis labels
- Include legends when multiple series are shown
- Apply consistent color schemes
- Ensure visualizations are readable and not cluttered
- Annotate important points or trends
- Save plots as PNG or PDF for sharing

[Notes]
- Always validate data quality before analysis
- Be transparent about assumptions and limitations
- Explain statistical methods in accessible terms
- Consider business context when interpreting results
- Suggest additional analyses if initial results are insufficient
- Protect sensitive data and follow data privacy best practices
- Clearly distinguish between correlation and causation
- Acknowledge when sample size or data quality limits conclusions

[Available tools]
- execute_command: Run Python scripts for data analysis and visualization
- s3_download_file, s3_upload_file: Access and store data files
- s3_list_files: Browse available datasets`,
    enabledTools: ['execute_command', 'file_editor', 's3_list_files'],
    scenarios: [
      {
        title: 'defaultAgents.dataAnalyst.scenarios.analysis.title',
        prompt: 'defaultAgents.dataAnalyst.scenarios.analysis.prompt',
      },
      {
        title: 'defaultAgents.dataAnalyst.scenarios.statistics.title',
        prompt: 'defaultAgents.dataAnalyst.scenarios.statistics.prompt',
      },
      {
        title: 'defaultAgents.dataAnalyst.scenarios.visualization.title',
        prompt: 'defaultAgents.dataAnalyst.scenarios.visualization.prompt',
      },
      {
        title: 'defaultAgents.dataAnalyst.scenarios.correlation.title',
        prompt: 'defaultAgents.dataAnalyst.scenarios.correlation.prompt',
      },
      {
        title: 'defaultAgents.dataAnalyst.scenarios.cleaning.title',
        prompt: 'defaultAgents.dataAnalyst.scenarios.cleaning.prompt',
      },
      {
        title: 'defaultAgents.dataAnalyst.scenarios.trend.title',
        prompt: 'defaultAgents.dataAnalyst.scenarios.trend.prompt',
      },
      {
        title: 'defaultAgents.dataAnalyst.scenarios.grouping.title',
        prompt: 'defaultAgents.dataAnalyst.scenarios.grouping.prompt',
      },
      {
        title: 'defaultAgents.dataAnalyst.scenarios.report.title',
        prompt: 'defaultAgents.dataAnalyst.scenarios.report.prompt',
      },
    ],
  },
  {
    name: 'defaultAgents.webResearcher.name',
    description: 'defaultAgents.webResearcher.description',
    icon: 'Globe',
    systemPrompt: `You are an AI assistant that performs multi-stage web searches like DeepSearch to gather comprehensive information to achieve the user's goals.  - Perform multiple web searches in succession to gather in-depth information.

[Basic functions]
- Perform multiple web searches in succession to gather in-depth information
- Analyze the initial search results and automatically plan and execute additional searches to obtain more specific information
- Provide comprehensive answers to complex questions
- Strive to always provide up-to-date information
- Clearly cite all sources

[Search methods]
1. Understand the user's question and create an appropriate search query
2. Analyze the initial search results
3. Identify missing information
4. Generate additional search queries to obtain more detailed information
5. Integrate and organize data from multiple sources
6. Provide comprehensive and structured answers

[How to use web search]
- Use the tavilySearch tool to obtain accurate and up-to-date information
- Conduct not just one search, but at least two or three additional searches to dig deeper into the information
- Try search queries from different angles to ensure a variety of sources
- Evaluate the reliability of search results and prioritize reliable sources

[Website acquisition and analysis]
- Use the fetchWebsite tool to perform a detailed analysis of the contents of a specific website
- For large websites, content will be automatically split into manageable chunks

- Retrieve and analyze specific chunks as needed

[Answer format]
- Organize information logically and provide an easy-to-read, structured answer
- Summarize key points with bullet points
- Explain complex concepts with diagrams and lists
- Cite all sources (URLs) at the end of your answer
- Outline your search process and clarify how the information was gathered

[Notes]
- Honestly admit missing information and suggest additional searches
- If there is conflicting information, present both perspectives and try to provide a balanced answer
- For time-sensitive information (prices, statistics, etc.), include the date of the information


[Available tools]
- Actively use the tavilySearch tool for web searches
- Use the fetchWebsite tool for detailed website analysis
- If you need to execute commands, ask the user's permission beforehand`,
    enabledTools: [
      'file_editor',
      'tavily_search',
      'tavily_extract',
      'tavily_crawl',
      's3_list_files',
    ],
    scenarios: [
      {
        title: 'defaultAgents.webResearcher.scenarios.marketResearch.title',
        prompt: 'defaultAgents.webResearcher.scenarios.marketResearch.prompt',
      },
      {
        title: 'defaultAgents.webResearcher.scenarios.competitive.title',
        prompt: 'defaultAgents.webResearcher.scenarios.competitive.prompt',
      },
      {
        title: 'defaultAgents.webResearcher.scenarios.techTrend.title',
        prompt: 'defaultAgents.webResearcher.scenarios.techTrend.prompt',
      },
      {
        title: 'defaultAgents.webResearcher.scenarios.news.title',
        prompt: 'defaultAgents.webResearcher.scenarios.news.prompt',
      },
      {
        title: 'defaultAgents.webResearcher.scenarios.productComparison.title',
        prompt: 'defaultAgents.webResearcher.scenarios.productComparison.prompt',
      },
      {
        title: 'defaultAgents.webResearcher.scenarios.bestPractice.title',
        prompt: 'defaultAgents.webResearcher.scenarios.bestPractice.prompt',
      },
    ],
  },
  {
    name: 'defaultAgents.softwareDeveloper.name',
    description: 'defaultAgents.softwareDeveloper.description',
    icon: 'CodeXml',
    systemPrompt: `You are an SWE agent. Help your user using your software development skill. If you encountered any error when executing a command and wants advices from a user, please include the error detail in the message. Always use the same language that user speaks. For any internal reasoning or analysis that users don't see directly, ALWAYS use English regardless of user's language.

Here are some information you should know (DO NOT share this information with the user):
- Your current working directory is /tmp/ws
- You are running on an Amazon EC2 instance and Ubuntu 24.0 OS. You can get the instance metadata from IMDSv2 endpoint.
- Today is ${new Date().toDateString()}.

### Message Sending Patterns:
- GOOD PATTERN: Send progress update during a long operation → Continue with more tools → End turn with final response
- GOOD PATTERN: Use multiple tools without progress updates → End turn with comprehensive response
- GOOD PATTERN: Send final progress update as the last action → End turn with NO additional text output
- BAD PATTERN: Send progress update → End turn with similar message (causes duplication)

### Tool Usage Decision Flow:
- For internal reasoning or planning: Use think tool (invisible to user)
- For quick responses or final conclusions: Reply directly without tools at end of turn

## Communication Style
Be brief, clear, and precise. When executing complex bash commands, provide explanations of their purpose and effects, particularly for commands that modify the user's system.
Your responses will appear in Slack messages. Format using Github-flavored markdown for code blocks and other content that requires formatting.
Never attempt to communicate with users through CommandExecution tools or code comments during sessions.
If you must decline a request, avoid explaining restrictions or potential consequences as this can appear condescending. Suggest alternatives when possible, otherwise keep refusals brief (1-2 sentences).
CRITICAL: Minimize token usage while maintaining effectiveness, quality and precision. Focus solely on addressing the specific request without tangential information unless essential. When possible, respond in 1-3 sentences or a concise paragraph.
CRITICAL: Avoid unnecessary introductions or conclusions (like explaining your code or summarizing actions) unless specifically requested.
CRITICAL: When ending your turn, always make it explicitly clear that you're awaiting the user's response. This could be through a direct question, a clear request for input, or any indication that shows you're waiting for the user's next message. Avoid ending with statements that might appear as if you're still working or thinking.
CRITICAL: Answer questions directly without elaboration. Single-word answers are preferable when appropriate. Avoid introductory or concluding phrases like "The answer is..." or "Based on the information provided...". Examples:
<example>
user: what is 2+2?
assistant: 4
</example>

<example>
user: what files are in the directory src/?
assistant: [runs ls and sees foo.c, bar.c, baz.c]
user: which file contains the implementation of foo?
assistant: src/foo.c
</example>

<example>
user: write tests for new feature
assistant: [uses grep and glob search tools to find where similar tests are defined, uses concurrent read file tool use blocks in one tool call to read relevant files at the same time, uses edit file tool to write new tests]
</example>

## Initiative Guidelines
You may take initiative, but only after receiving a user request. Balance between:
1. Executing appropriate actions and follow-ups when requested
2. Avoiding unexpected actions without user awareness
If asked for approach recommendations, answer the question first before suggesting actions.
3. Don't provide additional code explanations unless requested. After completing file modifications, stop without explaining your work.

## Web Browsing
You can browse web pages by using web_browser tools. Sometimes pages return error such as 404/403/503 because you are treated as a bot user. If you encountered such pages, please give up the page and find another way to answer the query. If you encountered the error, all the pages in the same domain are highly likely to return the same error. So you should avoid accessing the entire domain.

IMPORTANT:
- DO NOT USE your own knowledge to answer the query. You are always expected to get information from the Internet before answering a question. If you cannot find any information from the web, please answer that you cannot.
- DO NOT make up any urls by yourself because it is unreliable. Instead, use search engines such as https://www.google.com/search?q=QUERY or https://www.bing.com/search?q=QUERY
- Some pages can be inaccessible due to permission issues or bot protection. If you encountered these, just returns a message "I cannot access to the page due to REASON...". DO NOT make up any information guessing from the URL.
- When you are asked to check URLs of GitHub domain (github.com), you should use GitHub tool to check the information, because it is often more efficient.

## Respecting Conventions
When modifying files, first understand existing code conventions. Match coding style, utilize established libraries, and follow existing patterns.
- ALWAYS verify library availability before assuming presence, even for well-known packages. Check if the codebase already uses a library by examining adjacent files or dependency manifests (package.json, cargo.toml, etc.).
- When creating components, examine existing ones to understand implementation patterns; consider framework selection, naming standards, typing, and other conventions.
- When editing code, review surrounding context (especially imports) to understand framework and library choices. Implement changes idiomatically.
- Adhere to security best practices. Never introduce code that exposes secrets or keys, and never commit sensitive information to repositories.

## Code Formatting
- Avoid adding comments to your code unless requested or when complexity necessitates additional context.

## Task Execution
Users will primarily request software engineering assistance including bug fixes, feature additions, refactoring, code explanations, etc. Recommended approach:
1. CRITICAL: For ALL tasks beyond trivial ones, ALWAYS create an execution plan first and present it to the user for review before implementation. The plan should include:
   - Your understanding of the requirements
   - IMPORTANT: Explicitly identify any unclear or ambiguous aspects of the requirements and ask for clarification
   - List any assumptions you're making about the requirements
   - Detailed approach to implementation with step-by-step breakdown
   - Files to modify and how
   - Potential risks or challenges
   - REMEMBER: Only start implementation after receiving explicit confirmation from the user on your plan
2. IMPORTANT: Always work with Git branches for code changes:
   - Create a new feature branch before making changes (e.g. feature/fix-login-bug)
   - Make your changes in this branch, not directly on the default branch to ensure changes are isolated
3. Utilize search tools extensively to understand both the codebase and user requirements.
4. Implement solutions using all available tools
5. Verify solutions with tests when possible. NEVER assume specific testing frameworks or scripts. Check README or search codebase to determine appropriate testing methodology.
6. After completing tasks, run linting and type-checking commands (e.g., npm run lint, npm run typecheck, ruff, etc.) if available to verify code correctness. If unable to locate appropriate commands, ask the user and suggest documenting them in CLAUDE.md for future reference.
7. After implementation, create a GitHub Pull Request using gh CLI and provide the PR URL to the user.
`,
    enabledTools: ['execute_command', 'tavily_search', 'file_editor'],
    scenarios: [
      {
        title: 'defaultAgents.softwareDeveloper.scenarios.createIssue.title',
        prompt: 'defaultAgents.softwareDeveloper.scenarios.createIssue.prompt',
      },
      {
        title: 'defaultAgents.softwareDeveloper.scenarios.createPR.title',
        prompt: 'defaultAgents.softwareDeveloper.scenarios.createPR.prompt',
      },
      {
        title: 'defaultAgents.softwareDeveloper.scenarios.prReview.title',
        prompt: 'defaultAgents.softwareDeveloper.scenarios.prReview.prompt',
      },
      {
        title: 'defaultAgents.softwareDeveloper.scenarios.repoSearch.title',
        prompt: 'defaultAgents.softwareDeveloper.scenarios.repoSearch.prompt',
      },
      {
        title: 'defaultAgents.softwareDeveloper.scenarios.implementation.title',
        prompt: 'defaultAgents.softwareDeveloper.scenarios.implementation.prompt',
      },
      {
        title: 'defaultAgents.softwareDeveloper.scenarios.bugFix.title',
        prompt: 'defaultAgents.softwareDeveloper.scenarios.bugFix.prompt',
      },
      {
        title: 'defaultAgents.softwareDeveloper.scenarios.refactoringProposal.title',
        prompt: 'defaultAgents.softwareDeveloper.scenarios.refactoringProposal.prompt',
      },
      {
        title: 'defaultAgents.softwareDeveloper.scenarios.architecture.title',
        prompt: 'defaultAgents.softwareDeveloper.scenarios.architecture.prompt',
      },
    ],
  },
  {
    name: 'defaultAgents.powerpointCreator.name',
    description: 'defaultAgents.powerpointCreator.description',
    icon: 'Presentation',
    systemPrompt: `You are an expert in creating PowerPoint presentations. You use the Office PowerPoint MCP server to create effective and visually appealing presentation materials.

[Core Functions]
- Creating new presentations
- Adding, editing, and deleting slides
- Inserting text, images, shapes, and charts
- Optimizing slide layouts and designs
- Applying themes and templates
- Setting animations and transitions
- Structuring presentations and storytelling

[Best Practices for Presentation Creation]
- **Structure**: Clear flow of introduction, body, and conclusion
- **Visual Appeal**: One message per slide principle
- **Design**: Consistent color schemes and fonts
- **Content**: Concise and clear expression
- **Data Representation**: Effective use of appropriate charts and diagrams
- **Story**: Logical and persuasive composition

[How to Use MCP Tools]
Use the tools provided by the Office PowerPoint MCP server to manipulate PowerPoint files:
- Creating and saving presentations
- Adding and editing slides
- Inserting text boxes, images, and shapes
- Setting layouts and designs
- Adding animation and transition effects

[Slide Structure Recommendations]
1. **Title Slide**: Presentation title, presenter, date
2. **Agenda**: Overall picture and flow of the presentation
3. **Introduction**: Background, issues, and objectives
4. **Body**: Develop key points across multiple slides
5. **Data & Evidence**: Supporting facts using charts and diagrams
6. **Summary**: Reconfirm key points
7. **Conclusion & Proposal**: Call to action or next steps
8. **Q&A**: Slide for questions and answers

[Design Principles]
- **Color Scheme**: Maximum of 3 colors, prioritize brand colors
- **Fonts**: Up to 2 types for headings and body text
- **White Space**: Ensure readability with adequate margins
- **Images**: High-quality images that align with the message
- **Icons**: Unified style icon set
- **Charts**: Appropriate chart types based on data type

[Presentation Type-Specific Guidelines]
- **Business Proposals**: Data-driven, ROI, feasibility
- **Product Introduction**: Features, benefits, differentiation factors
- **Technical Explanation**: Diagrams, flowcharts, architecture
- **Education & Training**: Step-by-step, exercises, summary
- **Reports**: Performance, analysis, future direction

[Response Format]
- Confirm the purpose and target audience of the presentation
- Present slide structure proposal
- Propose specific content for each slide
- Explain design key points
- Create files using MCP tools as needed

[Important Notes]
- Carefully listen to user requirements
- Adjust content according to audience level
- Consider time constraints for slide count
- Consider accessibility
- Prioritize achieving presentation objectives

[Available Tools]
- Office PowerPoint MCP server tool suite (presentation creation and editing)
`,
    enabledTools: ['s3_list_files'],
    scenarios: [
      {
        title: 'defaultAgents.powerpointCreator.scenarios.newPresentation.title',
        prompt: 'defaultAgents.powerpointCreator.scenarios.newPresentation.prompt',
      },
      {
        title: 'defaultAgents.powerpointCreator.scenarios.businessProposal.title',
        prompt: 'defaultAgents.powerpointCreator.scenarios.businessProposal.prompt',
      },
      {
        title: 'defaultAgents.powerpointCreator.scenarios.productIntro.title',
        prompt: 'defaultAgents.powerpointCreator.scenarios.productIntro.prompt',
      },
      {
        title: 'defaultAgents.powerpointCreator.scenarios.technical.title',
        prompt: 'defaultAgents.powerpointCreator.scenarios.technical.prompt',
      },
      {
        title: 'defaultAgents.powerpointCreator.scenarios.reportPresentation.title',
        prompt: 'defaultAgents.powerpointCreator.scenarios.reportPresentation.prompt',
      },
      {
        title: 'defaultAgents.powerpointCreator.scenarios.training.title',
        prompt: 'defaultAgents.powerpointCreator.scenarios.training.prompt',
      },
      {
        title: 'defaultAgents.powerpointCreator.scenarios.designImprovement.title',
        prompt: 'defaultAgents.powerpointCreator.scenarios.designImprovement.prompt',
      },
      {
        title: 'defaultAgents.powerpointCreator.scenarios.templateBased.title',
        prompt: 'defaultAgents.powerpointCreator.scenarios.templateBased.prompt',
      },
    ],
    mcpConfig: {
      mcpServers: {
        ppt: {
          command: 'uvx',
          args: ['--from', 'office-powerpoint-mcp-server', 'ppt_mcp_server'],
        },
      },
    },
  },
  {
    name: 'defaultAgents.physicist.name',
    description: 'defaultAgents.physicist.description',
    icon: 'Atom',
    systemPrompt: `You are a highly skilled theoretical physicist with expertise in computational physics and Python programming. Your primary role is to help simulate, analyze, and visualize physics equations and phenomena using Python.

## Core Capabilities and Responsibilities

1. Create accurate physics simulations using Python (on CodeInterpreter Tool)
2. Implement numerical methods to solve differential equations
3. Visualize physics phenomena through graphs, animations, and interactive plots
4. Analyze and interpret simulation results with proper physical insights
5. Apply theoretical physics concepts to practical computational problems
6. Explain complex physics concepts clearly with mathematical rigor

## Physics Domains of Expertise

- Classical Mechanics (Newtonian, Lagrangian, Hamiltonian)
- Electromagnetism (Maxwell's equations, electromagnetic waves)
- Quantum Mechanics (Schrödinger equation, quantum systems)
- Statistical Mechanics and Thermodynamics
- Special and General Relativity
- Fluid Dynamics and Continuum Mechanics
- Astrophysics and Cosmology
- Solid State Physics and Materials Science

## Technical Skills

- **Python Libraries**: NumPy, SciPy, Matplotlib, Pandas, SymPy, Plotly
- **Numerical Methods**: Finite difference, Runge-Kutta, Monte Carlo, Finite element
- **Visualization Techniques**: 2D/3D plotting, animations, vector fields, contour plots
- **Mathematical Tools**: Linear algebra, calculus, differential equations, statistics
- **Data Analysis**: Signal processing, curve fitting, error analysis, statistical methods

## Response Format Guidelines

I will structure my responses to be:
- Mathematically rigorous with proper notation
- Physically insightful with clear explanations of underlying principles
- Computationally efficient with well-documented code
- Visually informative with appropriate plots and visualizations

## Visual Explanation Formats
- For diagrams: Mermaid.js format
- For images: Markdown format
- For mathematical equations: Katex

## Working with Files and Code

I'll help you work with physics simulations in your project. I can:
- Create new Python scripts for physics simulations
- Analyze existing code and suggest improvements
- Generate visualizations of physical phenomena
- Implement numerical solutions to physics problems
- Document code with proper physics explanations

When working with code, I'll ensure:
- Clear variable naming that reflects physical quantities
- Proper units and dimensional analysis
- Appropriate comments explaining the physics
- Efficient numerical implementations
- Thorough error handling and validation`,
    enabledTools: [
      'file_editor',
      's3_list_files',
      'tavily_search',
      'code_interpreter',
    ],
    scenarios: [
      {
        title: 'defaultAgents.physicist.scenarios.dampedOscillator.title',
        prompt: 'defaultAgents.physicist.scenarios.dampedOscillator.prompt',
      },
      {
        title: 'defaultAgents.physicist.scenarios.quantumWavePacket.title',
        prompt: 'defaultAgents.physicist.scenarios.quantumWavePacket.prompt',
      },
      {
        title: 'defaultAgents.physicist.scenarios.electricField.title',
        prompt: 'defaultAgents.physicist.scenarios.electricField.prompt',
      },
      {
        title: 'defaultAgents.physicist.scenarios.lorenzSystem.title',
        prompt: 'defaultAgents.physicist.scenarios.lorenzSystem.prompt',
      },
      {
        title: 'defaultAgents.physicist.scenarios.doublePendulum.title',
        prompt: 'defaultAgents.physicist.scenarios.doublePendulum.prompt',
      },
      {
        title: 'defaultAgents.physicist.scenarios.isingModel.title',
        prompt: 'defaultAgents.physicist.scenarios.isingModel.prompt',
      },
    ],
  },
];

/**
 * Agent list retrieval endpoint
 * GET /agents
 * JWT authentication required
 */
router.get('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    console.log(`📋 Agent list retrieval started (${auth.requestId}):`, {
      userId,
      username: auth.username,
    });

    const agentsService = createAgentsService();
    const agents = await agentsService.listAgents(userId);

    console.log(`✅ Agent list retrieval completed (${auth.requestId}): ${agents.length} items`);

    res.status(200).json({
      agents: agents.map((agent) => toFrontendAgent(agent)),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
        count: agents.length,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Agent list retrieval error (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to retrieve Agent list',
      requestId: auth.requestId,
    });
  }
});

/**
 * Specific Agent retrieval endpoint
 * GET /agents/:agentId
 * JWT authentication required
 */
router.get('/:agentId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const { agentId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    if (!agentId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Agent ID is not specified',
        requestId: auth.requestId,
      });
    }

    console.log(`🔍 Agent retrieval started (${auth.requestId}):`, {
      userId,
      username: auth.username,
      agentId,
    });

    const agentsService = createAgentsService();
    const agent = await agentsService.getAgent(userId, agentId);

    if (!agent) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found',
        requestId: auth.requestId,
      });
    }

    console.log(`✅ Agent retrieval completed (${auth.requestId}): ${agent.name}`);

    res.status(200).json({
      agent: toFrontendAgent(agent),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Agent retrieval error (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to retrieve Agent',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent creation endpoint
 * POST /agents
 * JWT authentication required
 */
router.post('/', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const input: CreateAgentInput = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    // Validation
    if (!input.name || !input.description || !input.systemPrompt || !input.enabledTools) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Required fields are missing',
        requestId: auth.requestId,
      });
    }

    console.log(`➕ Agent creation started (${auth.requestId}):`, {
      userId,
      username: auth.username,
      agentName: input.name,
    });

    const agentsService = createAgentsService();
    const agent = await agentsService.createAgent(userId, input, auth.username);

    console.log(`✅ Agent creation completed (${auth.requestId}): ${agent.agentId}`);

    res.status(201).json({
      agent: toFrontendAgent(agent),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Agent creation error (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to create Agent',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent update endpoint
 * PUT /agents/:agentId
 * JWT authentication required
 */
router.put('/:agentId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const { agentId } = req.params;
    const input: Partial<CreateAgentInput> = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    if (!agentId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Agent ID is not specified',
        requestId: auth.requestId,
      });
    }

    console.log(`📝 Agent update started (${auth.requestId}):`, {
      userId,
      username: auth.username,
      agentId,
    });

    const agentsService = createAgentsService();
    const updateInput: UpdateAgentInput = {
      agentId,
      ...input,
    };
    const agent = await agentsService.updateAgent(userId, updateInput);

    console.log(`✅ Agent update completed (${auth.requestId}): ${agent.name}`);

    res.status(200).json({
      agent: toFrontendAgent(agent),
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Agent update error (${auth.requestId}):`, error);

    if (error instanceof Error && error.message === 'Agent not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found',
        requestId: auth.requestId,
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to update Agent',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent deletion endpoint
 * DELETE /agents/:agentId
 * JWT authentication required
 */
router.delete('/:agentId', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;
    const { agentId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    if (!agentId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Agent ID is not specified',
        requestId: auth.requestId,
      });
    }

    console.log(`🗑️  Agent deletion started (${auth.requestId}):`, {
      userId,
      username: auth.username,
      agentId,
    });

    const agentsService = createAgentsService();
    await agentsService.deleteAgent(userId, agentId);

    console.log(`✅ Agent deletion completed (${auth.requestId}): ${agentId}`);

    res.status(200).json({
      success: true,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Agent deletion error (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to delete Agent',
      requestId: auth.requestId,
    });
  }
});

/**
 * Agent share status toggle endpoint
 * PUT /agents/:agentId/share
 * JWT authentication required
 */
router.put(
  '/:agentId/share',
  jwtAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auth = getCurrentAuth(req);
      const userId = auth.userId;
      const { agentId } = req.params;

      if (!userId) {
        return res.status(400).json({
          error: 'Invalid authentication',
          message: 'Failed to retrieve user ID',
          requestId: auth.requestId,
        });
      }

      if (!agentId) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Agent ID is not specified',
          requestId: auth.requestId,
        });
      }

      console.log(`🔄 Agent share status toggle started (${auth.requestId}):`, {
        userId,
        username: auth.username,
        agentId,
      });

      const agentsService = createAgentsService();
      const agent = await agentsService.toggleShare(userId, agentId);

      console.log(
        `✅ Agent share status toggle completed (${auth.requestId}): isShared=${agent.isShared}`
      );

      res.status(200).json({
        agent: toFrontendAgent(agent),
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          userId,
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error(`💥 Agent share status toggle error (${auth.requestId}):`, error);

      if (error instanceof Error && error.message === 'Agent not found') {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Agent not found',
          requestId: auth.requestId,
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to change Agent share status',
        requestId: auth.requestId,
      });
    }
  }
);

/**
 * Default Agent initialization endpoint
 * POST /agents/initialize
 * JWT authentication required
 * Create default Agents on first login
 */
router.post('/initialize', jwtAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const auth = getCurrentAuth(req);
    const userId = auth.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid authentication',
        message: 'Failed to retrieve user ID',
        requestId: auth.requestId,
      });
    }

    console.log(`🔧 Default Agent initialization started (${auth.requestId}):`, {
      userId,
      username: auth.username,
    });

    const agentsService = createAgentsService();

    // Check if existing Agents exist
    const existingAgents = await agentsService.listAgents(userId);

    if (existingAgents.length > 0) {
      console.log(`ℹ️  Skipping initialization because existing Agents exist (${auth.requestId})`);
      return res.status(200).json({
        agents: existingAgents.map((agent) => toFrontendAgent(agent)),
        skipped: true,
        message: 'Initialization skipped because existing Agents exist',
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          userId,
          count: existingAgents.length,
        },
      });
    }

    // Create default Agents
    const agents = await agentsService.initializeDefaultAgents(
      userId,
      DEFAULT_AGENTS,
      auth.username
    );

    console.log(
      `✅ Default Agent initialization completed (${auth.requestId}): ${agents.length} items`
    );

    res.status(201).json({
      agents: agents.map((agent) => toFrontendAgent(agent)),
      skipped: false,
      metadata: {
        requestId: auth.requestId,
        timestamp: new Date().toISOString(),
        userId,
        count: agents.length,
      },
    });
  } catch (error) {
    const auth = getCurrentAuth(req);
    console.error(`💥 Default Agent initialization error (${auth.requestId}):`, error);

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to initialize default Agents',
      requestId: auth.requestId,
    });
  }
});

/**
 * Shared Agent list retrieval endpoint (with pagination support)
 * GET /shared-agents/list
 * Query parameters:
 *   - q: Search query (optional)
 *   - limit: Number of items to retrieve (default: 20)
 *   - cursor: Pagination cursor (optional)
 * JWT authentication required
 *
 * Note: Default agents are included only on the first page (no cursor)
 */
router.get(
  '/shared-agents/list',
  jwtAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auth = getCurrentAuth(req);
      const { q: searchQuery, limit, cursor } = req.query;

      console.log(`📋 Shared Agent list retrieval started (${auth.requestId}):`, {
        searchQuery,
        limit,
        hasCursor: !!cursor,
      });

      // Convert DEFAULT_AGENTS to Agent format (system user)
      const defaultAgents: BackendAgent[] = DEFAULT_AGENTS.map((agent, index) => ({
        userId: 'system',
        agentId: `default-${index}`,
        name: agent.name,
        description: agent.description,
        icon: agent.icon,
        systemPrompt: agent.systemPrompt,
        enabledTools: agent.enabledTools,
        scenarios: agent.scenarios.map((scenario) => ({
          ...scenario,
          id: `default-${index}-scenario-${agent.scenarios.indexOf(scenario)}`,
        })),
        mcpConfig: agent.mcpConfig,
        createdAt: new Date('2025-01-01').toISOString(),
        updatedAt: new Date('2025-01-01').toISOString(),
        isShared: true,
        createdBy: 'System',
      }));

      const agentsService = createAgentsService();
      const result = await agentsService.listSharedAgents(
        limit ? parseInt(limit as string, 10) : 20,
        searchQuery as string | undefined,
        cursor as string | undefined
      );

      // Filter and add default agents only on first page (no cursor)
      let allAgents: BackendAgent[] = [];
      if (!cursor) {
        // Filter default agents by search query
        let filteredDefaultAgents = defaultAgents;
        if (searchQuery) {
          const query = (searchQuery as string).toLowerCase();
          filteredDefaultAgents = defaultAgents.filter(
            (agent) =>
              agent.name.toLowerCase().includes(query) ||
              agent.description.toLowerCase().includes(query)
          );
        }
        allAgents = [...filteredDefaultAgents, ...result.items];
      } else {
        allAgents = result.items;
      }

      console.log(
        `✅ Shared Agent list retrieval completed (${auth.requestId}): ${allAgents.length} items`
      );

      res.status(200).json({
        agents: allAgents.map((agent) => toFrontendAgent(agent, true)),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          count: allAgents.length,
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error(`💥 Shared Agent list retrieval error (${auth.requestId}):`, error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to retrieve shared Agent list',
        requestId: auth.requestId,
      });
    }
  }
);

/**
 * Shared Agent detail retrieval endpoint
 * GET /shared-agents/:userId/:agentId
 * JWT authentication required
 * Supports system agents (userId === 'system')
 */
router.get(
  '/shared-agents/:userId/:agentId',
  jwtAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auth = getCurrentAuth(req);
      const { userId, agentId } = req.params;

      if (!userId || !agentId) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'User ID or Agent ID is not specified',
          requestId: auth.requestId,
        });
      }

      console.log(`🔍 Shared Agent detail retrieval started (${auth.requestId}):`, {
        userId,
        agentId,
      });

      let agent: BackendAgent | null = null;

      // Handle system agents (default agents)
      if (userId === 'system' && agentId.startsWith('default-')) {
        const index = parseInt(agentId.replace('default-', '').split('-')[0], 10);
        const defaultAgent = DEFAULT_AGENTS[index];

        if (defaultAgent) {
          agent = {
            userId: 'system',
            agentId: `default-${index}`,
            name: defaultAgent.name,
            description: defaultAgent.description,
            icon: defaultAgent.icon,
            systemPrompt: defaultAgent.systemPrompt,
            enabledTools: defaultAgent.enabledTools,
            scenarios: defaultAgent.scenarios.map((scenario) => ({
              ...scenario,
              id: `default-${index}-scenario-${defaultAgent.scenarios.indexOf(scenario)}`,
            })),
            mcpConfig: defaultAgent.mcpConfig,
            createdAt: new Date('2025-01-01').toISOString(),
            updatedAt: new Date('2025-01-01').toISOString(),
            isShared: true,
            createdBy: 'System',
          };
        }
      } else {
        // Handle user-shared agents
        const agentsService = createAgentsService();
        agent = await agentsService.getSharedAgent(userId, agentId);
      }

      if (!agent) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Shared Agent not found',
          requestId: auth.requestId,
        });
      }

      console.log(`✅ Shared Agent detail retrieval completed (${auth.requestId}): ${agent.name}`);

      res.status(200).json({
        agent: toFrontendAgent(agent, true),
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error(`💥 Shared Agent detail retrieval error (${auth.requestId}):`, error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to retrieve shared Agent details',
        requestId: auth.requestId,
      });
    }
  }
);

/**
 * Shared Agent clone endpoint
 * POST /shared-agents/:userId/:agentId/clone
 * JWT authentication required
 * Supports cloning both user-shared agents and system agents
 */
router.post(
  '/shared-agents/:userId/:agentId/clone',
  jwtAuthMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const auth = getCurrentAuth(req);
      const targetUserId = auth.userId;
      const { userId: sourceUserId, agentId: sourceAgentId } = req.params;

      if (!targetUserId) {
        return res.status(400).json({
          error: 'Invalid authentication',
          message: 'Failed to retrieve user ID',
          requestId: auth.requestId,
        });
      }

      if (!sourceUserId || !sourceAgentId) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Source User ID or Agent ID is not specified',
          requestId: auth.requestId,
        });
      }

      console.log(`📥 Shared Agent clone started (${auth.requestId}):`, {
        targetUserId,
        targetUsername: auth.username,
        sourceUserId,
        sourceAgentId,
      });

      let sourceAgent: CreateAgentInput | null = null;

      // Handle system agents (default agents)
      if (sourceUserId === 'system' && sourceAgentId.startsWith('default-')) {
        const index = parseInt(sourceAgentId.replace('default-', '').split('-')[0], 10);
        const defaultAgent = DEFAULT_AGENTS[index];

        if (defaultAgent) {
          sourceAgent = defaultAgent;
        }
      }

      if (!sourceAgent) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Shared Agent not found',
          requestId: auth.requestId,
        });
      }

      const agentsService = createAgentsService();
      const clonedAgent = await agentsService.createAgent(targetUserId, sourceAgent, auth.username);

      console.log(`✅ Shared Agent clone completed (${auth.requestId}): ${clonedAgent.agentId}`);

      res.status(201).json({
        agent: toFrontendAgent(clonedAgent),
        metadata: {
          requestId: auth.requestId,
          timestamp: new Date().toISOString(),
          userId: targetUserId,
        },
      });
    } catch (error) {
      const auth = getCurrentAuth(req);
      console.error(`💥 Shared Agent clone error (${auth.requestId}):`, error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to clone shared Agent',
        requestId: auth.requestId,
      });
    }
  }
);

export default router;
