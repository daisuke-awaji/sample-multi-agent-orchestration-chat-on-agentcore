/**
 * Storage Routes
 * ユーザーファイルストレージのAPI
 */

import { Router } from 'express';
import { jwtAuthMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { AppError } from '../middleware/error-handler.js';
import * as storageService from '../services/s3-storage.js';

const router = Router();

router.use(jwtAuthMiddleware);

function requireUserId(userId: string | undefined): asserts userId is string {
  if (!userId) throw new AppError(401, 'User ID not found');
}

router.get(
  '/list',
  asyncHandler(async (req, res) => {
    requireUserId(req.userId);
    const path = (req.query.path as string) || '/';
    const result = await storageService.listStorageItems(req.userId, path);
    res.status(200).json(result);
  })
);

router.get(
  '/size',
  asyncHandler(async (req, res) => {
    requireUserId(req.userId);
    const path = (req.query.path as string) || '/';
    const result = await storageService.getDirectorySize(req.userId, path);
    res.status(200).json(result);
  })
);

router.post(
  '/upload',
  asyncHandler(async (req, res) => {
    requireUserId(req.userId);
    const { fileName, path, contentType } = req.body;
    if (!fileName) throw new AppError(400, 'fileName is required');
    const result = await storageService.generateUploadUrl(req.userId, fileName, path, contentType);
    res.status(200).json(result);
  })
);

router.post(
  '/directory',
  asyncHandler(async (req, res) => {
    requireUserId(req.userId);
    const { directoryName, path } = req.body;
    if (!directoryName) throw new AppError(400, 'directoryName is required');
    const result = await storageService.createDirectory(req.userId, directoryName, path);
    res.status(201).json(result);
  })
);

router.delete(
  '/file',
  asyncHandler(async (req, res) => {
    requireUserId(req.userId);
    const path = req.query.path as string;
    if (!path) throw new AppError(400, 'path is required');
    const result = await storageService.deleteFile(req.userId, path);
    res.status(200).json(result);
  })
);

router.delete(
  '/directory',
  asyncHandler(async (req, res) => {
    requireUserId(req.userId);
    const path = req.query.path as string;
    const force = req.query.force === 'true';
    if (!path) throw new AppError(400, 'path is required');
    try {
      const result = await storageService.deleteDirectory(req.userId, path, force);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Directory is not empty') {
        throw new AppError(400, 'Directory is not empty');
      }
      throw error;
    }
  })
);

router.get(
  '/download',
  asyncHandler(async (req, res) => {
    requireUserId(req.userId);
    const path = req.query.path as string;
    if (!path) throw new AppError(400, 'path is required');
    const downloadUrl = await storageService.generateDownloadUrl(req.userId, path);
    res.status(200).json({ downloadUrl });
  })
);

router.get(
  '/tree',
  asyncHandler(async (req, res) => {
    requireUserId(req.userId);
    const tree = await storageService.getFolderTree(req.userId);
    res.status(200).json({ tree });
  })
);

router.get(
  '/download-folder',
  asyncHandler(async (req, res) => {
    requireUserId(req.userId);
    const path = req.query.path as string;
    if (!path) throw new AppError(400, 'path is required');

    const downloadInfo = await storageService.getRecursiveDownloadUrls(req.userId, path);

    const maxSize = 1024 * 1024 * 1024;
    if (downloadInfo.totalSize > maxSize) {
      throw new AppError(
        400,
        `Folder size (${Math.round(downloadInfo.totalSize / 1024 / 1024)}MB) exceeds 1GB limit`
      );
    }

    res.status(200).json(downloadInfo);
  })
);

export default router;
