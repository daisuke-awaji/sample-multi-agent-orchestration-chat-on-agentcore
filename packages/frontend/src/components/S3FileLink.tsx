import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { generateDownloadUrl } from '../api/storage';

interface S3FileLinkProps {
  path: string;
  children: React.ReactNode;
}

export const S3FileLink: React.FC<S3FileLinkProps> = ({ path, children }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();

    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    // Open window immediately (within user action context) to avoid popup blockers
    const newWindow = window.open('', '_blank');

    try {
      const downloadUrl = await generateDownloadUrl(path);

      if (newWindow) {
        // Navigate the already-opened window to the download URL
        newWindow.location.href = downloadUrl;
      } else {
        // Fallback: If popup was blocked, try direct navigation
        window.location.href = downloadUrl;
      }
    } catch (err) {
      console.error('Failed to generate download URL:', err);
      setError(err instanceof Error ? err.message : 'Failed to download file');

      // Close the empty window on error
      if (newWindow) {
        newWindow.close();
      }
    } finally {
      setIsLoading(false);
    }
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
        href={path}
        onClick={handleClick}
        className={`
          inline-flex items-center gap-1
          text-blue-600 hover:text-blue-800 
          underline decoration-blue-300 hover:decoration-blue-500
          transition-colors cursor-pointer
          ${isLoading ? 'opacity-50 cursor-wait' : ''}
          ${error ? 'text-red-600' : ''}
        `}
        title={error || (isLoading ? 'Loading...' : `Download: ${fileName}`)}
      >
        <span className="text-base leading-none">{getFileIcon()}</span>
        <span>{children}</span>
        {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
      </a>
      {error && <span className="text-xs text-red-600 ml-1">({t('storage.failedToLoad')})</span>}
    </span>
  );
};
