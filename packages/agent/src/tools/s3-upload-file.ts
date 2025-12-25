/**
 * S3 Upload File Tool - File upload
 */

import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getCurrentContext, getCurrentStoragePath } from '../context/request-context.js';
import { logger } from '../config/index.js';
import { readFile, stat } from 'fs/promises';
import { fileURLToPath } from 'url';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

// Maximum file size considering Bedrock Converse API limits
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Generate user storage path prefix
 */
function getUserStoragePrefix(userId: string): string {
  return `users/${userId}`;
}

/**
 * Normalize path (remove leading/trailing slashes)
 */
function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

/**
 * Verify if path is within allowed scope
 */
function isPathWithinAllowedScope(inputPath: string, allowedBasePath: string): boolean {
  const normalizedInput = normalizePath(inputPath);
  const normalizedBase = normalizePath(allowedBasePath);

  if (!normalizedBase || normalizedBase === '/') {
    return true;
  }

  return normalizedInput === normalizedBase || normalizedInput.startsWith(normalizedBase + '/');
}

/**
 * Convert file size to human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Guess Content-Type from file extension
 */
function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const contentTypeMap: Record<string, string> = {
    // Text files
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    html: 'text/html',
    css: 'text/css',
    xml: 'application/xml',

    // Programming languages
    js: 'application/javascript',
    ts: 'application/typescript',
    json: 'application/json',
    py: 'text/x-python',
    java: 'text/x-java',
    cpp: 'text/x-c++src',
    c: 'text/x-c',
    go: 'text/x-go',
    rs: 'text/x-rust',

    // Configuration files
    yaml: 'application/x-yaml',
    yml: 'application/x-yaml',
    toml: 'application/toml',
    ini: 'text/plain',
    conf: 'text/plain',

    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',

    // Others
    zip: 'application/zip',
    tar: 'application/x-tar',
    gz: 'application/gzip',
  };

  return ext && contentTypeMap[ext] ? contentTypeMap[ext] : 'application/octet-stream';
}

/**
 * Parse file path from file:// protocol or regular path
 */
function parseFilePath(filePathOrUrl: string): string {
  if (filePathOrUrl.startsWith('file://')) {
    return fileURLToPath(filePathOrUrl);
  }
  return filePathOrUrl;
}

/**
 * S3 Upload File Tool
 */
export const s3UploadFileTool = tool({
  name: 's3_upload_file',
  description:
    'Upload text content or local files to user S3 storage. Supports two upload methods: 1) Direct text content upload for code, documents, etc. 2) Local file upload (including binary files like images, PDFs) by specifying sourceFile path. Note: When uploading files with Japanese or non-ASCII characters, specify contentType with charset (e.g., "text/plain; charset=utf-8") to ensure proper encoding.',
  inputSchema: z
    .object({
      path: z
        .string()
        .describe(
          'Destination file path (required). Example: "/notes/memo.txt", "/images/photo.jpg"'
        ),
      content: z
        .string()
        .optional()
        .describe('File content (optional). Text-based content for direct upload'),
      sourceFile: z
        .string()
        .optional()
        .describe(
          'Local file path to upload (optional). Supports file:// protocol or absolute path. Example: "file:///tmp/image.png" or "/tmp/image.png"'
        ),
      contentType: z
        .string()
        .optional()
        .describe(
          'MIME type (optional). Auto-detected from filename if not specified. Example: "text/plain", "application/json", "image/jpeg"'
        ),
    })
    .refine((data) => data.content !== undefined || data.sourceFile !== undefined, {
      message: 'Either content or sourceFile must be provided',
    })
    .refine((data) => !(data.content !== undefined && data.sourceFile !== undefined), {
      message: 'Cannot specify both content and sourceFile',
    }),
  callback: async (input) => {
    const { path, content, sourceFile, contentType } = input;

    // Get user ID and storage path from request context
    const context = getCurrentContext();
    if (!context?.userId) {
      logger.error('[S3_UPLOAD] Failed to get user ID');
      return 'Error: User authentication information not found. Please log in again.';
    }

    const userId = context.userId;
    const allowedStoragePath = getCurrentStoragePath();
    const bucketName = process.env.USER_STORAGE_BUCKET_NAME;

    if (!bucketName) {
      logger.error('[S3_UPLOAD] Bucket name not configured');
      return 'Error: Storage configuration incomplete (USER_STORAGE_BUCKET_NAME not set)';
    }

    // Path processing and validation (NFD normalization to match S3 keys)
    // macOS and S3 often store in NFD format
    const normalizedPath = normalizePath(path).normalize('NFD');
    if (!isPathWithinAllowedScope(normalizedPath, allowedStoragePath)) {
      logger.warn(
        `[S3_UPLOAD] Access denied: user=${userId}, requestPath=${path}, allowedPath=${allowedStoragePath}`
      );
      return `Access denied: The specified path "${path}" is outside the permitted directory ("${allowedStoragePath}").`;
    }

    const key = `${getUserStoragePrefix(userId)}/${normalizedPath}`;
    const filename = normalizedPath.split('/').pop() || 'unknown';

    let uploadBody: Buffer | string;
    let contentSize: number;
    let uploadSource: string;

    try {
      // Handle sourceFile upload (binary or text files)
      if (sourceFile) {
        const localPath = parseFilePath(sourceFile);

        logger.info(`[S3_UPLOAD] Reading local file: ${localPath}`);

        try {
          // Check file exists and get size
          const fileStats = await stat(localPath);
          contentSize = fileStats.size;

          // Check file size before reading
          if (contentSize > MAX_UPLOAD_SIZE) {
            logger.warn(
              `[S3_UPLOAD] File size too large: ${formatFileSize(contentSize)} > ${formatFileSize(MAX_UPLOAD_SIZE)}`
            );
            return `File size too large
File: ${localPath}
Size: ${formatFileSize(contentSize)}
Maximum allowed size: ${formatFileSize(MAX_UPLOAD_SIZE)}

Please use a smaller file.`;
          }

          // Read file as binary buffer
          uploadBody = await readFile(localPath);
          uploadSource = `local file: ${localPath}`;

          logger.info(`[S3_UPLOAD] File read successfully: ${formatFileSize(contentSize)}`);
        } catch (fileError: unknown) {
          const errorMessage = fileError instanceof Error ? fileError.message : 'Unknown error';
          logger.error(`[S3_UPLOAD] Failed to read local file: ${errorMessage}`);

          return `Failed to read local file
File: ${localPath}
Error: ${errorMessage}

Possible causes:
1. File does not exist
2. No read permission
3. Invalid file path
4. File is locked by another process`;
        }
      }
      // Handle text content upload
      else if (content !== undefined) {
        uploadBody = content;
        contentSize = Buffer.byteLength(content, 'utf-8');
        uploadSource = 'text content';

        // Check size for text content
        if (contentSize > MAX_UPLOAD_SIZE) {
          logger.warn(
            `[S3_UPLOAD] Content size too large: ${formatFileSize(contentSize)} > ${formatFileSize(MAX_UPLOAD_SIZE)}`
          );
          return `Content size too large
Attempted upload size: ${formatFileSize(contentSize)}
Maximum allowed size: ${formatFileSize(MAX_UPLOAD_SIZE)}

Please split into smaller files or reduce content.`;
        }
      } else {
        // This should not happen due to schema validation
        return 'Error: Either content or sourceFile must be provided';
      }

      // Determine Content-Type
      const finalContentType = contentType || guessContentType(filename);

      logger.info(
        `[S3_UPLOAD] File upload: user=${userId}, path=${path}, source=${uploadSource}, allowedPath=${allowedStoragePath}, size=${formatFileSize(contentSize)}, type=${finalContentType}`
      );

      // Upload file to S3
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: uploadBody,
        ContentType: finalContentType,
        // Metadata
        Metadata: {
          'uploaded-by': 'ai-agent',
          'upload-timestamp': new Date().toISOString(),
          'upload-source': sourceFile ? 'local-file' : 'text-content',
        },
      });

      await s3Client.send(command);

      logger.info(`[S3_UPLOAD] Upload complete: ${key}`);

      // Generate presigned URL for download
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const expiresIn = 3600; // 1 hour
      const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn });
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      logger.info(`[S3_UPLOAD] Presigned URL generated: expires=${expiresIn}s`);

      return `File uploaded to S3 successfully

File: ${path}
Source: ${uploadSource}
Size: ${formatFileSize(contentSize)}
Type: ${finalContentType}
Upload Time: ${new Date().toISOString()}

Download URL:
${downloadUrl}

Expires: ${expiresIn / 60} minutes (${expiresAt.toISOString()})

File has been saved successfully.
You can download the file using the above URL.`;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[S3_UPLOAD] S3 upload error: ${errorMessage}`);

      return `Error occurred during S3 upload
Destination: ${path}
Source: ${sourceFile || 'text content'}
Error: ${errorMessage}

Possible causes:
1. No write permission to S3 bucket
2. Invalid file path (contains unusable characters)
3. Network connection problem
4. AWS credentials issue`;
    }
  },
});
