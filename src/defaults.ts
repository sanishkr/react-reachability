import type { ReachabilityConfig } from './core/types';

export const DEFAULT_URLS = [
  'https://www.google.com/generate_204',
  'https://www.cloudflare.com/cdn-cgi/trace',
  'https://www.apple.com/library/test/success.html',
];

export const DEFAULT_TIMEOUT = 5000;
export const DEFAULT_INTERVAL = 30000;
export const DEFAULT_RETRIES = 1;

export const DEFAULT_CONFIG: ReachabilityConfig = {
  urls: DEFAULT_URLS,
  timeout: DEFAULT_TIMEOUT,
  interval: DEFAULT_INTERVAL,
  retries: DEFAULT_RETRIES,
  enabled: true,
  notifyOnlyOnChange: true,
};
