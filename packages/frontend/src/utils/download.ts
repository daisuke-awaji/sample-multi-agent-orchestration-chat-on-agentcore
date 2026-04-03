/**
 * Navigate to a URL in a new tab/window.
 * Handles the case where window.open is blocked (e.g., PWA standalone mode).
 *
 * IMPORTANT: Must be called synchronously within a user gesture handler
 * to preserve transient activation on mobile browsers.
 */
export function openUrlInNewTab(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => document.body.removeChild(link), 100);
}

/**
 * Download a file that requires an async presigned URL fetch.
 * Opens a blank window synchronously to preserve user gesture context,
 * then redirects after the URL is fetched.
 *
 * @param fetchUrl - Async function that returns the download URL
 * @param onError - Optional error callback
 */
export async function downloadWithAsyncUrl(
  fetchUrl: () => Promise<string>,
  onError?: (error: Error) => void
): Promise<void> {
  // Open window synchronously — preserves transient activation
  const newWindow = window.open('', '_blank');

  try {
    const url = await fetchUrl();

    if (newWindow && !newWindow.closed) {
      newWindow.location.href = url;
    } else {
      // Fallback for PWA standalone or blocked popups
      window.location.href = url;
    }
  } catch (err) {
    if (newWindow && !newWindow.closed) newWindow.close();
    const error = err instanceof Error ? err : new Error('Download failed');
    onError?.(error);
    throw error;
  }
}
