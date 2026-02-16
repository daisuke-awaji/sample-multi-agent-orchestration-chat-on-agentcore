/**
 * Document Reader Tool - Type Definitions
 */

/**
 * Supported document formats
 */
export type DocumentFormat = 'pdf' | 'docx' | 'pptx' | 'xlsx';

/**
 * Mapping of file extensions to document formats
 */
export const EXTENSION_FORMAT_MAP: Record<string, DocumentFormat> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.pptx': 'pptx',
  '.xlsx': 'xlsx',
};

/**
 * Maximum file size in bytes (50MB)
 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Result of document reading
 */
export interface DocumentReaderResult {
  success: boolean;
  text: string;
  filePath: string;
  format: DocumentFormat;
  fileSize: number;
  truncated: boolean;
  error?: string;
}

/**
 * Default model ID for vision analysis
 */
export const DEFAULT_VISION_MODEL_ID = 'anthropic.claude-sonnet-4-5-20250929-v1:0';

/**
 * Default prompt for vision analysis
 */
export const DEFAULT_VISION_PROMPT =
  'Please analyze this document visually and extract all information including text, tables, charts, diagrams, images, and layout structure. ' +
  'Provide a comprehensive and detailed description of all visual elements and their content. ' +
  'For tables, reproduce the data in markdown table format. ' +
  'For charts and diagrams, describe the data and relationships shown.';

/**
 * Default prompt for PPTX slide vision analysis
 */
export const DEFAULT_PPTX_VISION_PROMPT =
  'Please analyze this presentation slide visually and extract all information including text, tables, charts, diagrams, images, and layout structure. ' +
  'Provide a comprehensive and detailed description of all visual elements and their content. ' +
  'For tables, reproduce the data in markdown table format. ' +
  'For charts and diagrams, describe the data and relationships shown.';

/**
 * Maximum number of PPTX slides to analyze with vision
 */
export const MAX_VISION_SLIDES = 50;

/**
 * Represents a single slide image extracted from a PPTX file
 */
export interface SlideImage {
  /** Slide number (1-based) */
  slideNumber: number;
  /** PNG image data buffer */
  data: Buffer;
  /** Image file path on disk */
  filePath: string;
}

/**
 * Result of vision analysis for a document or slide
 */
export interface VisionAnalysisResult {
  /** Whether the analysis was successful */
  success: boolean;
  /** The vision analysis description */
  description: string;
  /** Model ID used for analysis */
  modelId: string;
  /** Slide number (for PPTX, undefined for PDF) */
  slideNumber?: number;
  /** Error message if analysis failed */
  error?: string;
}

/**
 * Aggregated result of vision analysis for the entire document
 */
export interface DocumentVisionResult {
  /** Whether the overall analysis was successful */
  success: boolean;
  /** Individual results per page/slide */
  results: VisionAnalysisResult[];
  /** Total number of pages/slides analyzed */
  totalAnalyzed: number;
  /** Model ID used */
  modelId: string;
  /** Error message if the entire analysis failed */
  error?: string;
}
