const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getMessageText = (msg) => {
  if (!msg) return '';
  return String(msg.text ?? msg.content ?? msg.message ?? '').trim();
};

const normalizeRole = (role) => {
  if (role === 'assistant') return 'model';
  return role || 'model';
};

const createWelcomeMessage = () => ({
  id: 'welcome',
  role: 'model',
  text: '你好！我是武理小精灵 AI 助手 (Powered by Qwen)。有什么我可以帮你的吗？',
  timestamp: new Date(),
});

const normalizeMessage = (msg = {}) => ({
  ...msg,
  id: msg.id || createMessageId(),
  role: normalizeRole(msg.role),
  text: getMessageText(msg),
  timestamp: msg.timestamp || new Date(),
});

const normalizeMessages = (list) =>
  Array.isArray(list) ? list.map((msg) => normalizeMessage(msg)) : [];

const normalizeConversation = (conv = {}, index = 0) => ({
  ...conv,
  id: String(conv.id || `local_${Date.now()}_${index}`),
  title: String(conv.title || `新会话 ${index + 1}`),
  messages: (() => {
    const normalized = normalizeMessages(conv.messages);
    return normalized.length > 0 ? normalized : [createWelcomeMessage()];
  })(),
  createdAt: conv.createdAt || new Date(),
  updatedAt: conv.updatedAt || new Date(),
});

const createLocalConversation = (title, messageCount = 0) => ({
  id: `local_${Date.now()}`,
  title: title || `新会话 ${messageCount + 1}`,
  messages: [createWelcomeMessage()],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const LOCAL_CONVERSATIONS_KEY = 'chat_local_conversations_cache';

const loadLocalConversationsCache = () => {
  try {
    const raw = localStorage.getItem(LOCAL_CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((conv, index) => normalizeConversation(conv, index));
  } catch {
    return [];
  }
};

const saveLocalConversationsCache = (list) => {
  try {
    localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(list));
  } catch {
    // quota exceeded — silently ignore
  }
};

/**
 * Ensure there is at least one conversation available.
 * Used as fallback when API calls fail or user is not authenticated.
 */
const ensureLocalFallback = (conversations, currentId) => {
  const cached = loadLocalConversationsCache();
  if (cached.length > 0) {
    conversations.value = cached;
    const hasCurrent = cached.some((c) => c.id === currentId.value);
    currentId.value = hasCurrent ? currentId.value : cached[0].id;
  } else {
    const localConv = createLocalConversation('本地会话');
    conversations.value = [localConv];
    currentId.value = localConv.id;
  }
};

export {
  createMessageId,
  getMessageText,
  normalizeRole,
  normalizeMessage,
  normalizeMessages,
  normalizeConversation,
  createWelcomeMessage,
  createLocalConversation,
  loadLocalConversationsCache,
  saveLocalConversationsCache,
  ensureLocalFallback,
  LOCAL_CONVERSATIONS_KEY,
};
