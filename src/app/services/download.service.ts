import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

export interface DownloadProgress {
  status: 'idle' | 'extracting' | 'downloading' | 'complete' | 'error';
  progress: number;
  message: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DownloadService {

  private downloadProgress = new BehaviorSubject<DownloadProgress>({
    status: 'idle',
    progress: 0,
    message: ''
  });

  downloadProgress$ = this.downloadProgress.asObservable();

  constructor(private http: HttpClient) { }

  /**
   * Extract video source URL from iframe element
   */
  extractVideoSourceFromIframe(iframeElement: HTMLIFrameElement): string | null {
    try {
      // Try to get the src directly
      const src = iframeElement.getAttribute('src');
      if (src) {
        return src;
      }

      // Try to access iframe content (may fail due to CORS)
      const iframeDoc = iframeElement.contentDocument || iframeElement.contentWindow?.document;
      if (!iframeDoc) {
        return null;
      }

      // Look for video elements or source tags
      const videoElement = iframeDoc.querySelector('video');
      if (videoElement) {
        const sourceElement = videoElement.querySelector('source');
        if (sourceElement) {
          return sourceElement.getAttribute('src');
        }
        return videoElement.src;
      }

      // Look for embedded player sources
      const iframes = iframeDoc.querySelectorAll('iframe');
      if (iframes.length > 0) {
        return iframes[0].getAttribute('src');
      }

      return null;
    } catch (e) {
      console.warn('Cannot extract video source from iframe (CORS):', e);
      return null;
    }
  }

  /**
   * Attempt to download video from a URL
   */
  async downloadVideo(videoUrl: string, filename: string): Promise<void> {
    this.updateProgress({ status: 'downloading', progress: 0, message: 'Starting download...' });

    try {
      // Fetch the video with progress tracking
      const response = await fetch(videoUrl, {
        mode: 'no-cors',
        headers: {
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Range': 'bytes=0-'
        }
      });

      if (!response.ok && response.status !== 0) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = parseInt(contentLength || '0', 10);

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Unable to read response body');
      }

      const chunks: Uint8Array[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;

        const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
        this.updateProgress({
          status: 'downloading',
          progress,
          message: `Downloading: ${progress}%`
        });
      }

      // Create blob and download
      const blob = new Blob(chunks, { type: 'video/mp4' });
      this.triggerDownload(blob, filename);

      this.updateProgress({
        status: 'complete',
        progress: 100,
        message: 'Download complete!'
      });

      // Reset after 3 seconds
      setTimeout(() => {
        this.updateProgress({ status: 'idle', progress: 0, message: '' });
      }, 3000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.updateProgress({
        status: 'error',
        progress: 0,
        message: `Download failed: ${errorMessage}`,
        error: errorMessage
      });

      // Reset after 5 seconds
      setTimeout(() => {
        this.updateProgress({ status: 'idle', progress: 0, message: '' });
      }, 5000);

      throw error;
    }
  }

  /**
   * Attempt to download from a data URL (base64 encoded)
   */
  downloadFromDataUrl(dataUrl: string, filename: string): void {
    try {
      this.updateProgress({ status: 'downloading', progress: 50, message: 'Processing download...' });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      this.updateProgress({
        status: 'complete',
        progress: 100,
        message: 'Download complete!'
      });

      setTimeout(() => {
        this.updateProgress({ status: 'idle', progress: 0, message: '' });
      }, 3000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateProgress({
        status: 'error',
        progress: 0,
        message: `Download failed: ${errorMessage}`,
        error: errorMessage
      });
    }
  }

  /**
   * Check if a video URL is accessible
   */
  async isVideoAccessible(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors'
      });
      return response.ok || response.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Generate a sanitized filename for download
   */
  generateFilename(title: string, extension: string = 'mp4', season?: number, episode?: number): string {
    let filename = title
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);

    if (season !== undefined && episode !== undefined) {
      filename = `${filename}_S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    }

    return `${filename}.${extension}`;
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  private updateProgress(progress: DownloadProgress): void {
    this.downloadProgress.next(progress);
  }

  resetProgress(): void {
    this.updateProgress({ status: 'idle', progress: 0, message: '' });
  }
}
