import type {
  ReachabilityOptions,
  ReachabilityState,
  ReachabilityConfig,
  ReachabilityListener,
  WorkerMessage,
  WorkerResponse,
} from './types';
import { DEFAULT_CONFIG } from '../defaults';

// Inline worker code as a string for blob URL creation
const workerCode = `
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

self.onmessage = async (event) => {
  const { type, urls, timeout, retries } = event.data;

  if (type === 'probe') {
    try {
      const isOnline = await probeUrls(urls, timeout, retries);
      self.postMessage({ type: 'result', isOnline });
    } catch (error) {
      self.postMessage({
        type: 'result',
        isOnline: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
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
    };
  }

  private setState(newState: Partial<ReachabilityState>): void {
    const prevState = this.state;
    this.state = { ...this.state, ...newState };

    // Only notify if isOnline actually changed
    if (prevState.isOnline !== this.state.isOnline) {
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
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { isOnline, error } = event.data;
        this.isProbing = false;
        this.setState({
          isOnline,
          status: isOnline ? 'online' : 'offline',
          lastChecked: new Date(),
          error: error ? new Error(error) : null,
        });
      };

      this.worker.onerror = () => {
        this.isProbing = false;
        // Worker failed, fall back to main thread
        this.terminateWorker();
        this.probeMainThread();
      };
    }
  }

  private terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private async probeMainThread(): Promise<void> {
    if (this.isProbing) return;
    this.isProbing = true;

    try {
      const isOnline = await mainThreadProbe(
        this.config.urls,
        this.config.timeout,
        this.config.retries
      );
      this.setState({
        isOnline,
        status: isOnline ? 'online' : 'offline',
        lastChecked: new Date(),
        error: null,
      });
    } catch (error) {
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

  private probe(): void {
    if (this.isProbing) return;

    this.setState({ status: 'checking' });

    if (this.worker) {
      this.isProbing = true;
      const message: WorkerMessage = {
        type: 'probe',
        urls: this.config.urls,
        timeout: this.config.timeout,
        retries: this.config.retries,
      };
      this.worker.postMessage(message);
    } else {
      this.probeMainThread();
    }
  }

  start(): void {
    if (isSSR()) return;

    this.setupWorker();
    this.probe();

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      this.probe();
    }, this.config.interval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.terminateWorker();
  }

  checkNow(): void {
    if (isSSR()) return;
    this.probe();
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
