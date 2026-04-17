import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReachabilityMonitor } from '../core/ReachabilityMonitor';
import type { ReachabilityOptions, ReachabilityState } from '../core/types';

export interface UseReachabilityReturn extends ReachabilityState {
  checkNow: () => void;
}

const SSR_STATE: ReachabilityState = {
  isOnline: null,
  status: 'unknown',
  lastChecked: null,
  error: null,
};

function isSSR(): boolean {
  return typeof window === 'undefined';
}

export function useReachability(
  options: ReachabilityOptions = {}
): UseReachabilityReturn {
  const [state, setState] = useState<ReachabilityState>(SSR_STATE);
  const monitorRef = useRef<ReachabilityMonitor | null>(null);

  // Memoize options to prevent unnecessary re-renders
  const memoizedOptions = useMemo(
    () => ({
      urls: options.urls,
      timeout: options.timeout,
      interval: options.interval,
      retries: options.retries,
      enabled: options.enabled,
      onLog: options.onLog,
      notifyOnlyOnChange: options.notifyOnlyOnChange,
    }),
    [
      options.urls,
      options.timeout,
      options.interval,
      options.retries,
      options.enabled,
      options.onLog,
      options.notifyOnlyOnChange,
    ]
  );

  useEffect(() => {
    if (isSSR()) return;

    // Create monitor instance
    const monitor = new ReachabilityMonitor(memoizedOptions);
    monitorRef.current = monitor;

    // Subscribe to state changes
    const unsubscribe = monitor.subscribe((newState) => {
      setState({ ...newState });
    });

    return () => {
      unsubscribe();
      monitor.destroy();
      monitorRef.current = null;
    };
  }, [memoizedOptions]);

  const checkNow = useCallback(() => {
    if (monitorRef.current) {
      monitorRef.current.checkNow();
    }
  }, []);

  return {
    ...state,
    checkNow,
  };
}
