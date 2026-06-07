export interface SyncProgress {
  step: string;       // human-readable phase label
  current?: string;   // e.g. current repo name
  done: number;       // items processed so far
  total: number;      // estimated total (0 = unknown)
}

export type ProgressFn = (meta: SyncProgress) => Promise<void>;
