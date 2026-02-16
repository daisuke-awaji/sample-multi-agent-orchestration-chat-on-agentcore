export { executeCommandTool } from './execute-command.js';
export { tavilySearchTool } from './tavily-search.js';
export { tavilyExtractTool } from './tavily-extract.js';
export { tavilyCrawlTool } from './tavily-crawl.js';
export { createStrandsToolFromMCP, convertMCPToolsToStrands } from './mcp-converter.js';
export { codeInterpreterTool } from './code-interpreter/index.js';
export { s3ListFilesTool } from './s3-list-files.js';
export { fileEditorTool } from './file-editor.js';
export { novaCanvasTool } from './nova-canvas/index.js';
export { imageToTextTool } from './image-to-text/index.js';
export { novaReelTool } from './nova-reel/index.js';
export { callAgentTool } from './call-agent.js';
export { manageAgentTool } from './manage-agent.js';
export { thinkTool } from './think.js';

// ローカルツール配列のインポート
import { executeCommandTool } from './execute-command.js';
import { tavilySearchTool } from './tavily-search.js';
import { tavilyExtractTool } from './tavily-extract.js';
import { tavilyCrawlTool } from './tavily-crawl.js';
import { codeInterpreterTool } from './code-interpreter/index.js';
import { s3ListFilesTool } from './s3-list-files.js';
import { fileEditorTool } from './file-editor.js';
import { novaCanvasTool } from './nova-canvas/index.js';
import { imageToTextTool } from './image-to-text/index.js';
import { novaReelTool } from './nova-reel/index.js';
import { callAgentTool } from './call-agent.js';
import { manageAgentTool } from './manage-agent.js';
import { thinkTool } from './think.js';

/**
 * Agent に内蔵されるローカルツール一覧
 * 新しいツールを追加する場合はここに追加
 */
export const localTools = [
  executeCommandTool,
  tavilySearchTool,
  tavilyExtractTool,
  tavilyCrawlTool,
  codeInterpreterTool,
  s3ListFilesTool,
  fileEditorTool,
  novaCanvasTool,
  imageToTextTool,
  novaReelTool,
  callAgentTool,
  manageAgentTool,
  thinkTool,
];
