import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  fetchConversations,
  createConversation as apiCreateConversation,
  fetchConversation,
  renameConversation as apiRenameConversation,
  deleteConversation as apiDeleteConversation,
} from '../api/conversations.js';
import { useAuthStore } from './auth.store.js';
import {
  normalizeMessages,
  createWelcomeMessage,
  createLocalConversation,
  loadLocalConversationsCache,
  saveLocalConversationsCache,
  ensureLocalFallback,
} from '../utils/chatHelpers.js';

const CURRENT_CONVERSATION_KEY = 'chat_current_conversation_id';
const MESSAGES_BACKUP_KEY = 'chat_messages_backup';

export const useConversationStore = defineStore('conversation', () => {
  let authStore = null;

  const getAuthStore = () => {
    if (!authStore) authStore = useAuthStore();
    return authStore;
  };

  const conversations = ref([]);
  const currentConversationId = ref(localStorage.getItem(CURRENT_CONVERSATION_KEY) || '');
  const isLoaded = ref(false);

  const currentConversation = computed(() =>
    conversations.value.find((c) => c.id === currentConversationId.value)
  );

  const sortedConversations = computed(() =>
    [...conversations.value].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  );

  const isLocalSession = (id) => !id || id === 'local' || id.startsWith('local_');

  const isBackendAvailable = () => {
    const auth = getAuthStore();
    return auth.isAuthenticated && !auth.isLocalAuth;
  };

  const loadConversations = async () => {
    if (!isBackendAvailable()) {
      if (conversations.value.length === 0) {
        ensureLocalFallback(conversations, currentConversationId);
      }
      isLoaded.value = true;
      tryRestoreFromBackup();
      return;
    }

    try {
      const data = await fetchConversations();
      if (data.length === 0) {
        // 后端返回空（可能 Redis 未启动），先尝试从 localStorage 恢复
        const cached = loadLocalConversationsCache();
        if (cached.length > 0) {
          conversations.value = cached;
          const hasCurrent = cached.some((c) => c.id === currentConversationId.value);
          currentConversationId.value = hasCurrent ? currentConversationId.value : cached[0].id;
        } else {
          const localConv = createLocalConversation('新会话');
          conversations.value = [localConv];
          currentConversationId.value = localConv.id;
        }
      } else {
        conversations.value = data.map((conv) => ({ ...conv, messages: [] }));
        if (currentConversationId.value && !conversations.value.find((c) => c.id === currentConversationId.value)) {
          currentConversationId.value = conversations.value[0]?.id || '';
        }
        if (!currentConversationId.value && conversations.value.length > 0) {
          currentConversationId.value = conversations.value[0].id;
        }
      }
      isLoaded.value = true;
      tryRestoreFromBackup();
    } catch (error) {
      console.error('Failed to load conversations:', error);
      if (conversations.value.length === 0) {
        ensureLocalFallback(conversations, currentConversationId);
      }
      isLoaded.value = true;
    }
  };

  // 从独立消息备份恢复当前会话的消息
  const tryRestoreFromBackup = () => {
    const conv = currentConversation.value;
    if (!conv) return;
    const hasRealMessages = (conv.messages || []).some((m) => m.id !== 'welcome' && m.text?.trim());
    if (hasRealMessages) return;

    // 先试 conversationStore 的备份 (chat_messages_backup)
    const backup = restoreMessagesBackup();
    if (backup && Array.isArray(backup.messages) && backup.messages.length > 0) {
      if (restoreFromBackupData(conv, backup)) return;
    }

    // 再试 messageStore 的直接备份 (chat_msgs_direct)
    try {
      const raw = localStorage.getItem('chat_msgs_direct');
      if (raw) {
        const direct = JSON.parse(raw);
        if (direct && Array.isArray(direct.messages) && direct.messages.length > 0) {
          restoreFromBackupData(conv, direct);
        }
      }
    } catch {}
  };

  const restoreFromBackupData = (conv, backup) => {
    if (backup.conversationId === conv.id || (!isLocalSession(conv.id) && !isLocalSession(backup.conversationId))) {
      const normalized = normalizeMessages(backup.messages);
      if (normalized.length > 0) {
        conversations.value = conversations.value.map((c) =>
          c.id === conv.id ? { ...c, messages: normalized, title: backup.title || c.title } : c
        );
        return true;
      }
    }
    return false;
  };

  const loadConversationMessages = async (conversationId) => {
    if (isLocalSession(conversationId) || !isBackendAvailable()) return;

    try {
      const conv = await fetchConversation(conversationId);
      const index = conversations.value.findIndex((c) => c.id === conversationId);
      if (index !== -1 && conv) {
        const normalized = normalizeMessages(conv.messages);
        conversations.value[index].messages = normalized.length > 0 ? normalized : [createWelcomeMessage()];
        conversations.value[index].title = conv.title;
      }
    } catch (error) {
      console.error('加载会话消息失败:', error);
    }
  };

  const createConversation = async (title) => {
    if (!isBackendAvailable()) {
      const localConv = createLocalConversation(title, conversations.value.length);
      conversations.value.unshift(localConv);
      currentConversationId.value = localConv.id;
      localStorage.setItem(CURRENT_CONVERSATION_KEY, localConv.id);
      return localConv.id;
    }

    try {
      const conv = await apiCreateConversation(title || `新会话 ${conversations.value.length + 1}`);
      conversations.value.unshift({ ...conv, messages: [createWelcomeMessage()] });
      currentConversationId.value = conv.id;
      localStorage.setItem(CURRENT_CONVERSATION_KEY, conv.id);
      return conv.id;
    } catch (error) {
      console.error('创建会话失败:', error);
      const localConv = createLocalConversation(title, conversations.value.length);
      conversations.value.unshift(localConv);
      currentConversationId.value = localConv.id;
      localStorage.setItem(CURRENT_CONVERSATION_KEY, localConv.id);
      return localConv.id;
    }
  };

  const switchConversation = async (id) => {
    if (!conversations.value.some((c) => c.id === id)) return;
    currentConversationId.value = id;
    localStorage.setItem(CURRENT_CONVERSATION_KEY, id);

    const conv = conversations.value.find((c) => c.id === id);
    if (conv && (!conv.messages || conv.messages.length === 0)) {
      await loadConversationMessages(id);
    }
  };

  const renameConversation = async (id, title) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const conv = conversations.value.find((c) => c.id === id);
    if (conv) conv.title = trimmedTitle;

    if (!isLocalSession(id) && isBackendAvailable()) {
      try {
        await apiRenameConversation(id, trimmedTitle);
      } catch (error) {
        console.error('重命名会话失败:', error);
      }
    }
  };

  const deleteConversation = async (id) => {
    const targetIndex = conversations.value.findIndex((c) => c.id === id);
    if (targetIndex === -1) return;

    conversations.value.splice(targetIndex, 1);

    if (!isLocalSession(id) && isBackendAvailable()) {
      try {
        await apiDeleteConversation(id);
      } catch (error) {
        console.error('删除会话失败:', error);
      }
    }

    if (currentConversationId.value === id) {
      if (conversations.value.length === 0) {
        await createConversation('默认会话');
      } else {
        currentConversationId.value = conversations.value[Math.max(0, targetIndex - 1)]?.id || conversations.value[0].id;
      }
    }

    // 同步删除 localStorage 中的缓存，防止刷新后恢复已删除会话
    scheduleSaveCache(true);
    // 显式清理两个备份键，避免 saveMessagesBackup/saveDirectBackup 因 msgs.length===0 跳过而残留旧数据
    try { localStorage.removeItem(MESSAGES_BACKUP_KEY); } catch {}
    try { localStorage.removeItem('chat_msgs_direct'); } catch {}
  };

  // 去除 markdown 标记符号，用于预览文本显示
  const stripMarkdown = (text) => {
    if (!text) return '';
    return text
      // 加粗/斜体/删除线：**text**、*text*、__text__、~~text~~
      .replace(/(\*{1,3}|_{1,3}|~~)(.+?)\1/g, '$2')
      // 行内代码：`text`
      .replace(/`([^`]+)`/g, '$1')
      // 标题标记：### text → text
      .replace(/^#{1,6}\s+/gm, '')
      // 列表标记：- text、* text、+ text、1. text
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // 引用标记：> text
      .replace(/^>\s+/gm, '')
      // 链接： [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // 图片： ![alt](url) → alt
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // 清理多余空格和换行
      .replace(/\s+/g, ' ')
      .trim();
  };

  const getLastMessagePreview = (conversation) => {
    const lastMessage = [...(conversation.messages || [])]
      .reverse()
      .find((m) => m.id !== 'welcome' && getMessageText(m));
    if (!lastMessage) return '点击开始新对话';
    const text = stripMarkdown(getMessageText(lastMessage));
    return text.length > 22 ? `${text.slice(0, 22)}...` : text;
  };

  // Import getMessageText for getLastMessagePreview
  const getMessageText = (msg) => {
    if (!msg) return '';
    return String(msg.text ?? msg.content ?? msg.message ?? '').trim();
  };

  // ========== localStorage 持久化 ==========

  // 独立的消息备份：不依赖会话缓存，单独存当前会话的消息
  const saveMessagesBackup = () => {
    const conv = currentConversation.value;
    if (!conv) return;
    const msgs = (conv.messages || []).filter((m) => m.id !== 'welcome' && m.text?.trim());
    if (msgs.length === 0) {
      // 没有真实消息时清除旧备份，防止孤立的过期数据残留
      try { localStorage.removeItem(MESSAGES_BACKUP_KEY); } catch {}
      return;
    }
    try {
      localStorage.setItem(MESSAGES_BACKUP_KEY, JSON.stringify({
        conversationId: conv.id,
        title: conv.title,
        messages: msgs,
        savedAt: Date.now(),
      }));
    } catch (e) {
      console.warn('[Conversation] 消息备份保存失败:', e);
    }
  };

  const restoreMessagesBackup = () => {
    try {
      const raw = localStorage.getItem(MESSAGES_BACKUP_KEY);
      if (!raw) return null;
      const backup = JSON.parse(raw);
      if (!backup || !Array.isArray(backup.messages)) return null;
      return backup;
    } catch {
      return null;
    }
  };

  let saveTimer = null;

  const flushSaveCache = () => {
    // 无论是否登录、后端是否可用，始终备份到 localStorage
    // （因为 Redis 可能断开，仅依赖后端保存不可靠）
    try {
      saveLocalConversationsCache(conversations.value);
      saveMessagesBackup(); // 同时写独立备份
    } catch (e) {
      console.error('[Conversation] 缓存保存失败:', e);
    }
    saveTimer = null;
  };

  const scheduleSaveCache = (immediate = false) => {
    if (saveTimer) clearTimeout(saveTimer);
    if (immediate) {
      flushSaveCache();
    } else {
      saveTimer = setTimeout(flushSaveCache, 500);
    }
  };

  // 页面刷新/关闭前将未保存的数据刷入 localStorage
  const setupBeforeUnload = () => {
    window.addEventListener('beforeunload', () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      // 确保当前会话 ID 也持久化
      if (currentConversationId.value) {
        localStorage.setItem(CURRENT_CONVERSATION_KEY, currentConversationId.value);
      }
      // 无论 auth 模式，始终备份到 localStorage
      try {
        saveLocalConversationsCache(conversations.value);
        saveMessagesBackup();
      } catch (e) {
        console.error('[Conversation] beforeunload 保存失败:', e);
      }
    });
  };

  // 初始化时注册 beforeunload
  setupBeforeUnload();

  return {
    conversations,
    currentConversationId,
    currentConversation,
    sortedConversations,
    isLoaded,
    loadConversations,
    loadConversationMessages,
    createConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    getLastMessagePreview,
    isLocalSession,
    isBackendAvailable,
    scheduleSaveCache,
  };
});
