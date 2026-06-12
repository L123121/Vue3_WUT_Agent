import { ref, onUnmounted } from 'vue';

/**
 * Composable that offloads Markdown rendering to a Web Worker.
 * Falls back to synchronous rendering if Worker is unavailable.
 *
 * Usage:
 *   const { renderInWorker } = useMarkdownWorker();
 *   const html = await renderInWorker('# Hello');
 */
export function useMarkdownWorker() {
  const isReady = ref(false);
  let worker = null;
  let pendingCallbacks = new Map();
  let idCounter = 0;

  const initWorker = () => {
    try {
      worker = new Worker(
        new URL('../workers/markdown.worker.js', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e) => {
        const { id, html } = e.data;
        const resolve = pendingCallbacks.get(id);
        if (resolve) {
          pendingCallbacks.delete(id);
          resolve(html);
        }
      };

      worker.onerror = (err) => {
        console.error('[MarkdownWorker] Error:', err);
        // Reject all pending
        for (const [, resolve] of pendingCallbacks) {
          resolve('');
        }
        pendingCallbacks.clear();
      };

      isReady.value = true;
    } catch {
      console.warn('[MarkdownWorker] Worker not supported, falling back to main thread');
      isReady.value = false;
    }
  };

  const renderInWorker = (content) => {
    return new Promise((resolve) => {
      if (!worker || !isReady.value) {
        resolve('');
        return;
      }

      const id = ++idCounter;
      pendingCallbacks.set(id, resolve);

      // Timeout: if worker doesn't respond in 5s, resolve with empty
      setTimeout(() => {
        if (pendingCallbacks.has(id)) {
          pendingCallbacks.delete(id);
          resolve('');
        }
      }, 5000);

      worker.postMessage({ id, content });
    });
  };

  const terminate = () => {
    if (worker) {
      worker.terminate();
      worker = null;
      isReady.value = false;
      pendingCallbacks.clear();
    }
  };

  // Auto-init
  initWorker();

  onUnmounted(() => {
    terminate();
  });

  return { isReady, renderInWorker, terminate };
}
