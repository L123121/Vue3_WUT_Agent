import { ref, watch, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { useCodeHighlighter } from './useCodeHighlighter.js';
import { useMarkdownWorker } from './useMarkdownWorker.js';

/**
 * Markdown 渲染 composable
 * 提供完整的 Markdown 渲染、安全清理和流式更新功能
 */
export function useMarkdownRenderer() {
  const { highlightCode, getLanguageLabel, isExecutableLanguage, escapeHtml, highlightVersion } = useCodeHighlighter();
  const { renderInWorker } = useMarkdownWorker();

  // Worker 阈值：内容超过此长度时使用 Worker
  const WORKER_THRESHOLD = 2000;
  const RENDER_THROTTLE_MS = 150;

  let throttleTimer = null;
  const renderedContent = ref('');
  const lastRenderedAt = ref('');
  const isLoadingWorker = ref(false);

  // Markdown 补全逻辑 — 使用 md.parse() Token 流检测未闭合语法
  // 注意：只补全代码围栏（```），因为不闭合会影响后续内容渲染。
  // 加粗/斜体等内联语法即使不闭合，markdown-it 也能正常渲染，追加关闭标记反而产生多余符号。
  const completeMarkdown = (str) => {
    if (!str) return str;

    // 代码围栏是单独的 fence token（nesting: 0），通过统计 ``` 出现次数检测
    const fenceCount = (str.match(/^```/gm) || []).length;
    const hasUnclosedFence = fenceCount > 0 && fenceCount % 2 === 1;

    if (!hasUnclosedFence) return str;

    return str + '\n```';
  };

  // 创建代码高亮函数
  const highlightCodeBlock = (str, lang) => {
    const normalizedLang = (lang || '').trim().toLowerCase();
    const mappedLang = getLanguageLabel(normalizedLang);

    if (mappedLang && mappedLang !== 'text') {
      const highlighted = highlightCode(str, mappedLang);
      return {
        highlighted,
        language: mappedLang,
        isExecutable: isExecutableLanguage(normalizedLang),
      };
    }

    return {
      highlighted: escapeHtml(str),
      language: 'text',
      isExecutable: false,
    };
  };

  // 配置 MarkdownIt
  const md = new MarkdownIt({
    html: false,
    xhtmlOut: true,
    breaks: true,
    linkify: true,
    typographer: true,
    highlight: (str, lang) => {
      const result = highlightCodeBlock(str, lang);
      // 返回原始高亮结果，CodeBlock 组件会处理包装
      return result.highlighted;
    },
  });

  // 链接安全处理
  const defaultLinkRender = md.renderer.rules.link_open || ((tokens, idx, options, env, self) =>
    self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const tIdx = tokens[idx].attrIndex('target');
    if (tIdx < 0) tokens[idx].attrPush(['target', '_blank']);
    const rIdx = tokens[idx].attrIndex('rel');
    if (rIdx < 0) tokens[idx].attrPush(['rel', 'noopener noreferrer']);
    const hIdx = tokens[idx].attrIndex('href');
    if (hIdx >= 0 && /^(javascript|data|vbscript):/i.test(tokens[idx].attrs[hIdx][1])) {
      tokens[idx].attrs[hIdx][1] = '#';
    }
    return defaultLinkRender(tokens, idx, options, env, self);
  };

  // DOMPurify 配置
  const ALLOWED_TAGS = [
    'div', 'span', 'pre', 'code', 'p', 'a', 'strong', 'em', 'b', 'i',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'button', 'svg', 'path', 'rect', 'polygon', 'br', 'hr', 'blockquote',
  ];
  const ALLOWED_ATTR = [
    'class', 'style', 'data-code', 'data-lang',
    'xmlns', 'width', 'height', 'viewBox', 'fill', 'stroke',
    'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'x', 'y', 'rx', 'ry',
    'href', 'target', 'rel', 'points',
  ];

  // 渲染结果缓存，避免重复解析相同内容
  const renderCache = new Map();
  const MAX_RENDER_CACHE = 50;

  // 主线程渲染
  const renderMarkdownMain = (content) => {
    if (!content || content.trim() === '') return '';
    // 命中缓存则直接返回
    if (renderCache.has(content)) return renderCache.get(content);
    try {
      const completed = completeMarkdown(content);
      const raw = md.render(completed);
      const html = DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR });
      // 缓存结果，超过上限时淘汰最老的
      if (renderCache.size >= MAX_RENDER_CACHE) {
        const firstKey = renderCache.keys().next().value;
        renderCache.delete(firstKey);
      }
      renderCache.set(content, html);
      return html;
    } catch {
      return content;
    }
  };

  // 更新渲染内容
  const updateRender = async (content) => {
    // 使用 Web Worker 处理大内容
    if (content && content.length > WORKER_THRESHOLD) {
      isLoadingWorker.value = true;
      const html = await renderInWorker(content);
      if (html) {
        renderedContent.value = html;
        lastRenderedAt.value = content;
      } else {
        // Worker 回退
        renderedContent.value = renderMarkdownMain(content);
        lastRenderedAt.value = content;
      }
      isLoadingWorker.value = false;
    } else {
      renderedContent.value = renderMarkdownMain(content);
      lastRenderedAt.value = content;
    }
  };

  // 带节流的渲染更新
  const throttledUpdate = (content) => {
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => {
      updateRender(content);
      throttleTimer = null;
    }, RENDER_THROTTLE_MS);
  };

  // 检查内容是否过时
  const isContentStale = (content) => content !== lastRenderedAt.value;

  // 清理
  onUnmounted(() => {
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
  });

  return {
    renderedContent,
    isLoadingWorker,
    highlightVersion,
    renderMarkdownMain,
    updateRender,
    throttledUpdate,
    isContentStale,
    completeMarkdown,
    highlightCodeBlock,
  };
}
