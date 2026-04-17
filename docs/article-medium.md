# Stop Trusting `navigator.onLine` — Here's How to Actually Detect Internet Connectivity

Your app says the user is online. The request fails anyway. Sound familiar?

---

I've been there. You check `navigator.onLine`, it returns `true`, you fire off an API request... and it times out. The user stares at a spinner. Your error tracking lights up. Everyone's frustrated.

Here's the uncomfortable truth: **`navigator.onLine` lies to you.**

It doesn't check if the user has _actual_ internet connectivity. It only checks if the device has a network interface. Connected to WiFi with no internet? `navigator.onLine` says `true`. Hotel captive portal blocking everything? Still `true`.

I built [react-reachability](https://www.npmjs.com/package/react-reachability) to solve this problem properly.

---

## The Problem with `navigator.onLine`

```javascript
// This looks reasonable...
if (navigator.onLine) {
  await fetch('/api/submit-payment');
}

// But navigator.onLine can be TRUE when:
// ❌ WiFi is connected but router has no internet
// ❌ Behind a captive portal (hotel, airport)
// ❌ ISP is down but local network works
// ❌ VPN is disconnected but WiFi is on
```

The consequences are real:

- **Failed payments** that users think went through
- **Lost form data** when submissions silently fail
- **Broken real-time features** that show stale data
- **Poor UX** with confusing error states

---

## The Solution: Actual Network Probing

`react-reachability` takes a different approach. Instead of trusting the browser's guess, it **actually probes the network** by making lightweight requests to known-reliable endpoints.

And here's the key: it does this in a **Web Worker**, so your main thread stays buttery smooth.

### Key Features

- 🔄 **Non-blocking** — Probes run in a Web Worker
- ⚛️ **React hook** — `useReachability()` for React apps
- 🌐 **Framework-agnostic** — Core class works anywhere
- 🔁 **Fallback URLs** — Tries multiple endpoints
- ⚙️ **Configurable** — Timeout, interval, retries
- 📦 **Zero dependencies** — Only peer dep is React (optional)
- 🛡️ **SSR-safe** — Works with Next.js, Remix, etc.

---

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                    Main Thread                      │
│  ┌─────────────┐    state change    ┌────────────┐  │
│  │ React Hook  │ ◄────────────────  │  Monitor   │  │
│  │ / Listener  │                    │  Class     │  │
│  └─────────────┘                    └─────┬──────┘  │
└───────────────────────────────────────────┼─────────┘
                                            │ postMessage
┌───────────────────────────────────────────┼─────────┐
│                   Web Worker              ▼         │
│  ┌─────────────────────────────────────────────┐    │
│  │  Interval polling → fetch probes → result   │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

1. **Web Worker** handles all network probing in a separate thread
2. **Fetch requests** go to reliable endpoints (Google, Cloudflare, Apple)
3. **Only state changes** notify the main thread (configurable)
4. **Fallback** to main-thread probing if Workers aren't available

---

## Quick Start: React

Install the package:

```bash
npm install react-reachability
```

Use the hook:

```tsx
import { useReachability } from 'react-reachability';

function NetworkStatus() {
  const { isOnline, status, lastChecked, checkNow } = useReachability({
    interval: 30000, // Check every 30 seconds
    timeout: 5000, // 5 second timeout per request
  });

  if (status === 'checking') {
    return <div>Checking connection...</div>;
  }

  return (
    <div>
      <p>{isOnline ? '🟢 Online' : '🔴 Offline'}</p>
      <p>Last checked: {lastChecked?.toLocaleTimeString()}</p>
      <button onClick={checkNow}>Check Now</button>
    </div>
  );
}
```

### Show an Offline Banner

```tsx
function App() {
  const { isOnline } = useReachability();

  return (
    <>
      {isOnline === false && (
        <div className="offline-banner">
          You're offline. Some features may not work.
        </div>
      )}
      <MainContent />
    </>
  );
}
```

---

## Quick Start: Vanilla JavaScript

Not using React? No problem. The core `ReachabilityMonitor` class works anywhere:

```typescript
import { ReachabilityMonitor } from 'react-reachability';

const monitor = new ReachabilityMonitor({
  urls: ['https://www.google.com/generate_204'],
  interval: 30000,
  timeout: 5000,
  retries: 1,
});

// Subscribe to state changes
const unsubscribe = monitor.subscribe((state) => {
  console.log('Online:', state.isOnline);
  console.log('Status:', state.status);

  // Update your UI
  document.getElementById('status').textContent = state.isOnline
    ? 'Connected'
    : 'Disconnected';
});

// Trigger manual check
document.getElementById('check-btn').onclick = () => {
  monitor.checkNow();
};

// Clean up when done
// unsubscribe();
// monitor.destroy();
```

Works with Vue, Svelte, Angular, or plain HTML/JS.

---

## Real-World Use Cases

### 1. Offline-First Apps

Queue actions when offline, sync when back online:

```tsx
function useOfflineQueue() {
  const { isOnline } = useReachability();
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    if (isOnline && queue.length > 0) {
      // Process queued actions
      queue.forEach((action) => processAction(action));
      setQueue([]);
    }
  }, [isOnline, queue]);

  const addToQueue = (action) => {
    if (isOnline) {
      processAction(action);
    } else {
      setQueue((prev) => [...prev, action]);
    }
  };

  return { addToQueue, queueLength: queue.length };
}
```

### 2. Payment & Checkout Flows

Warn users before they submit:

```tsx
function CheckoutButton({ onSubmit }) {
  const { isOnline, checkNow } = useReachability();

  const handleClick = async () => {
    await checkNow(); // Fresh check before payment

    if (!isOnline) {
      alert('Please check your internet connection before submitting payment.');
      return;
    }

    onSubmit();
  };

  return (
    <button onClick={handleClick} disabled={isOnline === false}>
      {isOnline === false ? 'No Connection' : 'Pay Now'}
    </button>
  );
}
```

### 3. Real-Time Dashboards

Pause polling when disconnected:

```tsx
function Dashboard() {
  const { isOnline } = useReachability();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isOnline) return; // Don't poll when offline

    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, [isOnline]);

  return (
    <div>
      {!isOnline && <div className="warning">Live updates paused</div>}
      <DashboardContent data={data} />
    </div>
  );
}
```

---

## Configuration Options

| Option               | Type                 | Default                   | Description                 |
| -------------------- | -------------------- | ------------------------- | --------------------------- |
| `urls`               | `string \| string[]` | Google, Cloudflare, Apple | Endpoints to probe          |
| `timeout`            | `number`             | `5000`                    | Timeout per request (ms)    |
| `interval`           | `number`             | `30000`                   | Polling interval (ms)       |
| `retries`            | `number`             | `1`                       | Retries per URL             |
| `enabled`            | `boolean`            | `true`                    | Enable/disable monitoring   |
| `notifyOnlyOnChange` | `boolean`            | `true`                    | Only notify on state change |
| `onLog`              | `function`           | —                         | Debug logging callback      |

> ⚠️ **Note**: Setting `notifyOnlyOnChange: false` will trigger callbacks every interval, which may cause unnecessary re-renders.

---

## Why Web Workers?

Network requests can be slow—especially when checking connectivity on a flaky connection. Running probes on the main thread would:

- Block UI interactions during requests
- Cause jank in animations
- Delay other JavaScript execution

By offloading to a Web Worker, your app stays responsive even when probing takes several seconds.

---

## Get Started

```bash
npm install react-reachability
```

- 📦 **npm**: [react-reachability](https://www.npmjs.com/package/react-reachability)
- 🐙 **GitHub**: [sanishkr/react-reachability](https://github.com/sanishkr/react-reachability)

Found a bug? Have a feature request? [Open an issue](https://github.com/sanishkr/react-reachability/issues)!

If this helped you, consider giving it a ⭐ on GitHub.

---

_Stop trusting `navigator.onLine`. Start knowing if your users are actually connected._
