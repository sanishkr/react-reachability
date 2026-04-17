import type {
  ReachabilityOptions,
  ReachabilityState,
  ReachabilityConfig,
  ReachabilityListener,
  WorkerMessage,
  WorkerResponse,
  LogSource,
} from './types';
import { DEFAULT_CONFIG } from '../defaults';

// Inline worker code as a string for blob URL creation
const workerCode = `
let intervalId = null;
let config = null;
let lastIsOnline = null;

async function probeUrl(url, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.type === 'opaque' || response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function probeWithRetries(url, timeout, retries) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await probeUrl(url, timeout);
    if (result) return true;
  }
  return false;
}

async function probeUrls(urls, timeout, retries) {
  for (const url of urls) {
    const result = await probeWithRetries(url, timeout, retries);
    if (result) return true;
  }
  return false;
}

async function runProbe() {
  if (!config) return;
  
  self.postMessage({ type: 'probing' });
  
  try {
    const isOnline = await probeUrls(config.urls, config.timeout, config.retries);
    // Always send result so main thread can update lastChecked
    const stateChanged = lastIsOnline !== isOnline;
    lastIsOnline = isOnline;
    self.postMessage({ type: 'result', isOnline, stateChanged });
  } catch (error) {
    const stateChanged = lastIsOnline !== false;
    lastIsOnline = false;
    self.postMessage({
      type: 'result',
      isOnline: false,
      stateChanged,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

self.onmessage = async (event) => {
  const { type } = event.data;

  if (type === 'start') {
    config = event.data;
    lastIsOnline = null;
    
    // Run initial probe
    await runProbe();
    
    // Set up interval in worker
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(runProbe, config.interval);
    
  } else if (type === 'probe') {
    // Manual probe request
    await runProbe();
    
  } else if (type === 'stop') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    config = null;
  }
};
`;

function isSSR(): boolean {
  return typeof window === 'undefined' || typeof Worker === 'undefined';
}

function createWorker(): Worker | null {
  if (isSSR()) return null;

  try {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
  } catch {
    return null;
  }
}

// Main thread fallback probe function
async function mainThreadProbe(
  urls: string[],
  timeout: number,
  retries: number
): Promise<boolean> {
  for (const url of urls) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.type === 'opaque' || response.ok) {
          return true;
        }
      } catch {
        clearTimeout(timeoutId);
      }
    }
  }
  return false;
}

export class ReachabilityMonitor {
  private config: ReachabilityConfig;
  private state: ReachabilityState;
  private listeners: Set<ReachabilityListener>;
  private worker: Worker | null;
  private intervalId: ReturnType<typeof setInterval> | null;
  private isProbing: boolean;

  constructor(options: ReachabilityOptions = {}) {
    this.config = this.mergeConfig(options);
    this.state = {
      isOnline: null,
      status: 'unknown',
      lastChecked: null,
      error: null,
    };
    this.listeners = new Set();
    this.worker = null;
    this.intervalId = null;
    this.isProbing = false;

    if (this.config.enabled && !isSSR()) {
      this.start();
    }
  }

  private mergeConfig(options: ReachabilityOptions): ReachabilityConfig {
    const urls = options.urls
      ? Array.isArray(options.urls)
        ? options.urls
        : [options.urls]
      : DEFAULT_CONFIG.urls;

    return {
      urls,
      timeout: options.timeout ?? DEFAULT_CONFIG.timeout,
      interval: options.interval ?? DEFAULT_CONFIG.interval,
      retries: options.retries ?? DEFAULT_CONFIG.retries,
      enabled: options.enabled ?? DEFAULT_CONFIG.enabled,
      onLog: options.onLog,
      notifyOnlyOnChange:
        options.notifyOnlyOnChange ?? DEFAULT_CONFIG.notifyOnlyOnChange,
    };
  }

  private log(
    source: LogSource,
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (this.config.onLog) {
      this.config.onLog({
        timestamp: new Date(),
        source,
        message,
        data,
      });
    }
  }

  private setState(newState: Partial<ReachabilityState>): void {
    const prevIsOnline = this.state.isOnline;
    const prevLastChecked = this.state.lastChecked;
    this.state = { ...this.state, ...newState };

    // Notify if isOnline changed OR if lastChecked changed (probe completed)
    if (
      prevIsOnline !== this.state.isOnline ||
      prevLastChecked !== this.state.lastChecked
    ) {
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state);
      } catch {
        // Ignore listener errors
      }
    });
  }

  private setupWorker(): void {
    if (this.worker) return;

    this.worker = createWorker();

    if (this.worker) {
      this.log('main', 'Web Worker created successfully');

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { type, isOnline, stateChanged, error } = event.data;

        if (type === 'probing') {
          this.log('worker', 'Starting network probe');
          this.setState({ status: 'checking' });
        } else if (type === 'result') {
          this.isProbing = false;
          this.log('worker', 'Probe completed', { isOnline, stateChanged });

          // Decide whether to update main thread based on config
          const shouldNotify = stateChanged || !this.config.notifyOnlyOnChange;

          if (shouldNotify) {
            if (stateChanged) {
              this.log(
                'main',
                `State changed: ${isOnline ? 'online' : 'offline'}`,
                { previousState: this.state.isOnline, newState: isOnline }
              );
            } else {
              this.log('main', 'Probe completed (updating lastChecked)', {
                isOnline,
              });
            }
            this.setState({
              isOnline: isOnline ?? false,
              status: isOnline ? 'online' : 'offline',
              lastChecked: new Date(),
              error: error ? new Error(error) : null,
            });
          }
        }
      };

      this.worker.onerror = () => {
        this.isProbing = false;
        this.log('main', 'Worker error, falling back to main thread');
        // Worker failed, fall back to main thread
        this.terminateWorker();
        this.startMainThreadFallback();
      };
    } else {
      this.log('main', 'Web Worker not available, using main thread');
    }
  }

  private terminateWorker(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
      this.worker.terminate();
      this.worker = null;
    }
  }

  private startMainThreadFallback(): void {
    this.probeMainThread();

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      this.probeMainThread();
    }, this.config.interval);
  }

  private async probeMainThread(): Promise<void> {
    if (this.isProbing) return;
    this.isProbing = true;
    this.log('main', 'Starting probe on main thread', {
      urls: this.config.urls,
      timeout: this.config.timeout,
    });

    try {
      const isOnline = await mainThreadProbe(
        this.config.urls,
        this.config.timeout,
        this.config.retries
      );
      this.log('main', `Probe completed: ${isOnline ? 'online' : 'offline'}`, {
        isOnline,
      });
      this.setState({
        isOnline,
        status: isOnline ? 'online' : 'offline',
        lastChecked: new Date(),
        error: null,
      });
    } catch (error) {
      this.log('main', 'Probe failed with error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.setState({
        isOnline: false,
        status: 'offline',
        lastChecked: new Date(),
        error: error instanceof Error ? error : new Error('Unknown error'),
      });
    } finally {
      this.isProbing = false;
    }
  }

  private sendManualProbe(): void {
    if (this.isProbing) return;

    if (this.worker) {
      this.isProbing = true;
      this.worker.postMessage({ type: 'probe' });
    } else {
      this.probeMainThread();
    }
  }

  start(): void {
    if (isSSR()) return;

    this.log('main', 'Starting reachability monitor', {
      interval: this.config.interval,
      timeout: this.config.timeout,
      urls: this.config.urls,
    });
    this.setupWorker();

    if (this.worker) {
      // Worker manages its own interval
      const message: WorkerMessage = {
        type: 'start',
        urls: this.config.urls,
        timeout: this.config.timeout,
        interval: this.config.interval,
        retries: this.config.retries,
      };
      this.worker.postMessage(message);
    } else {
      // Fallback to main thread with interval
      this.startMainThreadFallback();
    }
  }

  stop(): void {
    this.log('main', 'Stopping reachability monitor');
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.terminateWorker();
  }

  checkNow(): void {
    if (isSSR()) return;
    this.log('main', 'Manual check triggered');
    this.sendManualProbe();
  }

  subscribe(listener: ReachabilityListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): ReachabilityState {
    return { ...this.state };
  }

  updateConfig(options: Partial<ReachabilityOptions>): void {
    const wasEnabled = this.config.enabled;
    this.config = this.mergeConfig({ ...this.config, ...options });

    if (wasEnabled && !this.config.enabled) {
      this.stop();
    } else if (!wasEnabled && this.config.enabled) {
      this.start();
    } else if (this.config.enabled && options.interval !== undefined) {
      // Restart with new interval
      this.stop();
      this.start();
    }
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
  }
}
