import { ref, onMounted, onUnmounted } from 'vue';

/**
 * Composable for lazy-loading elements using IntersectionObserver.
 * Returns a ref to attach to the target element and a reactive `isVisible` flag.
 *
 * Usage:
 *   const { targetRef, isVisible } = useLazyload({ rootMargin: '200px' });
 *   <div ref="targetRef">...</div>
 */
export function useLazyload(options = {}) {
  const { rootMargin = '200px', threshold = 0, once = true } = options;
  const targetRef = ref(null);
  const isVisible = ref(false);
  let observer = null;

  onMounted(() => {
    if (!targetRef.value) return;

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            isVisible.value = true;
            if (once && observer) {
              observer.disconnect();
              observer = null;
            }
          } else if (!once) {
            isVisible.value = false;
          }
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(targetRef.value);
  });

  onUnmounted(() => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  });

  return { targetRef, isVisible };
}
