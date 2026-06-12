<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

/**
 * Wrapper that defers rendering its default slot until the element
 * is within `rootMargin` of the viewport. Shows a placeholder until then.
 */
const props = defineProps({
  rootMargin: { type: String, default: '400px' },
});

const targetRef = ref(null);
const isVisible = ref(false);
let observer = null;

onMounted(() => {
  if (!targetRef.value) return;

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        isVisible.value = true;
        observer?.disconnect();
        observer = null;
      }
    },
    { rootMargin: props.rootMargin }
  );

  observer.observe(targetRef.value);
});

onUnmounted(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div ref="targetRef">
    <slot v-if="isVisible" />
    <!-- Placeholder: same height as a typical message bubble -->
    <div v-else class="h-16" />
  </div>
</template>
