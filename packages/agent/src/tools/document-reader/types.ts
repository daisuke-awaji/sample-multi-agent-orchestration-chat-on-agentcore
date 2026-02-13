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
