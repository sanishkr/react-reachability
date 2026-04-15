import type { WorkerMessage, WorkerResponse } from './types';

async function probeUrl(url: string, timeout: number): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    // With no-cors, we get an opaque response (type: 'opaque')
    // If fetch completes without throwing, the network is reachable
    return response.type === 'opaque' || response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function probeWithRetries(
  url: string,
  timeout: number,
  retries: number
): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await probeUrl(url, timeout);
    if (result) return true;
  }
  return false;
}

async function probeUrls(
  urls: string[],
  timeout: number,
  retries: number
): Promise<boolean> {
  for (const url of urls) {
    const result = await probeWithRetries(url, timeout, retries);
    if (result) return true;
  }
  return false;
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, urls, timeout, retries } = event.data;

  if (type === 'probe') {
    try {
      const isOnline = await probeUrls(urls, timeout, retries);
      const response: WorkerResponse = { type: 'result', isOnline };
      self.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = {
        type: 'result',
        isOnline: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      self.postMessage(response);
    }
  }
};
