import { afterEach, vi, beforeEach } from 'vitest';

// Store original Worker
const OriginalWorker = globalThis.Worker;

// Mock Worker that fails to create - forces main thread fallback
class FailingWorker {
  constructor() {
    throw new Error('Worker not available in test environment');
  }
}

beforeEach(() => {
  // Force main thread probing by making Worker construction fail
  // This ensures tests control behavior via fetch mocks
  (globalThis as unknown as { Worker: typeof FailingWorker }).Worker =
    FailingWorker;
});

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
  // Restore original Worker
  if (OriginalWorker) {
    globalThis.Worker = OriginalWorker;
  }
});

// Mock URL.createObjectURL and URL.revokeObjectURL
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
}

if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn();
}
