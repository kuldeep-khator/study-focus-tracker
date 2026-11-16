/**
 * Web Worker-backed interval timer that resists browser background-tab throttling.
 * When a user switches to another tab, minimizes, or opens another browser window,
 * standard main-thread setInterval/requestAnimationFrame gets throttled to 1s-60s.
 * Web Workers run on a separate thread and continue ticking accurately in the background.
 */
export function createBackgroundInterval(callback: () => void, intervalMs: number): () => void {
  let worker: Worker | null = null;
  let workerUrl: string | null = null;
  let fallbackInterval: ReturnType<typeof setInterval> | null = null;

  const startFallback = () => {
    if (fallbackInterval === null) {
      fallbackInterval = setInterval(callback, intervalMs);
    }
  };

  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    try {
      const workerCode = `
        let timerId = null;
        self.onmessage = function(e) {
          if (e.data && e.data.type === 'start') {
            if (timerId !== null) clearInterval(timerId);
            timerId = setInterval(function() {
              self.postMessage('tick');
            }, e.data.intervalMs || 250);
          } else if (e.data && e.data.type === 'stop') {
            if (timerId !== null) {
              clearInterval(timerId);
              timerId = null;
            }
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);

      worker.onmessage = () => {
        callback();
      };

      worker.onerror = () => {
        // Fallback if worker fails at runtime
        if (worker) {
          worker.terminate();
          worker = null;
        }
        startFallback();
      };

      worker.postMessage({ type: 'start', intervalMs });
    } catch {
      startFallback();
    }
  } else {
    startFallback();
  }

  return () => {
    if (worker) {
      try {
        worker.postMessage({ type: 'stop' });
        worker.terminate();
      } catch {
        // ignore cleanup error
      }
      worker = null;
    }
    if (workerUrl) {
      try {
        URL.revokeObjectURL(workerUrl);
      } catch {
        // ignore cleanup error
      }
      workerUrl = null;
    }
    if (fallbackInterval !== null) {
      clearInterval(fallbackInterval);
      fallbackInterval = null;
    }
  };
}
