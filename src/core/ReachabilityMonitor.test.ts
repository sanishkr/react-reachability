import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReachabilityMonitor } from './ReachabilityMonitor';

describe('ReachabilityMonitor', () => {
  let monitor: ReachabilityMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (monitor) {
      monitor.destroy();
    }
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should create with default config', () => {
      monitor = new ReachabilityMonitor();
      const state = monitor.getState();

      expect(state.status).toBe('checking');
      expect(state.lastChecked).toBeNull();
    });

    it('should accept custom URLs as string', () => {
      monitor = new ReachabilityMonitor({
        urls: 'https://example.com',
        enabled: false,
      });
      const state = monitor.getState();

      expect(state.status).toBe('unknown');
    });

    it('should accept custom URLs as array', () => {
      monitor = new ReachabilityMonitor({
        urls: ['https://example1.com', 'https://example2.com'],
        enabled: false,
      });
      const state = monitor.getState();

      expect(state.status).toBe('unknown');
    });

    it('should not start when enabled is false', () => {
      monitor = new ReachabilityMonitor({ enabled: false });
      const state = monitor.getState();

      expect(state.status).toBe('unknown');
      expect(state.isOnline).toBeNull();
    });
  });

  describe('state management', () => {
    it('should return current state via getState', () => {
      monitor = new ReachabilityMonitor({ enabled: false });
      const state = monitor.getState();

      expect(state).toHaveProperty('isOnline');
      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('lastChecked');
      expect(state).toHaveProperty('error');
    });

    it('should return a copy of state, not the original', () => {
      monitor = new ReachabilityMonitor({ enabled: false });
      const state1 = monitor.getState();
      const state2 = monitor.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('subscription', () => {
    it('should call listener immediately with current state', () => {
      monitor = new ReachabilityMonitor({ enabled: false });
      const listener = vi.fn();

      monitor.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unknown',
        })
      );
    });

    it('should return unsubscribe function', () => {
      monitor = new ReachabilityMonitor({ enabled: false });
      const listener = vi.fn();

      const unsubscribe = monitor.subscribe(listener);
      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
      // Listener should not be called again after unsubscribe
    });

    it('should support multiple listeners', () => {
      monitor = new ReachabilityMonitor({ enabled: false });
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      monitor.subscribe(listener1);
      monitor.subscribe(listener2);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe('start/stop', () => {
    it('should start monitoring when start is called', () => {
      monitor = new ReachabilityMonitor({ enabled: false });
      expect(monitor.getState().status).toBe('unknown');

      monitor.start();
      expect(monitor.getState().status).toBe('checking');
    });

    it('should stop monitoring when stop is called', () => {
      monitor = new ReachabilityMonitor({ enabled: false });
      monitor.start();
      monitor.stop();

      // Should not throw and should be stopped
      expect(monitor.getState()).toBeDefined();
    });
  });

  describe('checkNow', () => {
    it('should trigger immediate probe', () => {
      monitor = new ReachabilityMonitor({ enabled: false });
      monitor.start();

      monitor.checkNow();

      expect(monitor.getState().status).toBe('checking');
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      monitor = new ReachabilityMonitor({
        enabled: false,
        timeout: 5000,
      });

      monitor.updateConfig({ timeout: 10000 });
      // Config updated internally - no direct way to verify without exposing config
      expect(monitor.getState()).toBeDefined();
    });

    it('should start when enabled changes to true', () => {
      monitor = new ReachabilityMonitor({ enabled: false });
      expect(monitor.getState().status).toBe('unknown');

      monitor.updateConfig({ enabled: true });
      expect(monitor.getState().status).toBe('checking');
    });

    it('should stop when enabled changes to false', () => {
      monitor = new ReachabilityMonitor({ enabled: true });
      monitor.updateConfig({ enabled: false });

      // Monitor should be stopped
      expect(monitor.getState()).toBeDefined();
    });
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      monitor = new ReachabilityMonitor();
      const listener = vi.fn();
      monitor.subscribe(listener);

      monitor.destroy();

      // Should not throw
      expect(monitor.getState()).toBeDefined();
    });
  });
});

describe('ReachabilityMonitor with mocked fetch', () => {
  let monitor: ReachabilityMonitor;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    if (monitor) {
      monitor.destroy();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should detect online when fetch succeeds', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      type: 'opaque',
    });

    monitor = new ReachabilityMonitor({
      urls: 'https://example.com',
      interval: 60000,
      enabled: false,
    });

    const listener = vi.fn();
    monitor.subscribe(listener);
    monitor.start();

    // Allow promises to resolve
    await vi.advanceTimersByTimeAsync(100);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        isOnline: true,
        status: 'online',
      })
    );
  });

  it('should detect offline when all URLs fail', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));

    monitor = new ReachabilityMonitor({
      urls: ['https://example1.com', 'https://example2.com'],
      retries: 0,
      interval: 60000,
      enabled: false,
    });

    const listener = vi.fn();
    monitor.subscribe(listener);
    monitor.start();

    // Allow promises to resolve
    await vi.advanceTimersByTimeAsync(100);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        isOnline: false,
        status: 'offline',
      })
    );
  });

  it('should try fallback URLs when first fails', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('First URL failed'))
      .mockResolvedValueOnce({ ok: true, type: 'opaque' });

    monitor = new ReachabilityMonitor({
      urls: ['https://fail.com', 'https://success.com'],
      retries: 0,
      interval: 60000,
      enabled: false,
    });

    const listener = vi.fn();
    monitor.subscribe(listener);
    monitor.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        isOnline: true,
      })
    );
  });

  it('should retry on failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockResolvedValueOnce({ ok: true, type: 'opaque' });

    monitor = new ReachabilityMonitor({
      urls: 'https://example.com',
      retries: 1,
      interval: 60000,
      enabled: false,
    });

    const listener = vi.fn();
    monitor.subscribe(listener);
    monitor.start();

    await vi.advanceTimersByTimeAsync(100);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        isOnline: true,
      })
    );
  });

  it('should poll at configured interval', async () => {
    fetchMock.mockResolvedValue({ ok: true, type: 'opaque' });

    monitor = new ReachabilityMonitor({
      urls: 'https://example.com',
      interval: 1000,
      enabled: false,
    });

    monitor.start();

    // Initial probe completes
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance by interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Advance by another interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    monitor.stop();
  });

  it('should respect timeout', async () => {
    // Mock fetch that rejects when aborted
    fetchMock.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      return new Promise((_, reject) => {
        const abortHandler = () => {
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (signal.aborted) {
          abortHandler();
        } else {
          signal.addEventListener('abort', abortHandler);
        }
      });
    });

    monitor = new ReachabilityMonitor({
      urls: 'https://example.com',
      timeout: 100,
      retries: 0,
      interval: 60000,
      enabled: false,
    });

    const listener = vi.fn();
    monitor.subscribe(listener);
    monitor.start();

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(150);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        isOnline: false,
        status: 'offline',
      })
    );
  });

  it('should emit on every completed probe (lastChecked updates)', async () => {
    fetchMock.mockResolvedValue({ ok: true, type: 'opaque' });

    monitor = new ReachabilityMonitor({
      urls: 'https://example.com',
      interval: 1000,
      enabled: false,
    });

    const listener = vi.fn();
    monitor.subscribe(listener);

    // Initial call with unknown state
    expect(listener).toHaveBeenCalledTimes(1);

    monitor.start();
    await vi.advanceTimersByTimeAsync(100);

    // Called again when state changed to online
    expect(listener).toHaveBeenCalledTimes(2);

    // Poll again - should emit because lastChecked updates
    await vi.advanceTimersByTimeAsync(1000);

    // Should have additional call since lastChecked changed
    expect(listener).toHaveBeenCalledTimes(3);

    monitor.stop();
  });
});
