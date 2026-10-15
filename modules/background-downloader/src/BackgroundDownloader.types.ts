import type { EventSubscription } from "expo-modules-core";

export interface DownloadProgressEvent {
  taskId: number;
  bytesWritten: number;
  totalBytes: number;
  progress: number;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
}

export interface DownloadCompleteEvent {
  taskId: number;
  filePath: string;
  url: string;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
}

export interface DownloadErrorEvent {
  taskId: number;
  error: string;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
}

export interface DownloadStartedEvent {
  taskId: number;
  url: string;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
}

/**
 * A transfer was interrupted (network drop, VPN gateway answering 403, server 5xx) and is paused.
 * iOS only. It keeps its place at the head of the queue, under the same task id, and goes on when
 * the network changes, the app returns to the foreground, or `resumeDownload` is called.
 */
export interface DownloadPausedEvent {
  taskId: number;
  error: string;
  /** Whether it can go on where it stopped rather than start over. */
  resumable: boolean;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
}

/** A paused download started again, under a new task id. iOS only. */
export interface DownloadResumedEvent {
  /** Task id of the new transfer; any later cancel must use it. */
  taskId: number;
  previousTaskId: number;
  /** Whether it goes on where it stopped rather than from the start. */
  resumed: boolean;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
}

export interface ActiveDownload {
  /** Native task id; `-1` for queued entries, which have no task yet. */
  taskId: number;
  url: string;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
  destinationPath?: string;
  /**
   * `running` for the transfer in flight, `paused` for one interrupted and waiting to go on
   * (iOS), `queued` for entries waiting behind it.
   */
  state?: "running" | "paused" | "queued";
}

/**
 * Everything the iOS Live Activity needs in order to render without a JS runtime.
 *
 * The activity is driven from the native URLSession delegate, which keeps working when iOS has torn
 * down the JS runtime — so nothing here can be resolved lazily later. In particular `labels` carries
 * pre-translated strings, keeping i18n in `translations/*.json` instead of duplicating it in Swift.
 *
 * iOS only; ignored on Android.
 */
export interface DownloadActivityMetadata {
  itemId: string;
  title: string;
  subtitle: string;
  /** File name inside the directory returned by `getLiveActivityDirectory()`. */
  posterFileName?: string;
  /** Fallback total used when the server sends no Content-Length (transcoded downloads). */
  estimatedTotalBytes?: number;
  /** Localized labels keyed by state: `downloading` | `completed` | `failed` | `queued`. */
  labels: Record<string, string>;
}

export interface BackgroundDownloaderModuleType {
  startDownload(
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
    headers?: Record<string, string>,
  ): Promise<number>;
  enqueueDownload(
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
    headers?: Record<string, string>,
  ): Promise<number>;
  cancelDownload(taskId: number): void;
  cancelQueuedDownload(url: string): void;
  cancelAllDownloads(): void;
  getActiveDownloads(): Promise<ActiveDownload[]>;
  /** iOS only — absent from the Android module. */
  resumeDownload?(taskId: number): void;
  /** iOS only — absent from the Android module. */
  setLiveActivityEnabled?(enabled: boolean): void;
  /** iOS only — absent from the Android module. */
  getLiveActivityDirectory?(): string | null;
  addListener(
    eventName: string,
    listener: (event: any) => void,
  ): EventSubscription;
}
