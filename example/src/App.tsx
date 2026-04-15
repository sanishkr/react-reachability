import {
  useReachability,
  ReachabilityMonitor,
  ReachabilityState,
} from 'react-reachability';
import { useEffect, useState } from 'react';

function HookExample() {
  const { isOnline, status, lastChecked, checkNow } = useReachability({
    interval: 10000,
    timeout: 5000,
    retries: 0, // No retries - try each URL once
  });

  return (
    <div className="card">
      <h2>Hook Example (useReachability)</h2>
      <div className="status-row">
        <span className="label">Status:</span>
        <span className={`status ${status}`}>
          {status === 'online' && '🟢 Online'}
          {status === 'offline' && '🔴 Offline'}
          {status === 'checking' && '🟡 Checking...'}
          {status === 'unknown' && '⚪ Unknown'}
        </span>
      </div>
      <div className="status-row">
        <span className="label">isOnline:</span>
        <code>{String(isOnline)}</code>
      </div>
      <div className="status-row">
        <span className="label">Last Checked:</span>
        <span>{lastChecked?.toLocaleTimeString() ?? 'Never'}</span>
      </div>
      <button onClick={checkNow}>Check Now</button>
    </div>
  );
}

function ClassExample() {
  const [state, setState] = useState<{
    isOnline: boolean | null;
    status: string;
    lastChecked: Date | null;
  }>({
    isOnline: null,
    status: 'unknown',
    lastChecked: null,
  });

  useEffect(() => {
    const monitor = new ReachabilityMonitor({
      interval: 10000,
      timeout: 5000,
      retries: 0, // No retries - try each URL once
    });

    const unsubscribe = monitor.subscribe((newState: ReachabilityState) => {
      setState({
        isOnline: newState.isOnline,
        status: newState.status,
        lastChecked: newState.lastChecked,
      });
    });

    return () => {
      unsubscribe();
      monitor.destroy();
    };
  }, []);

  return (
    <div className="card">
      <h2>Class Example (ReachabilityMonitor)</h2>
      <div className="status-row">
        <span className="label">Status:</span>
        <span className={`status ${state.status}`}>
          {state.status === 'online' && '🟢 Online'}
          {state.status === 'offline' && '🔴 Offline'}
          {state.status === 'checking' && '🟡 Checking...'}
          {state.status === 'unknown' && '⚪ Unknown'}
        </span>
      </div>
      <div className="status-row">
        <span className="label">isOnline:</span>
        <code>{String(state.isOnline)}</code>
      </div>
      <div className="status-row">
        <span className="label">Last Checked:</span>
        <span>{state.lastChecked?.toLocaleTimeString() ?? 'Never'}</span>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="container">
      <h1>react-reachability Demo</h1>
      <p className="description">
        Test internet connectivity detection. Try disabling your network to see
        the status change.
      </p>
      <div className="examples">
        <HookExample />
        <ClassExample />
      </div>
    </div>
  );
}

export default App;
