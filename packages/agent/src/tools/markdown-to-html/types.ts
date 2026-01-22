export interface MarkdownToHtmlOptions {
  inputPath: string;
  title?: string;
  outputPath?: string;
}

export interface ConversionResult {
  success: boolean;
  outputPath: string;
  message: string;
  [key: string]: unknown;
}
