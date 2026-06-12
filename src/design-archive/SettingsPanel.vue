<script setup>
import { useAuthStore } from '../../stores/auth.store.js';
import { useThemeStore } from '../../stores/theme.store.js';
import { useLanguageStore } from '../../stores/language.store.js';
import { useToastStore } from '../../stores/toast.store.js';
import { Settings, Moon, Sun, RotateCcw } from 'lucide-vue-next';

defineProps({ show: Boolean });
const emit = defineEmits(['close']);

const authStore = useAuthStore();
const themeStore = useThemeStore();
const languageStore = useLanguageStore();
const toastStore = useToastStore();

const handleResetIdentity = () => {
  authStore.logout();
  window.location.reload();
};
</script>

<template>
  <div
    v-if="show"
    class="settings-panel absolute top-16 mt-2 right-8 z-30 w-80 rounded-xl border border-slate-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-xl p-4 space-y-4 overflow-y-auto"
    :style="{ maxHeight: 'calc(100vh - 6rem)' }"
  >
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-bold text-slate-800 dark:text-gray-100">系统设置</h3>
      <button
        @click="emit('close')"
        class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-gray-200"
      >
        关闭
      </button>
    </div>

    <div class="rounded-lg border border-slate-200 dark:border-gray-700 p-3">
      <div class="text-xs font-semibold text-slate-600 dark:text-gray-300 mb-2">主题模式</div>
      <button
        @click="themeStore.toggleDarkMode()"
        class="w-full h-9 rounded-lg inline-flex items-center justify-center gap-2 text-sm border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
      >
        <Moon v-if="themeStore.darkMode" :size="14" />
        <Sun v-else :size="14" />
        <span>{{ themeStore.darkMode ? '夜间模式' : '日间模式' }}</span>
      </button>
    </div>

    <button
      @click="handleResetIdentity"
      class="w-full h-10 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-semibold border border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
    >
      <RotateCcw :size="14" />
      <span>重置身份</span>
    </button>
  </div>
</template>
