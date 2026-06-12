/**
 * Global error handling setup for Vue app.
 * Catches unhandled errors and promise rejections.
 */

export function setupGlobalErrorHandler(app, toastStore) {
  // Vue component errors
  app.config.errorHandler = (err, instance, info) => {
    console.error('[Vue Error]', err);
    console.error('Component:', instance?.$options?.name || instance?.$?.type?.name || 'unknown');
    console.error('Info:', info);

    if (toastStore) {
      toastStore.error('应用发生错误，请刷新页面重试');
    }
  };

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Rejection]', event.reason);

    // Don't block navigation or abort errors
    const reason = event.reason;
    if (reason?.name === 'AbortError' || reason?.message?.includes('navigation')) {
      return;
    }

    if (toastStore) {
      toastStore.error('网络请求失败，请检查网络连接');
    }

    event.preventDefault();
  });

  // Global JS errors
  window.addEventListener('error', (event) => {
    // Ignore resource loading errors (images, scripts, etc.)
    if (event.target?.tagName) return;

    console.error('[Global Error]', event.error || event.message);

    if (toastStore) {
      toastStore.error('应用发生错误，请刷新页面重试');
    }
  });
}
