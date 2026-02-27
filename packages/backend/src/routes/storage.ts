/**
 * Storage Routes
 * API for user file storage
 */

import { Router, Response } from 'express';
import { jwtAuthMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import * as storageService from '../services/s3-storage.js';

const router = Router();

// Apply JWT authentication to all routes
router.use(jwtAuthMiddleware);

/**
 * GET /storage/list
 * Get list of files and folders in a directory
 */
router.get('/list', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    const path = (req.query.path as string) || '/';

    const result = await storageService.listStorageItems(userId, path);

    res.status(200).json(result);
  } catch (error) {
    console.error('❌ Storage list error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to list storage items',
    });
  }
});

/**
 * GET /storage/size
 * Recursively calculate the total size of all files in a directory
 */
router.get('/size', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    const path = (req.query.path as string) || '/';

    const result = await storageService.getDirectorySize(userId, path);

    res.status(200).json(result);
  } catch (error) {
    console.error('❌ Storage size calculation error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to calculate directory size',
    });
  }
});

/**
 * POST /storage/upload
 * Generate a pre-signed URL for file upload
 */
router.post('/upload', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    const { fileName, path, contentType } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'Bad Request', message: 'fileName is required' });
    }

    const result = await storageService.generateUploadUrl(userId, fileName, path, contentType);

    res.status(200).json(result);
  } catch (error) {
    console.error('❌ Storage upload URL generation error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to generate upload URL',
    });
  }
});

/**
 * POST /storage/directory
 * Create a new directory
 */
router.post('/directory', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    const { directoryName, path } = req.body;

    if (!directoryName) {
      return res.status(400).json({ error: 'Bad Request', message: 'directoryName is required' });
    }

    const result = await storageService.createDirectory(userId, directoryName, path);

    res.status(201).json(result);
  } catch (error) {
    console.error('❌ Storage directory creation error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to create directory',
    });
  }
});

/**
 * DELETE /storage/file
 * Delete a file
 */
router.delete('/file', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    const path = req.query.path as string;

    if (!path) {
      return res.status(400).json({ error: 'Bad Request', message: 'path is required' });
    }

    const result = await storageService.deleteFile(userId, path);

    res.status(200).json(result);
  } catch (error) {
    console.error('❌ Storage file deletion error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to delete file',
    });
  }
});

/**
 * DELETE /storage/directory
 * Delete a directory
 * With query parameter force=true, deletes all files within the directory as well
 */
router.delete('/directory', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    const path = req.query.path as string;
    const force = req.query.force === 'true';

    if (!path) {
      return res.status(400).json({ error: 'Bad Request', message: 'path is required' });
    }

    const result = await storageService.deleteDirectory(userId, path, force);

    res.status(200).json(result);
  } catch (error) {
    console.error('❌ Storage directory deletion error:', error);

    if (error instanceof Error && error.message === 'Directory is not empty') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Directory is not empty',
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to delete directory',
    });
  }
});

/**
 * GET /storage/download
 * Generate a pre-signed URL for file download
 */
router.get('/download', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    const path = req.query.path as string;

    if (!path) {
      return res.status(400).json({ error: 'Bad Request', message: 'path is required' });
    }

    const downloadUrl = await storageService.generateDownloadUrl(userId, path);

    res.status(200).json({ downloadUrl });
  } catch (error) {
    console.error('❌ Storage download URL generation error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to generate download URL',
    });
  }
});

/**
 * GET /storage/tree
 * Get folder tree structure
 */
router.get('/tree', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    const tree = await storageService.getFolderTree(userId);

    res.status(200).json({ tree });
  } catch (error) {
    console.error('❌ Storage tree generation error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to generate folder tree',
    });
  }
});

/**
 * GET /storage/download-folder
 * Get pre-signed URLs for all files in a folder (for ZIP creation)
 */
router.get('/download-folder', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User ID not found' });
    }

    const path = req.query.path as string;

    if (!path) {
      return res.status(400).json({ error: 'Bad Request', message: 'path is required' });
    }

    const downloadInfo = await storageService.getRecursiveDownloadUrls(userId, path);

    // Check 1GB limit
    const maxSize = 1024 * 1024 * 1024; // 1GB
    if (downloadInfo.totalSize > maxSize) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Folder size (${Math.round(downloadInfo.totalSize / 1024 / 1024)}MB) exceeds 1GB limit`,
        totalSize: downloadInfo.totalSize,
        fileCount: downloadInfo.fileCount,
      });
    }

    res.status(200).json(downloadInfo);
  } catch (error) {
    console.error('❌ Storage folder download error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get folder download URLs',
    });
  }
});

export default router;
