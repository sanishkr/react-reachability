import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReachability } from './useReachability';

describe('useReachability', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, type: 'opaque' });
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return initial state', () => {
    const { result } = renderHook(() => useReachability({ enabled: false }));

    expect(result.current.isOnline).toBeNull();
    expect(result.current.status).toBe('unknown');
    expect(result.current.lastChecked).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.checkNow).toBe('function');
  });

  it('should detect online status', async () => {
    fetchMock.mockResolvedValue({ ok: true, type: 'opaque' });

    const { result } = renderHook(() =>
      useReachability({
        urls: 'https://example.com',
        interval: 60000,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isOnline).toBe(true);
    expect(result.current.status).toBe('online');
  });

  it('should detect offline status', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useReachability({
        urls: 'https://example.com',
        retries: 0,
        interval: 60000,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isOnline).toBe(false);
    expect(result.current.status).toBe('offline');
  });

  it('should provide checkNow function', async () => {
    fetchMock.mockResolvedValue({ ok: true, type: 'opaque' });

    const { result } = renderHook(() =>
      useReachability({
        urls: 'https://example.com',
        enabled: false,
      })
    );

    // Start monitoring
    act(() => {
      result.current.checkNow();
    });

    // checkNow should be callable without error
    expect(typeof result.current.checkNow).toBe('function');
  });

  it('should clean up on unmount', async () => {
    fetchMock.mockResolvedValue({ ok: true, type: 'opaque' });

    const { unmount } = renderHook(() =>
      useReachability({
        urls: 'https://example.com',
        interval: 60000,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Should not throw on unmount
    unmount();

    // Advance timers - should not cause issues after unmount
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
  });

  it('should update when options change', async () => {
    fetchMock.mockResolvedValue({ ok: true, type: 'opaque' });

    const { result, rerender } = renderHook(
      ({ interval }: { interval: number }) =>
        useReachability({
          urls: 'https://example.com',
          interval,
        }),
      { initialProps: { interval: 60000 } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Rerender with new interval
    rerender({ interval: 120000 });

    // Should not throw
    expect(result.current).toBeDefined();
  });

  it('should handle multiple URLs', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('First failed'))
      .mockResolvedValueOnce({ ok: true, type: 'opaque' });

    const { result } = renderHook(() =>
      useReachability({
        urls: ['https://fail.com', 'https://success.com'],
        retries: 0,
        interval: 60000,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('should respect enabled option', async () => {
    const { result } = renderHook(() =>
      useReachability({
        urls: 'https://example.com',
        enabled: false,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Should remain in unknown state when disabled
    expect(result.current.status).toBe('unknown');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should set lastChecked after probe', async () => {
    fetchMock.mockResolvedValue({ ok: true, type: 'opaque' });

    const { result } = renderHook(() =>
      useReachability({
        urls: 'https://example.com',
        interval: 60000,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.lastChecked).toBeInstanceOf(Date);
  });
});

describe('useReachability SSR simulation', () => {
  it('should handle disabled state gracefully', () => {
    // SSR is simulated by the hook's internal isSSR() check
    // When enabled: false, it behaves similarly to SSR (no probing)
    const { result } = renderHook(() => useReachability({ enabled: false }));

    expect(result.current.isOnline).toBeNull();
    expect(result.current.status).toBe('unknown');
    expect(result.current.lastChecked).toBeNull();
  });
});
