# react-reachability

A framework-agnostic network reachability detection library with Web Worker support and React hook.

[![npm version](https://img.shields.io/npm/v/react-reachability.svg)](https://www.npmjs.com/package/react-reachability)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Non-blocking**: Probes run in a Web Worker to avoid blocking the main thread
- **Framework-agnostic**: Core `ReachabilityMonitor` class works with any framework
- **React hook**: `useReachability` hook for React applications
- **SSR-safe**: Returns `unknown` state during server-side rendering
- **Fallback URLs**: Tries multiple URLs in sequence until one succeeds
- **Configurable**: Timeout, interval, retries, and custom URLs
- **Zero runtime dependencies**: Only peer dependency is React (optional)
- **TypeScript**: Full type definitions included

## Why not `navigator.onLine`?

`navigator.onLine` is unreliable—it only indicates if the device has a network interface, not actual internet connectivity. This library performs real network probes to accurately detect internet availability.

## Installation

```bash
npm install react-reachability
# or
yarn add react-reachability
# or
pnpm add react-reachability
```

## Usage

### React Hook

```tsx
import { useReachability } from 'react-reachability';

function NetworkStatus() {
  const { isOnline, status, lastChecked, checkNow } = useReachability({
    urls: ['https://www.google.com/generate_204'],
    interval: 30000, // Check every 30 seconds
    timeout: 5000,   // 5 second timeout per request
  });

  if (status === 'unknown' || status === 'checking') {
    return <div>Checking connection...</div>;
  }

  return (
    <div>
      <p>Status: {isOnline ? '🟢 Online' : '🔴 Offline'}</p>
      <p>Last checked: {lastChecked?.toLocaleTimeString()}</p>
      <button onClick={checkNow}>Check Now</button>
    </div>
  );
}
```

### Vanilla JavaScript

```ts
import { ReachabilityMonitor } from 'react-reachability';

const monitor = new ReachabilityMonitor({
  urls: ['https://www.google.com/generate_204', 'https://www.cloudflare.com/cdn-cgi/trace'],
  interval: 30000,
  timeout: 5000,
  retries: 1,
});

// Subscribe to state changes
const unsubscribe = monitor.subscribe((state) => {
  console.log('Online:', state.isOnline);
  console.log('Status:', state.status);
});

// Manual check
monitor.checkNow();

// Stop monitoring
monitor.stop();

// Resume monitoring
monitor.start();

// Clean up
monitor.destroy();
```

## API

### `useReachability(options?)`

React hook for network reachability detection.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `urls` | `string \| string[]` | Default URLs | URL(s) to probe. Falls back to next URL on failure. |
| `timeout` | `number` | `5000` | Timeout per request in milliseconds |
| `interval` | `number` | `30000` | Polling interval in milliseconds |
| `retries` | `number` | `1` | Number of retries per URL before trying next |
| `enabled` | `boolean` | `true` | Enable/disable monitoring |

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `isOnline` | `boolean \| null` | `true` if online, `false` if offline, `null` if unknown |
| `status` | `'online' \| 'offline' \| 'checking' \| 'unknown'` | Current status |
| `lastChecked` | `Date \| null` | Timestamp of last check |
| `error` | `Error \| null` | Last error, if any |
| `checkNow` | `() => void` | Trigger immediate check |

### `ReachabilityMonitor`

Core class for vanilla JavaScript usage.

#### Constructor

```ts
new ReachabilityMonitor(options?: ReachabilityOptions)
```

#### Methods

| Method | Description |
|--------|-------------|
| `start()` | Start monitoring |
| `stop()` | Stop monitoring |
| `checkNow()` | Trigger immediate check |
| `subscribe(listener)` | Subscribe to state changes. Returns unsubscribe function. |
| `getState()` | Get current state |
| `updateConfig(options)` | Update configuration |
| `destroy()` | Clean up resources |

## Default URLs

The library ships with sensible default URLs:

```ts
[
  'https://www.google.com/generate_204',
  'https://www.cloudflare.com/cdn-cgi/trace',
  'https://www.apple.com/library/test/success.html',
]
```

You can override these by providing your own `urls` option.

## How It Works

1. **Web Worker**: Probes run in a Web Worker to avoid blocking the main thread
2. **Fetch with no-cors**: Uses `fetch` with `mode: 'no-cors'` to work cross-origin
3. **Fallback**: If Worker is unavailable, falls back to main thread probing
4. **State changes only**: Listeners are only notified when `isOnline` actually changes

## Browser Support

Works in all modern browsers that support:
- Web Workers
- Fetch API
- AbortController

Falls back gracefully to main-thread probing if Web Workers are unavailable.

## SSR Support

The library is SSR-safe. During server-side rendering:
- `isOnline` returns `null`
- `status` returns `'unknown'`
- No network requests are made

## License

MIT
