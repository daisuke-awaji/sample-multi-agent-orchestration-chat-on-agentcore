/**
 * File Icon Utilities
 * ファイル拡張子に応じたアイコンと色を返すユーティリティ
 */

import {
  File,
  FileText,
  FileSpreadsheet,
  Image,
  FileCode,
  FileJson,
  FileArchive,
  FileVideo,
  FileAudio,
  Presentation,
  type LucideIcon,
} from 'lucide-react';

interface FileIconConfig {
  icon: LucideIcon;
  color: string;
}

/**
 * ファイル名から拡張子を取得
 */
function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    return parts[parts.length - 1].toLowerCase();
  }
  return '';
}

/**
 * 拡張子からアイコンと色を取得
 */
export function getFileIcon(filename: string): FileIconConfig {
  const ext = getFileExtension(filename);

  // ドキュメント系
  if (ext === 'pdf') {
    return { icon: FileText, color: 'text-feedback-error' };
  }
  if (['doc', 'docx'].includes(ext)) {
    return { icon: FileText, color: 'text-action-primary' };
  }
  if (['txt', 'md', 'markdown'].includes(ext)) {
    return { icon: FileText, color: 'text-fg-muted' };
  }

  // スプレッドシート系
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return { icon: FileSpreadsheet, color: 'text-green-500' };
  }

  // プレゼンテーション系
  if (['ppt', 'pptx', 'pptm', 'odp', 'key'].includes(ext)) {
    return { icon: Presentation, color: 'text-orange-500' };
  }

  // 画像系
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) {
    return { icon: Image, color: 'text-purple-500' };
  }

  // コード系（JavaScript/TypeScript）
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext)) {
    return { icon: FileCode, color: 'text-yellow-500' };
  }

  // コード系（Python）
  if (['py', 'pyc', 'pyd', 'pyw'].includes(ext)) {
    return { icon: FileCode, color: 'text-action-primary' };
  }

  // コード系（Web）
  if (['html', 'htm', 'css', 'scss', 'sass', 'less'].includes(ext)) {
    return { icon: FileCode, color: 'text-orange-500' };
  }

  // コード系（その他）
  if (
    ['java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'swift', 'kt', 'rb', 'php'].includes(ext)
  ) {
    return { icon: FileCode, color: 'text-cyan-500' };
  }

  // JSON/YAML系
  if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) {
    return { icon: FileJson, color: 'text-orange-600' };
  }

  // アーカイブ系
  if (['zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz', 'tgz'].includes(ext)) {
    return { icon: FileArchive, color: 'text-amber-700' };
  }

  // 動画系
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'].includes(ext)) {
    return { icon: FileVideo, color: 'text-purple-600' };
  }

  // 音声系
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext)) {
    return { icon: FileAudio, color: 'text-teal-500' };
  }

  // デフォルト（不明な拡張子）
  return { icon: File, color: 'text-action-primary' };
}
