<script setup>
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth.store.js';
import { useThemeStore } from '../../stores/theme.store.js';
import { useToastStore } from '../../stores/toast.store.js';
import { Moon, Sun, Upload, Image } from 'lucide-vue-next';

defineProps({ show: Boolean });
const emit = defineEmits(['close', 'open-avatar-picker']);

const authStore = useAuthStore();
const themeStore = useThemeStore();
const toastStore = useToastStore();

const draftAvatar = computed(() => authStore.user?.avatar || '');

const handleAvatarUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toastStore.error('请选择图片文件'); return; }
  if (file.size > 5 * 1024 * 1024) { toastStore.error('图片大小不能超过5MB'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    authStore.updateUser({ avatar: e.target.result });
    toastStore.success('头像已更新');
  };
  reader.onerror = () => { toastStore.error('图片读取失败'); };
  reader.readAsDataURL(file);
};
</script>

<template>
  <div
    v-if="show"
    class="profile-panel absolute top-16 mt-2 right-8 z-30 w-[420px] max-w-[calc(100%-2rem)] rounded-xl border border-slate-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-xl p-4 overflow-y-auto"
    :style="{ maxHeight: 'calc(100vh - 6rem)' }"
  >
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-slate-800 dark:text-gray-100">个人中心</h3>
      <button @click="emit('close')" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-gray-200">关闭</button>
    </div>

    <div class="flex items-center gap-4 p-3 rounded-lg bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 mb-3">
      <div class="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-white text-xl font-bold shrink-0">
        <template v-if="draftAvatar">
          <img :src="draftAvatar" alt="头像" class="w-full h-full object-cover bg-white" @error="draftAvatar = ''" />
        </template>
        <template v-else>
          <div class="w-full h-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            {{ authStore.user?.name?.charAt(0)?.toUpperCase() || 'U' }}
          </div>
        </template>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-slate-800 dark:text-gray-100">{{ authStore.user?.name }}</p>
        <p class="text-xs text-slate-500 dark:text-gray-400 mb-2">更换头像</p>
        <div class="flex gap-2">
          <label class="cursor-pointer h-7 px-2.5 rounded-md text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors inline-flex items-center gap-1">
            <input type="file" accept="image/*" class="hidden" @change="handleAvatarUpload" />
            <Upload :size="12" />
            <span>上传图片</span>
          </label>
          <button @click="emit('open-avatar-picker')" class="h-7 px-2.5 rounded-md text-xs border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors inline-flex items-center gap-1">
            <Image :size="12" />
            <span>选择头像</span>
          </button>
        </div>
      </div>
    </div>

    <button @click="themeStore.toggleDarkMode()" class="w-full h-9 rounded-lg inline-flex items-center justify-center gap-2 text-sm border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800 text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
      <Moon v-if="themeStore.darkMode" :size="14" />
      <Sun v-else :size="14" />
      <span>{{ themeStore.darkMode ? '夜间模式' : '日间模式' }}</span>
    </button>
  </div>
</template>
