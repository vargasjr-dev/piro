export interface SyncProgress {
  step: string;       // human-readable phase label
  current?: string;   // e.g. current repo name
  done: number;       // items processed so far
  total: number;      // estimated total (0 = unknown)
}

export type ProgressFn = (meta: SyncProgress) => Promise<void>;

/** Returned by every sync* function */
export interface SyncResult {
  filesWritten: number;  // new rows written to file_index
  bytesWritten: number;  // sum of content byte lengths written to R2
}
