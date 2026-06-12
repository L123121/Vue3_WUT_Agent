<script setup>
import { computed } from 'vue';
import { User, Sparkles, Copy, RotateCcw, FileText } from 'lucide-vue-next';
import { useLanguageStore } from '../../stores/language.store.js';
import { useChatStore } from '../../stores/chat.store.js';
import MarkdownRenderer from './MarkdownRenderer.vue';

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['copy']);
const languageStore = useLanguageStore();
const chatStore = useChatStore();

const isUser = computed(() => props.message.role === 'user');
const isModel = computed(() => props.message.role === 'model');
const isError = computed(() => props.message.isError === true);
const canRetry = computed(() => props.message.canRetry === true);

const formatTime = (timestamp) => languageStore.formatTime(timestamp);

const copyMessage = (text) => {
  navigator.clipboard.writeText(text).then(() => emit('copy', text));
};

const retryMessage = (msgId) => {
  chatStore.retryMessage(msgId);
};

const openImage = (url) => {
  window.open(url, '_blank');
};

const bubbleClasses = computed(() => {
  if (isUser.value) {
    return 'bg-blue-600 text-white rounded-2xl rounded-tr-sm';
  }
  if (isError.value) {
    return 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/50 rounded-2xl rounded-tl-sm';
  }
  return 'bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 border border-slate-100 dark:border-gray-700 rounded-2xl rounded-tl-sm';
});

const avatarClasses = computed(() => {
  if (isUser.value) {
    return 'bg-blue-100 dark:bg-blue-900/30';
  }
  return 'bg-gradient-to-tr from-blue-500 to-indigo-400 text-white';
});

const timeClasses = computed(() => {
  return isUser.value ? 'text-blue-100' : 'text-slate-400 dark:text-gray-500';
});
</script>

<template>
  <div :class="['flex', isUser ? 'justify-end' : 'justify-start', 'group']">
    <div :class="['flex max-w-[85%] md:max-w-[75%]', isUser ? 'flex-row-reverse' : 'flex-row', 'items-end gap-2']">
      <!-- Avatar -->
      <div :class="['w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden', avatarClasses]">
        <User v-if="isUser" :size="14" class="text-blue-600 dark:text-blue-400" />
        <Sparkles v-else :size="14" />
      </div>

      <!-- Message content -->
      <div :class="['px-5 py-3.5 shadow-sm text-sm leading-relaxed relative max-w-full overflow-hidden', bubbleClasses]">
        <!-- Retry button for user messages -->
        <button
          v-if="isUser && canRetry"
          class="retry-btn absolute -right-2 -top-2 flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white px-2 py-1 rounded-full text-xs shadow-lg transition-all duration-200 cursor-pointer"
          @click="retryMessage(message.id)"
          :title="languageStore.t('chat.retry') || '重新发送'"
        >
          <RotateCcw :size="12" />
          <span>重发</span>
        </button>

        <!-- File attachments -->
        <div v-if="message.files?.length" class="space-y-1.5 mb-2">
          <div v-for="file in message.files" :key="file.url"
            class="flex items-center gap-2 p-2 rounded-lg"
            :class="isUser ? 'bg-blue-500/20' : 'bg-slate-100 dark:bg-gray-700/50'">
            <img v-if="file.isImage" :src="file.url"
              class="max-w-[200px] max-h-[200px] rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
              @click="openImage(file.url)"
              loading="lazy" />
            <a v-else :href="file.url" target="_blank"
              class="flex items-center gap-2 text-xs hover:underline"
              :class="isUser ? 'text-white/80 hover:text-white' : 'text-blue-600 dark:text-blue-400'">
              <span class="text-slate-400 shrink-0"><FileText :size="14" /></span>
              <span class="truncate max-w-[150px]">{{ file.name }}</span>
            </a>
          </div>
        </div>

        <!-- Message text -->
        <MarkdownRenderer v-if="isModel && !isError" :content="message.text" />
        <div v-if="isUser || isError" class="whitespace-pre-wrap leading-relaxed">{{ message.text }}</div>

        <!-- Footer with time and actions -->
        <div :class="['flex items-center justify-end gap-2 mt-1.5', timeClasses]">
          <span class="text-sm opacity-60">{{ formatTime(message.timestamp) }}</span>
          <button
            v-if="isModel && !isError && message.text"
            class="flex items-center gap-1 hover:text-blue-500 transition-all duration-200 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-gray-700 text-sm opacity-60 hover:opacity-100"
            @click="copyMessage(message.text)"
            :title="languageStore.t('chat.copyReply')"
          >
            <Copy :size="14" />
            <span>复制</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
