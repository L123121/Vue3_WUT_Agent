<script setup>
import { ref, onErrorCaptured } from 'vue';
import { AlertTriangle, RefreshCw } from 'lucide-vue-next';

const error = ref(null);

onErrorCaptured((err) => {
  error.value = err;
  return false; // prevent propagation
});

const reload = () => {
  error.value = null;
  window.location.reload();
};
</script>

<template>
  <div v-if="error" class="flex flex-col items-center justify-center h-full p-8 text-center">
    <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
      <AlertTriangle class="w-8 h-8 text-red-500" />
    </div>
    <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2">页面出现错误</h3>
    <p class="text-sm text-slate-500 dark:text-gray-400 mb-6 max-w-md">
      {{ error.message || '发生了未知错误，请尝试刷新页面' }}
    </p>
    <button
      @click="reload"
      class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
    >
      <RefreshCw :size="14" />
      刷新页面
    </button>
  </div>
  <slot v-else />
</template>
