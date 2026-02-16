/**
 * Document Reader Tool - Extract text from PDF, Word, PowerPoint, Excel files
 * with optional AI vision analysis for PDF and PPTX
 */

import { tool } from '@strands-agents/sdk';
import { documentReaderDefinition } from '@fullstack-agentcore/tool-definitions';
import { readFile, stat, readdir, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { extname, basename, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { parseOffice } from 'officeparser';
import * as XLSX from 'xlsx';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type DocumentBlock,
  type ImageBlock,
} from '@aws-sdk/client-bedrock-runtime';
import { config, logger } from '../../config/index.js';
import { getCurrentContext } from '../../context/request-context.js';
import {
  EXTENSION_FORMAT_MAP,
  MAX_FILE_SIZE,
  MAX_VISION_SLIDES,
  DEFAULT_VISION_PROMPT,
  DEFAULT_PPTX_VISION_PROMPT,
  type DocumentFormat,
  type SlideImage,
  type VisionAnalysisResult,
  type DocumentVisionResult,
} from './types.js';

const execFileAsync = promisify(execFile);

// Lazy-initialized Bedrock Runtime client for vision analysis
let bedrockClient: BedrockRuntimeClient | null = null;

/**
 * Get or create the Bedrock Runtime client
 */
function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({ region: config.BEDROCK_REGION });
  }
  return bedrockClient;
}

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
 * Extract text from XLSX using SheetJS
 */
function extractXlsxText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    parts.push(`## ${sheetName}`);
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(csv);
  }

  return parts.join('\n');
}

/**
 * Extract text from document using officeparser (PDF, DOCX, PPTX)
 */
async function extractTextWithOfficeParser(buffer: Buffer): Promise<string> {
  const ast = await parseOffice(buffer);
  return ast.toText();
}

// ============================================================
// Vision Analysis Functions
// ============================================================

/**
 * Analyze a PDF document visually using Bedrock Converse API document block
 */
async function analyzePdfWithVision(
  buffer: Buffer,
  fileName: string,
  modelId: string,
  prompt: string
): Promise<DocumentVisionResult> {
  try {
    logger.info(`🔍 Starting PDF vision analysis: ${fileName} with model ${modelId}`);

    const client = getBedrockClient();

    // Build document block for PDF
    const documentBlock: DocumentBlock = {
      format: 'pdf',
      name: fileName.replace(/[^a-zA-Z0-9\-_.]/g, '_').replace(/\.pdf$/i, ''),
      source: {
        bytes: buffer,
      },
    };

    // Build content blocks
    const contentBlocks: ContentBlock[] = [{ document: documentBlock }, { text: prompt }];

    const command = new ConverseCommand({
      modelId,
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
      inferenceConfig: {
        maxTokens: 8192,
        temperature: 0.1,
      },
    });

    const startTime = Date.now();
    const response = await client.send(command);
    const duration = Date.now() - startTime;

    // Extract text from response
    const outputContent = response.output?.message?.content;
    if (!outputContent || outputContent.length === 0) {
      throw new Error('Empty response from model');
    }

    const textBlock = outputContent.find((block) => 'text' in block);
    if (!textBlock || !('text' in textBlock) || !textBlock.text) {
      throw new Error('No text content in response');
    }

    const description = textBlock.text;

    logger.info(
      `✅ PDF vision analysis completed in ${duration}ms, response length: ${description.length} chars`
    );

    return {
      success: true,
      results: [
        {
          success: true,
          description,
          modelId,
        },
      ],
      totalAnalyzed: 1,
      modelId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ PDF vision analysis failed: ${errorMessage}`);
    return {
      success: false,
      results: [],
      totalAnalyzed: 0,
      modelId,
      error: errorMessage,
    };
  }
}

/**
 * Convert PPTX slides to PNG images using LibreOffice headless mode
 */
async function convertPptxToImages(pptxPath: string): Promise<SlideImage[]> {
  const tempDir = join('/tmp', `document-reader-${randomUUID()}`);

  try {
    // Create temporary directory for output
    await mkdir(tempDir, { recursive: true });

    logger.info(`🔄 Converting PPTX to images: ${basename(pptxPath)} → ${tempDir}`);

    // Execute LibreOffice headless conversion
    await execFileAsync('libreoffice', [
      '--headless',
      '--convert-to',
      'png',
      '--outdir',
      tempDir,
      pptxPath,
    ]);

    // Read generated PNG files
    const files = await readdir(tempDir);
    const pngFiles = files.filter((f) => f.toLowerCase().endsWith('.png')).sort();

    if (pngFiles.length === 0) {
      throw new Error(
        'LibreOffice produced no PNG output. Ensure LibreOffice is installed and the PPTX file is valid.'
      );
    }

    logger.info(`📸 Generated ${pngFiles.length} slide image(s)`);

    // Read each PNG into a SlideImage
    const slideImages: SlideImage[] = [];
    for (let i = 0; i < pngFiles.length && i < MAX_VISION_SLIDES; i++) {
      const pngPath = join(tempDir, pngFiles[i]);
      const data = await readFile(pngPath);
      slideImages.push({
        slideNumber: i + 1,
        data,
        filePath: pngPath,
      });
    }

    return slideImages;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check if LibreOffice is available
    if (
      errorMessage.includes('ENOENT') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('spawn libreoffice')
    ) {
      throw new Error(
        'LibreOffice is not installed or not found in PATH. ' +
          'LibreOffice is required for PPTX vision analysis. ' +
          'Install with: apt-get install libreoffice-impress'
      );
    }

    throw new Error(`Failed to convert PPTX to images: ${errorMessage}`);
  }
}

/**
 * Clean up temporary directory created during PPTX conversion
 */
async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Non-critical: log and continue
    logger.warn(`⚠️ Failed to clean up temp directory: ${tempDir}`);
  }
}

/**
 * Analyze a single slide image using Bedrock Converse API
 */
async function analyzeSlideImage(
  slideImage: SlideImage,
  modelId: string,
  prompt: string
): Promise<VisionAnalysisResult> {
  try {
    const client = getBedrockClient();

    // Build image block
    const imageBlock: ImageBlock = {
      format: 'png',
      source: {
        bytes: slideImage.data,
      },
    };

    // Build content blocks
    const contentBlocks: ContentBlock[] = [
      { image: imageBlock },
      { text: `Slide ${slideImage.slideNumber}: ${prompt}` },
    ];

    const command = new ConverseCommand({
      modelId,
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0.1,
      },
    });

    const startTime = Date.now();
    const response = await client.send(command);
    const duration = Date.now() - startTime;

    // Extract text from response
    const outputContent = response.output?.message?.content;
    if (!outputContent || outputContent.length === 0) {
      throw new Error('Empty response from model');
    }

    const textBlock = outputContent.find((block) => 'text' in block);
    if (!textBlock || !('text' in textBlock) || !textBlock.text) {
      throw new Error('No text content in response');
    }

    logger.debug(`✅ Slide ${slideImage.slideNumber} analysis completed in ${duration}ms`);

    return {
      success: true,
      description: textBlock.text,
      modelId,
      slideNumber: slideImage.slideNumber,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ Slide ${slideImage.slideNumber} analysis failed: ${errorMessage}`);
    return {
      success: false,
      description: '',
      modelId,
      slideNumber: slideImage.slideNumber,
      error: errorMessage,
    };
  }
}

/**
 * Analyze PPTX slides visually using LibreOffice conversion + Bedrock Converse API
 */
async function analyzePptxWithVision(
  pptxPath: string,
  modelId: string,
  prompt: string
): Promise<DocumentVisionResult> {
  let tempDir: string | null = null;

  try {
    logger.info(`🔍 Starting PPTX vision analysis: ${basename(pptxPath)} with model ${modelId}`);

    // Step 1: Convert PPTX to PNG images
    const slideImages = await convertPptxToImages(pptxPath);

    // Remember temp dir for cleanup
    if (slideImages.length > 0) {
      tempDir = join(slideImages[0].filePath, '..');
    }

    logger.info(`📊 Analyzing ${slideImages.length} slide(s) with vision model...`);

    // Step 2: Analyze each slide image sequentially
    // (Sequential to avoid rate limiting on Bedrock API)
    const results: VisionAnalysisResult[] = [];
    for (const slideImage of slideImages) {
      const result = await analyzeSlideImage(slideImage, modelId, prompt);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    logger.info(
      `✅ PPTX vision analysis completed: ${successCount}/${slideImages.length} slides analyzed successfully`
    );

    return {
      success: successCount > 0,
      results,
      totalAnalyzed: slideImages.length,
      modelId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ PPTX vision analysis failed: ${errorMessage}`);
    return {
      success: false,
      results: [],
      totalAnalyzed: 0,
      modelId,
      error: errorMessage,
    };
  } finally {
    // Clean up temporary files
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}

/**
 * Format vision analysis results into a readable string
 */
function formatVisionResults(visionResult: DocumentVisionResult, format: DocumentFormat): string {
  if (!visionResult.success) {
    return `⚠️ Vision analysis failed: ${visionResult.error || 'Unknown error'}`;
  }

  const parts: string[] = [];

  if (format === 'pdf') {
    // PDF: single document analysis result
    const result = visionResult.results[0];
    if (result?.success) {
      parts.push(result.description);
    } else {
      parts.push(`⚠️ Vision analysis failed: ${result?.error || 'Unknown error'}`);
    }
  } else if (format === 'pptx') {
    // PPTX: per-slide analysis results
    for (const result of visionResult.results) {
      parts.push(`### Slide ${result.slideNumber}`);
      if (result.success) {
        parts.push(result.description);
      } else {
        parts.push(`⚠️ Analysis failed: ${result.error || 'Unknown error'}`);
      }
      parts.push('');
    }
  }

  return parts.join('\n');
}

// ============================================================
// Main Tool
// ============================================================

/**
 * Document Reader Tool
 */
export const documentReaderTool = tool({
  name: documentReaderDefinition.name,
  description: documentReaderDefinition.description,
  inputSchema: documentReaderDefinition.zodSchema,
  callback: async (input) => {
    const {
      filePath,
      maxLength = 50000,
      enableVision = false,
      visionModelId = 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      visionPrompt,
    } = input;
    const fileName = basename(filePath);

    logger.info(
      `📄 Document reader started: ${fileName}${enableVision ? ' (vision enabled)' : ''}`
    );

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

      // Extract text based on format
      let text: string;
      try {
        if (format === 'xlsx') {
          text = extractXlsxText(buffer);
        } else {
          text = await extractTextWithOfficeParser(buffer);
        }
      } catch (parseError) {
        const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        logger.error(`❌ Failed to parse document: ${errorMsg}`);

        if (format === 'pdf') {
          return `Failed to extract text from PDF. This may be a scanned/image-only PDF. Try using enableVision=true or the image_to_text tool instead.\nError: ${errorMsg}`;
        }
        return `Failed to parse document: ${errorMsg}`;
      }

      // Handle empty extraction
      if (!text || text.trim().length === 0) {
        const isVisionSupported = format === 'pdf' || format === 'pptx';
        if (format === 'pdf') {
          if (enableVision) {
            // Text extraction failed but vision is enabled — proceed with vision only
            logger.info(`📄 No text content in PDF, proceeding with vision analysis only`);
          } else {
            return `No text content found in PDF. This may be a scanned/image-only PDF. Try using enableVision=true or the image_to_text tool instead.\nFile: ${fileName} (${formatFileSize(fileStat.size)})`;
          }
        } else if (!enableVision || !isVisionSupported) {
          return `No text content found in the document.\nFile: ${fileName} (${formatFileSize(fileStat.size)})`;
        }
      }

      // Truncate if necessary
      const truncated = text.length > maxLength;
      const extractedText = truncated ? text.slice(0, maxLength) : text;

      logger.info(
        `✅ Document read successfully: ${fileName} - ${text.length} chars extracted${truncated ? ` (truncated to ${maxLength})` : ''}`
      );

      // Build response
      let response = '';

      // Vision analysis (if enabled and format supports it)
      let visionResult: DocumentVisionResult | null = null;
      if (enableVision && (format === 'pdf' || format === 'pptx')) {
        const effectivePrompt =
          visionPrompt || (format === 'pptx' ? DEFAULT_PPTX_VISION_PROMPT : DEFAULT_VISION_PROMPT);

        if (format === 'pdf') {
          visionResult = await analyzePdfWithVision(
            buffer,
            fileName,
            visionModelId,
            effectivePrompt
          );
        } else if (format === 'pptx') {
          visionResult = await analyzePptxWithVision(filePath, visionModelId, effectivePrompt);
        }
      }

      // Build response header
      if (visionResult) {
        response += `Document read successfully (with Vision analysis)\n`;
      } else {
        response += `Document read successfully\n`;
      }
      response += `File: ${fileName}\n`;
      response += `Format: ${format.toUpperCase()}\n`;
      response += `Size: ${formatFileSize(fileStat.size)}\n`;
      response += `Extracted: ${text.length} characters${truncated ? ` (truncated to ${maxLength})` : ''}\n`;

      if (visionResult) {
        response += `Vision Model: ${visionModelId}\n`;
        if (format === 'pptx' && visionResult.totalAnalyzed > 0) {
          response += `Slides Analyzed: ${visionResult.totalAnalyzed}\n`;
        }
      }

      // Text extraction section
      response += `---\n`;
      if (visionResult) {
        response += `## Text Extraction\n`;
      }
      response += extractedText;

      if (truncated) {
        response += `\n---\n⚠️ Text was truncated. ${text.length - maxLength} characters omitted. Increase maxLength to read more.`;
      }

      // Vision analysis section
      if (visionResult) {
        response += `\n\n---\n`;
        response += `## Vision Analysis\n`;
        response += formatVisionResults(visionResult, format);
      }

      // Warning for unsupported vision format
      if (enableVision && format !== 'pdf' && format !== 'pptx') {
        response += `\n\n⚠️ Vision analysis is only supported for PDF and PPTX formats. Text extraction was performed normally.`;
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Document reader error: ${errorMessage}`);
      return `Error reading document: ${errorMessage}`;
    }
  },
});
