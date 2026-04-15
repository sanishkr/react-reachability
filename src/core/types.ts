export interface ReachabilityOptions {
  urls?: string | string[];
  timeout?: number;
  interval?: number;
  retries?: number;
  enabled?: boolean;
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
}

export type ReachabilityListener = (state: ReachabilityState) => void;

export interface WorkerMessage {
  type: 'probe';
  urls: string[];
  timeout: number;
  retries: number;
}

export interface WorkerResponse {
  type: 'result';
  isOnline: boolean;
  error?: string;
}
