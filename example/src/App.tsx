import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LogEntry,
  ReachabilityMonitor,
  ReachabilityState,
  useReachability,
} from 'react-reachability';

const MAX_LOGS = 50;

function LogPanel({
  logs,
  onClear,
}: {
  logs: LogEntry[];
  onClear: () => void;
}) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="log-panel">
      <div className="log-header">
        <h2>Activity Log</h2>
        <div className="log-legend">
          <span className="legend-item worker">🔵 Worker Thread</span>
          <span className="legend-item main">🟠 Main Thread</span>
        </div>
        <button className="clear-btn" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="log-container" ref={logContainerRef}>
        {logs.length === 0 ? (
          <div className="log-empty">
            No activity yet. Logs will appear here...
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`log-entry ${log.source}`}>
              <span className="log-time">
                {log.timestamp.toLocaleTimeString()}
              </span>
              <span className={`log-source ${log.source}`}>
                {log.source === 'worker' ? '🔵 WORKER' : '🟠 MAIN'}
              </span>
              <span className="log-message">{log.message}</span>
              {log.data && (
                <code className="log-data">
                  {JSON.stringify(log.data, null, 0)}
                </code>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function HookExample({ onLog }: { onLog: (entry: LogEntry) => void }) {
  const { isOnline, status, lastChecked, checkNow } = useReachability({
    interval: 10000,
    timeout: 5000,
    retries: 0, // No retries - try each URL once
    onLog,
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

function ClassExample({ onLog }: { onLog: (entry: LogEntry) => void }) {
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
      onLog,
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
  }, [onLog]);

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
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const handleLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => {
      const newLogs = [...prev, entry];
      // Keep only the last MAX_LOGS entries
      return newLogs.slice(-MAX_LOGS);
    });
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <div className="container">
      <h1>react-reachability Demo</h1>
      <p className="description">
        Test internet connectivity detection. Try disabling your network to see
        the status change.
      </p>
      <div className="examples">
        <HookExample onLog={handleLog} />
        <ClassExample onLog={handleLog} />
      </div>
      <LogPanel logs={logs} onClear={clearLogs} />
    </div>
  );
}

export default App;
