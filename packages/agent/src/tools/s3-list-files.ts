/**
 * S3 List Files Tool - Retrieve user storage file list
 */

import { tool } from '@strands-agents/sdk';
import { s3ListFilesDefinition } from '@moca/tool-definitions';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getCurrentContext, getCurrentStoragePath } from '../context/request-context.js';
import { logger } from '../config/index.js';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

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
 * Prevents path traversal attacks (../)
 */
function isPathWithinAllowedScope(inputPath: string, allowedBasePath: string): boolean {
  // Normalize paths
  const normalizedInput = normalizePath(inputPath);
  const normalizedBase = normalizePath(allowedBasePath);

  // Allow all if base path is root (empty string)
  if (!normalizedBase || normalizedBase === '/') {
    return true;
  }

  // Check if input path starts with base path or is the same
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
 * Convert date to relative time expression
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} days ago`;
  if (hours > 0) return `${hours} hours ago`;
  if (minutes > 0) return `${minutes} minutes ago`;
  return `${seconds} seconds ago`;
}

/**
 * Generate presigned URL for S3 object
 */
async function generatePresignedUrl(
  bucketName: string,
  key: string,
  expiresIn: number
): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[S3_LIST] Failed to generate presigned URL for ${key}: ${errorMessage}`);
    throw error;
  }
}

/**
 * Format expiry time in human-readable format
 */
function formatExpiryTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${seconds} seconds`;
}

type S3Item = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: Date;
  s3Key?: string;
  presignedUrl?: string;
};

type ValidatedContext = {
  userId: string;
  allowedStoragePath: string;
  bucketName: string;
};

/**
 * Validate auth/bucket context and return required values, or an error string
 */
function validateContext(): ValidatedContext | string {
  const context = getCurrentContext();
  if (!context?.userId) {
    logger.error('[S3_LIST] Failed to get user ID');
    return 'Error: User authentication information not found. Please log in again.';
  }
  const bucketName = process.env.USER_STORAGE_BUCKET_NAME;
  if (!bucketName) {
    logger.error('[S3_LIST] Bucket name not configured');
    return 'Error: Storage configuration incomplete (USER_STORAGE_BUCKET_NAME not set)';
  }
  return {
    userId: context.userId,
    allowedStoragePath: getCurrentStoragePath(),
    bucketName,
  };
}

/**
 * Build the S3 prefix for the requested path
 * Returns the resolved prefix and normalizedPath, or an error string
 */
function buildS3Prefix(
  path: string,
  userId: string,
  allowedStoragePath: string
): { prefix: string; normalizedPath: string } | string {
  let normalizedPath = normalizePath(path);
  const normalizedAllowedPath = normalizePath(allowedStoragePath);

  if (!normalizedPath || normalizedPath === '/' || normalizedPath === '') {
    normalizedPath = normalizedAllowedPath;
  }

  if (!isPathWithinAllowedScope(normalizedPath, allowedStoragePath)) {
    logger.warn(
      `[S3_LIST] Access denied: user=${userId}, requestPath=${path}, allowedPath=${allowedStoragePath}`
    );
    return `Access denied: The specified path "${path}" is outside the permitted directory ("${allowedStoragePath}").\n\nPlease specify a path under the allowed directory.`;
  }

  const basePrefix = normalizedAllowedPath
    ? `${getUserStoragePrefix(userId)}/${normalizedAllowedPath}`
    : getUserStoragePrefix(userId);

  const prefix =
    normalizedPath && normalizedPath !== normalizedAllowedPath
      ? `${basePrefix}/${normalizedPath.replace(normalizedAllowedPath + '/', '')}/`
      : `${basePrefix}${basePrefix.endsWith('/') ? '' : '/'}`;

  return { prefix, normalizedPath };
}

/**
 * List S3 objects with pagination, returning raw S3Item list (without presigned URLs)
 */
async function listS3Objects(
  bucketName: string,
  prefix: string,
  normalizedPath: string,
  recursive: boolean,
  maxResults: number
): Promise<S3Item[]> {
  const items: S3Item[] = [];

  if (recursive) {
    let continuationToken: string | undefined;
    let totalFetched = 0;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: Math.min(1000, maxResults - totalFetched),
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(command);

      if (response.Contents) {
        for (const content of response.Contents) {
          if (content.Key && content.Key !== prefix) {
            const relativePath = content.Key.replace(prefix, '');
            items.push({
              name: relativePath.split('/').pop() || relativePath,
              path: `/${normalizedPath}/${relativePath}`.replace(/\/+/g, '/'),
              type: content.Key.endsWith('/') ? 'directory' : 'file',
              size: content.Size,
              lastModified: content.LastModified,
              s3Key: content.Key,
            });
            totalFetched++;
            if (totalFetched >= maxResults) break;
          }
        }
      }

      continuationToken = response.NextContinuationToken;
      if (totalFetched >= maxResults) break;
    } while (continuationToken);
  } else {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      Delimiter: '/',
      MaxKeys: maxResults,
    });

    const response = await s3Client.send(command);

    if (response.CommonPrefixes) {
      for (const commonPrefix of response.CommonPrefixes) {
        if (commonPrefix.Prefix) {
          const name = commonPrefix.Prefix.replace(prefix, '').replace(/\/$/, '');
          items.push({
            name,
            path: `/${normalizedPath}/${name}`.replace(/\/+/g, '/'),
            type: 'directory',
          });
        }
      }
    }

    if (response.Contents) {
      for (const content of response.Contents) {
        if (content.Key && content.Key !== prefix) {
          const name = content.Key.replace(prefix, '');
          items.push({
            name,
            path: `/${normalizedPath}/${name}`.replace(/\/+/g, '/'),
            type: 'file',
            size: content.Size,
            lastModified: content.LastModified,
            s3Key: content.Key,
          });
        }
      }
    }
  }

  return items;
}

/**
 * Separate S3Item array into directories and files
 */
function categorizeObjects(items: S3Item[]): { directories: S3Item[]; files: S3Item[] } {
  return {
    directories: items.filter((item) => item.type === 'directory'),
    files: items.filter((item) => item.type === 'file'),
  };
}

/**
 * Build a directory entry line for the output
 */
function formatDirectoryEntry(dir: S3Item): string {
  return `  - ${dir.name}/\n    Path: ${dir.path}\n`;
}

/**
 * Build a file entry line for the output (presigned URL already set on item if requested)
 */
function formatFileEntry(file: S3Item): string {
  let entry = `  - ${file.name}\n    Path: ${file.path}\n`;
  if (file.size !== undefined) {
    entry += `    Size: ${formatFileSize(file.size)}\n`;
  }
  if (file.lastModified) {
    entry += `    Modified: ${formatRelativeTime(file.lastModified)} (${file.lastModified.toISOString()})\n`;
  }
  if (file.presignedUrl) {
    entry += `    URL: ${file.presignedUrl}\n`;
  }
  return entry;
}

/**
 * Assemble the final result string from categorized items
 */
function buildResultSummary(
  path: string,
  bucketName: string,
  prefix: string,
  recursive: boolean,
  includePresignedUrls: boolean,
  presignedUrlExpiry: number,
  directories: S3Item[],
  files: S3Item[]
): string {
  const totalItems = directories.length + files.length;

  if (totalItems === 0) {
    return `Directory is empty\nPath: ${path}\n\nNo files or directories found.`;
  }

  let output = `S3 Storage - File List\n`;
  output += `Path: ${path}\n`;
  output += `Bucket: ${bucketName}\n`;
  output += `Prefix: ${prefix}\n`;
  output += `Mode: ${recursive ? 'Recursive' : 'Current directory only'}\n`;
  output += `Total: ${totalItems} items\n`;
  if (includePresignedUrls) {
    output += `Presigned URLs: Enabled (expires in ${formatExpiryTime(presignedUrlExpiry)})\n`;
  }
  output += `\n`;

  if (directories.length > 0) {
    output += `Directories (${directories.length}):\n`;
    directories.forEach((dir) => {
      output += formatDirectoryEntry(dir);
    });
    output += `\n`;
  }

  if (files.length > 0) {
    output += `Files (${files.length}):\n`;
    files.forEach((file) => {
      output += formatFileEntry(file);
    });
  }

  logger.info(
    `[S3_LIST] File list retrieval complete: ${totalItems} items (directories: ${directories.length}, files: ${files.length})`
  );

  return output.trim();
}

/**
 * S3 List Files Tool
 */
export const s3ListFilesTool = tool({
  name: s3ListFilesDefinition.name,
  description: s3ListFilesDefinition.description,
  inputSchema: s3ListFilesDefinition.zodSchema,
  callback: async (input) => {
    const { path, recursive, maxResults, includePresignedUrls, presignedUrlExpiry } = input;

    const ctx = validateContext();
    if (typeof ctx === 'string') return ctx;
    const { userId, allowedStoragePath, bucketName } = ctx;

    const prefixResult = buildS3Prefix(path, userId, allowedStoragePath);
    if (typeof prefixResult === 'string') return prefixResult;
    const { prefix, normalizedPath } = prefixResult;

    logger.info(
      `[S3_LIST] File list retrieval: user=${userId}, path=${path}, allowedPath=${allowedStoragePath}, recursive=${recursive}`
    );

    try {
      const items = await listS3Objects(bucketName, prefix, normalizedPath, recursive, maxResults);

      if (includePresignedUrls) {
        logger.info(
          `[S3_LIST] Generating presigned URLs for ${items.filter((i) => i.type === 'file').length} files (expiry: ${presignedUrlExpiry}s)`
        );
        for (const item of items) {
          if (item.type === 'file' && item.s3Key) {
            try {
              item.presignedUrl = await generatePresignedUrl(bucketName, item.s3Key, presignedUrlExpiry);
            } catch (error) {
              logger.warn(`[S3_LIST] Skipping presigned URL for ${item.name}: ${error}`);
            }
          }
        }
        logger.info('[S3_LIST] Presigned URL generation complete');
      }

      const { directories, files } = categorizeObjects(items);
      return buildResultSummary(
        path,
        bucketName,
        prefix,
        recursive,
        includePresignedUrls,
        presignedUrlExpiry,
        directories,
        files
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[S3_LIST] File list retrieval error: ${errorMessage}`);

      return `Error occurred while retrieving file list
Path: ${path}
Error: ${errorMessage}

Possible causes:
1. The specified path does not exist
2. No access permission to S3 bucket
3. Network connection problem
4. AWS credentials issue`;
    }
  },
});
