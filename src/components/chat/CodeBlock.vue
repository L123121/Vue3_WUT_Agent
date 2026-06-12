<script setup>
import { ref } from 'vue';
import { useCodeHighlighter } from '../../composables/useCodeHighlighter.js';

const props = defineProps({
  code: {
    type: String,
    required: true,
  },
  language: {
    type: String,
    default: 'text',
  },
  highlighted: {
    type: String,
    default: '',
  },
  isExecutable: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['copy', 'run']);

const { escapeHtml } = useCodeHighlighter();

const copyText = ref('复制');
const isCopied = ref(false);

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(props.code);
    isCopied.value = true;
    copyText.value = '已复制';
    emit('copy', props.code);

    setTimeout(() => {
      isCopied.value = false;
      copyText.value = '复制';
    }, 2000);
  } catch (err) {
    console.error('复制失败:', err);
  }
};

const handleRun = () => {
  emit('run', {
    code: props.code,
    language: props.language,
  });
};
</script>

<template>
  <div class="code-block-wrapper my-3 rounded-lg overflow-hidden bg-[#282c34] text-white shadow-md border border-slate-700">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-1.5 bg-[#21252b] text-xs text-gray-400 select-none border-b border-slate-700">
      <span class="font-mono font-medium opacity-80">{{ language }}</span>
      <div class="flex items-center gap-2">
        <!-- Run button -->
        <button
          v-if="isExecutable"
          class="run-code-btn flex items-center gap-1.5 hover:text-green-400 transition-all duration-200 cursor-pointer px-2 py-0.5 rounded hover:bg-white/10"
          @click="handleRun"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span>运行</span>
        </button>

        <!-- Copy button -->
        <button
          class="copy-code-btn flex items-center gap-1.5 text-gray-300 hover:text-white transition-all duration-200 cursor-pointer px-2 py-0.5 rounded bg-slate-600/80 hover:bg-slate-500"
          :class="{ 'text-green-400': isCopied }"
          @click="handleCopy"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
          </svg>
          <span class="copy-text">{{ copyText }}</span>
        </button>
      </div>
    </div>

    <!-- Code content -->
    <pre class="!m-0 !p-4 overflow-x-auto bg-[#282c34] font-mono text-sm leading-normal">
      <code :class="['hljs', `language-${language}`]" v-html="highlighted || escapeHtml(code)"></code>
    </pre>
  </div>
</template>

<style scoped>
.code-block-wrapper {
  position: relative;
}

.code-block-wrapper pre {
  margin: 0;
  padding: 1rem;
  overflow-x: auto;
  background: #282c34;
  font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}

.code-block-wrapper code {
  font-family: inherit;
}
</style>
