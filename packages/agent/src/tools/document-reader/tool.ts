/**
 * Document Reader Tool - Extract text from PDF, Word, PowerPoint, Excel files
 */

import { tool } from '@strands-agents/sdk';
import { documentReaderDefinition } from '@fullstack-agentcore/tool-definitions';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { extname, basename } from 'path';
import { parseOffice } from 'officeparser';
import { logger } from '../../config/index.js';
import { getCurrentContext } from '../../context/request-context.js';
import {
  EXTENSION_FORMAT_MAP,
  MAX_FILE_SIZE,
  type DocumentFormat,
  type DocumentReaderResult,
} from './types.js';

/**
 * Detect document format from file extension
 */
function detectFormat(filePath: string): DocumentFormat | null {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_FORMAT_MAP[ext] ?? null;
}

/**
 * Format file size to human-readable string
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Extract text from document using officeparser
 */
async function extractText(buffer: Buffer): Promise<string> {
  const ast = await parseOffice(buffer);
  return ast.toText();
}

/**
 * Document Reader Tool
 */
export const documentReaderTool = tool({
  name: documentReaderDefinition.name,
  description: documentReaderDefinition.description,
  inputSchema: documentReaderDefinition.zodSchema,
  callback: async (input) => {
    const { filePath, maxLength = 50000 } = input;
    const fileName = basename(filePath);

    logger.info(`📄 Document reader started: ${fileName}`);

    try {
      // Wait for workspace sync to complete
      const context = getCurrentContext();
      if (context?.workspaceSync) {
        await context.workspaceSync.waitForInitialSync();
      }

      // Validate file extension
      const format = detectFormat(filePath);
      if (!format) {
        const supportedExts = Object.keys(EXTENSION_FORMAT_MAP).join(', ');
        const msg = `Unsupported file format. Supported formats: ${supportedExts}`;
        logger.warn(`⚠️ ${msg} - Path: ${filePath}`);
        return msg;
      }

      // Check file existence
      if (!existsSync(filePath)) {
        const msg = `File not found: ${filePath}`;
        logger.warn(`⚠️ ${msg}`);
        return msg;
      }

      // Check file size
      const fileStat = await stat(filePath);
      if (fileStat.size > MAX_FILE_SIZE) {
        const msg = `File too large (${formatFileSize(fileStat.size)}). Maximum allowed size: ${formatFileSize(MAX_FILE_SIZE)}`;
        logger.warn(`⚠️ ${msg} - Path: ${filePath}`);
        return msg;
      }

      if (fileStat.size === 0) {
        const msg = `File is empty: ${filePath}`;
        logger.warn(`⚠️ ${msg}`);
        return msg;
      }

      // Read file
      const buffer = await readFile(filePath);
      logger.info(`📄 File loaded: ${fileName} (${formatFileSize(fileStat.size)}, ${format})`);

      // Extract text
      let text: string;
      try {
        text = await extractText(buffer);
      } catch (parseError) {
        const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        logger.error(`❌ Failed to parse document: ${errorMsg}`);

        if (format === 'pdf') {
          return `Failed to extract text from PDF. This may be a scanned/image-only PDF. Try using the image_to_text tool instead.\nError: ${errorMsg}`;
        }
        return `Failed to parse document: ${errorMsg}`;
      }

      // Handle empty extraction
      if (!text || text.trim().length === 0) {
        if (format === 'pdf') {
          return `No text content found in PDF. This may be a scanned/image-only PDF. Try using the image_to_text tool instead.\nFile: ${fileName} (${formatFileSize(fileStat.size)})`;
        }
        return `No text content found in the document.\nFile: ${fileName} (${formatFileSize(fileStat.size)})`;
      }

      // Truncate if necessary
      const truncated = text.length > maxLength;
      const extractedText = truncated ? text.slice(0, maxLength) : text;

      const result: DocumentReaderResult = {
        success: true,
        text: extractedText,
        filePath,
        format,
        fileSize: fileStat.size,
        truncated,
      };

      logger.info(
        `✅ Document read successfully: ${fileName} - ${text.length} chars extracted${truncated ? ` (truncated to ${maxLength})` : ''}`
      );

      // Build response
      let response = `Document read successfully\n`;
      response += `File: ${fileName}\n`;
      response += `Format: ${format.toUpperCase()}\n`;
      response += `Size: ${formatFileSize(fileStat.size)}\n`;
      response += `Extracted: ${text.length} characters${truncated ? ` (truncated to ${maxLength})` : ''}\n`;
      response += `---\n`;
      response += extractedText;

      if (truncated) {
        response += `\n---\n⚠️ Text was truncated. ${text.length - maxLength} characters omitted. Increase maxLength to read more.`;
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Document reader error: ${errorMessage}`);
      return `Error reading document: ${errorMessage}`;
    }
  },
});
