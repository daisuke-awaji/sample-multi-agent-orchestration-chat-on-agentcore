import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { generateDownloadUrl } from '../api/storage';
import { openUrlInNewTab, downloadWithAsyncUrl } from '../utils/download';

interface S3FileLinkProps {
  path: string;
  children: React.ReactNode;
}

// Presigned URL refresh interval (45 min — URLs typically expire in 1 hour)
const PRESIGNED_URL_REFRESH_INTERVAL = 45 * 60 * 1000;

export const S3FileLink: React.FC<S3FileLinkProps> = ({ path, children }) => {
  const { t } = useTranslation();
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPresignedUrl = useCallback(async () => {
    try {
      const url = await generateDownloadUrl(path);
      setPresignedUrl(url);
      setError(null);
    } catch (err) {
      console.error('Failed to generate download URL:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate download URL');
    } finally {
      setIsLoading(false);
    }
  }, [path]);

  // Pre-fetch presigned URL on mount
  useEffect(() => {
    setIsLoading(true);
    fetchPresignedUrl();

    // Refresh before expiry
    const interval = setInterval(fetchPresignedUrl, PRESIGNED_URL_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPresignedUrl]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    if (!presignedUrl) {
      // Fallback: if pre-fetch hasn't completed, use window.open before await
      handleAsyncFallback();
      return;
    }

    // Synchronous navigation — no transient activation issue
    openUrlInNewTab(presignedUrl);
  };

  // Fallback for when presigned URL is not yet available
  const handleAsyncFallback = async () => {
    downloadWithAsyncUrl(
      () => generateDownloadUrl(path),
      (err) => {
        console.error('Failed to generate download URL:', err);
        setError(err.message);
      }
    ).then((/* void */) => {
      // Re-fetch to cache the URL for subsequent clicks
      fetchPresignedUrl();
    }).catch(() => {
      // Error already handled in onError callback
    });
  };

  // Extract filename from path
  const fileName = path.split('/').pop() || path;

  // Determine file icon based on extension
  const getFileIcon = () => {
    const ext = fileName.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'pdf':
        return '📄';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'svg':
      case 'webp':
        return '🖼️';
      case 'doc':
      case 'docx':
        return '📝';
      case 'xls':
      case 'xlsx':
        return '📊';
      case 'zip':
      case 'tar':
      case 'gz':
        return '📦';
      case 'mp4':
      case 'mov':
      case 'avi':
        return '🎬';
      case 'mp3':
      case 'wav':
        return '🎵';
      case 'txt':
      case 'md':
        return '📃';
      default:
        return '📎';
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <a
        href={presignedUrl || path}
        onClick={handleClick}
        className={`
          inline-flex items-center gap-1
          text-action-primary hover:text-action-primary
          underline decoration-blue-300 hover:decoration-blue-500
          transition-colors cursor-pointer
          ${isLoading ? 'opacity-50 cursor-wait' : ''}
          ${error ? 'text-feedback-error' : ''}
        `}
        title={error || (isLoading ? 'Loading...' : `Download: ${fileName}`)}
      >
        <span className="text-base leading-none">{getFileIcon()}</span>
        <span>{children}</span>
        {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
      </a>
      {error && (
        <span className="text-xs text-feedback-error ml-1">({t('storage.failedToLoad')})</span>
      )}
    </span>
  );
};
