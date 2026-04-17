export type LogSource = 'worker' | 'main';

export interface LogEntry {
  timestamp: Date;
  source: LogSource;
  message: string;
  data?: Record<string, unknown>;
}

export type LogCallback = (entry: LogEntry) => void;

export interface ReachabilityOptions {
  urls?: string | string[];
  timeout?: number;
  interval?: number;
  retries?: number;
  enabled?: boolean;
  onLog?: LogCallback;
  /** If true, only notify listeners when isOnline state changes. If false, notify on every probe (updates lastChecked). Default: true */
  notifyOnlyOnChange?: boolean;
}

export interface ReachabilityState {
  isOnline: boolean | null;
  status: 'online' | 'offline' | 'checking' | 'unknown';
  lastChecked: Date | null;
  error: Error | null;
}

export interface ReachabilityConfig {
  urls: string[];
  timeout: number;
  interval: number;
  retries: number;
  enabled: boolean;
  onLog?: LogCallback;
  notifyOnlyOnChange: boolean;
}

export type ReachabilityListener = (state: ReachabilityState) => void;

export interface WorkerMessage {
  type: 'start' | 'probe' | 'stop';
  urls?: string[];
  timeout?: number;
  interval?: number;
  retries?: number;
}

export interface WorkerResponse {
  type: 'result' | 'probing';
  isOnline?: boolean;
  stateChanged?: boolean;
  error?: string;
}
