import { defineStore } from 'pinia';
import { ref } from 'vue';
import { sendMessageStream, connectionManager, generateTitle } from '../api/chat.js';
import { useConversationStore } from './conversation.store.js';
import { useSkillStore } from './skill.store.js';
import {
  createMessageId,
  getMessageText,
  normalizeRole,
  normalizeMessages,
  createWelcomeMessage,
  createLocalConversation,
} from '../utils/chatHelpers.js';

// 直接 localStorage 持久化 — 完全绕过 store 机制，避免任何序列化问题
const DIRECT_BACKUP_KEY = 'chat_msgs_direct';

const saveDirectBackup = (conv) => {
  if (!conv) return;
  const msgs = (conv.messages || []).filter((m) => m.id !== 'welcome' && m.text?.trim());
  if (msgs.length === 0) {
    try { localStorage.removeItem(DIRECT_BACKUP_KEY); } catch {}
    return;
  }
  try {
    const data = JSON.stringify({
      conversationId: conv.id,
      title: conv.title,
      messages: msgs,
    });
    localStorage.setItem(DIRECT_BACKUP_KEY, data);
  } catch (e) {
    console.warn('[Message] 直接备份失败:', e);
  }
};

const loadDirectBackup = () => {
  try {
    const raw = localStorage.getItem(DIRECT_BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const useMessageStore = defineStore('message', () => {
  let conversationStore = null;
  let skillStore = null;

  const getConversationStore = () => {
    if (!conversationStore) conversationStore = useConversationStore();
    return conversationStore;
  };

  const getSkillStore = () => {
    if (!skillStore) skillStore = useSkillStore();
    return skillStore;
  };

  const isLoading = ref(false);
  const currentStreamingId = ref(null);
  const isConnected = ref(true);
  const isReconnecting = ref(false);
  const reconnectAttempt = ref(0);

  let currentAbortController = null;
  let activeStreamingConversationId = null;

  connectionManager.subscribe((event) => {
    if (event === 'connected') {
      isConnected.value = true;
      isReconnecting.value = false;
      reconnectAttempt.value = 0;
    } else if (event === 'disconnected') {
      isConnected.value = false;
    }
  });

  const buildHistory = (msgs, currentUserMessageId) => {
    const rawHistory = msgs
      .filter((m) => m.id !== 'welcome' && !m.isError && m.id !== currentUserMessageId && getMessageText(m))
      .slice(-20)
      .map((m) => ({
        role: normalizeRole(m.role) === 'model' ? 'assistant' : normalizeRole(m.role),
        content: getMessageText(m),
      }));

    const history = [];
    let lastRole = '';
    for (const m of rawHistory) {
      if (m.role === lastRole && history.length > 0) history.pop();
      history.push(m);
      lastRole = m.role;
    }
    if (history.length > 0 && history[history.length - 1].role === 'user') history.pop();
    return history;
  };

  const sendMessage = async (text, enableRag = false, retryMsgId = null, fileData = null) => {
    const trimmedText = text.trim();
    const convStore = getConversationStore();
    let conv = convStore.currentConversation;

    if (!conv) {
      conv = createLocalConversation('本地会话');
      convStore.conversations.push(conv);
      convStore.currentConversationId = conv.id;
    }

    if (!trimmedText && !fileData) return;
    if (isLoading.value) return;

    const conversationId = conv.id;
    let convIndex = convStore.conversations.findIndex((c) => c.id === conversationId);
    if (convIndex === -1) {
      convStore.conversations.push({ ...conv, messages: normalizeMessages(conv.messages) });
      convIndex = convStore.conversations.findIndex((c) => c.id === conversationId);
      if (convIndex === -1) return;
    }

    // 如果会话没有消息，尝试从直接备份恢复
    const hasRealMsgs = (convStore.conversations[convIndex].messages || []).some((m) => m.id !== 'welcome' && m.text?.trim());
    if (!hasRealMsgs) {
      const backup = loadDirectBackup();
      if (backup && Array.isArray(backup.messages) && backup.messages.length > 0) {
        convStore.conversations[convIndex].messages = normalizeMessages(backup.messages);
      }
    }

    let userMsg;
    if (retryMsgId) {
      const idx = convStore.conversations[convIndex].messages?.findIndex((m) => m.id === retryMsgId);
      if (idx > -1) {
        userMsg = convStore.conversations[convIndex].messages[idx];
        convStore.conversations[convIndex].messages.splice(idx, 2);
      }
    }

    if (!userMsg) {
      userMsg = { id: createMessageId(), role: 'user', text: trimmedText, timestamp: new Date(), files: fileData ? [fileData] : [] };
      if (!convStore.conversations[convIndex].messages) convStore.conversations[convIndex].messages = [];
      convStore.conversations[convIndex].messages.push(userMsg);
    } else {
      convStore.conversations[convIndex].messages.push(userMsg);
    }
    // 用户消息发出后立即持久化，防止页面刷新丢失
    convStore.scheduleSaveCache(true);
    saveDirectBackup(convStore.conversations[convIndex]);

    isLoading.value = true;
    activeStreamingConversationId = conversationId;
    currentAbortController = new AbortController();

    const history = buildHistory(convStore.conversations[convIndex].messages || [], userMsg.id);
    const skillPrompt = getSkillStore().buildSystemPrompt();
    const requestHistory = skillPrompt
      ? [{ role: 'system', content: skillPrompt }, ...history]
      : history;

    const aiMsgId = createMessageId();
    const aiMsg = { id: aiMsgId, role: 'model', text: '', timestamp: new Date(), sources: [] };
    convStore.conversations[convIndex].messages.push(aiMsg);
    currentStreamingId.value = aiMsgId;

    // RAF 批量合并：高频 chunk 累积到浏览器下一帧再一次性写入
    let pendingContent = '';
    let rafId = null;

    // 将文件文字内容直接拼到消息中，确保 AI 一定能看到
    let messageToSend = trimmedText;
    if (fileData?.textContent) {
      const fileBlock = `[文件: ${fileData.name}]\n\`\`\`\n${fileData.textContent}\n\`\`\``;
      messageToSend = trimmedText
        ? `${fileBlock}\n\n用户问题: ${trimmedText}`
        : `${fileBlock}\n\n请根据以上文件内容回答。`;
    }

    return new Promise((resolve) => {
      sendMessageStream(messageToSend, requestHistory, {
        onChunk: (content) => {
          pendingContent += content;
          if (!rafId) {
            rafId = requestAnimationFrame(() => {
              const msgs = convStore.conversations[convIndex]?.messages;
              if (msgs) {
                const msgIdx = msgs.findIndex((m) => m.id === aiMsgId);
                if (msgIdx !== -1) {
                  msgs[msgIdx] = { ...msgs[msgIdx], text: msgs[msgIdx].text + pendingContent };
                }
              }
              pendingContent = '';
              rafId = null;
            });
          }
        },
        onSources: (sources) => {
          const msgs = convStore.conversations[convIndex]?.messages;
          if (msgs) {
            const msgIdx = msgs.findIndex((m) => m.id === aiMsgId);
            if (msgIdx !== -1) {
              msgs[msgIdx] = { ...msgs[msgIdx], sources };
            }
          }
        },
        onRetry: () => {
          isReconnecting.value = true;
          reconnectAttempt.value = reconnectAttempt.value + 1;
        },
        onDone: () => {
          // 刷掉 RAF 缓冲区中残留的最后一个 chunk
          if (rafId) cancelAnimationFrame(rafId);
          if (pendingContent) {
            const msgs = convStore.conversations[convIndex]?.messages;
            if (msgs) {
              const msgIdx = msgs.findIndex((m) => m.id === aiMsgId);
              if (msgIdx !== -1) {
                msgs[msgIdx] = { ...msgs[msgIdx], text: msgs[msgIdx].text + pendingContent };
              }
            }
          }
          pendingContent = '';
          rafId = null;

          const conv = convStore.conversations[convIndex];
          if (conv && (conv.title.startsWith('新会话') || conv.title === '默认会话')) {
            const userText = trimmedText;
            const aiMsgObj = conv.messages?.find((m) => m.id === aiMsgId);
            const replyText = aiMsgObj?.text || '';
            if (userText) {
              conv.title = '正在生成标题...';
              const titleInput = `用户问题：${userText}\nAI回答：${replyText.slice(0, 200)}`;
              generateTitle(titleInput).then((title) => {
                conv.title = title;
                convStore.renameConversation(conversationId, title);
                // 持久化标题变化，防止刷新后标题回退到"正在生成标题..."
                convStore.scheduleSaveCache(true);
              });
            }
          }

          currentStreamingId.value = null;
          isLoading.value = false;
          isReconnecting.value = false;
          reconnectAttempt.value = 0;
          activeStreamingConversationId = null;
          currentAbortController = null;
          // 流式完成，持久化会话消息到 localStorage
          convStore.scheduleSaveCache(true);
          saveDirectBackup(convStore.conversations[convIndex]);
          resolve();
        },
        onError: () => {
          // 丢弃缓冲区，错误状态下不需要保留未刷的内容
          if (rafId) cancelAnimationFrame(rafId);
          pendingContent = '';
          rafId = null;

          const msgs = convStore.conversations[convIndex]?.messages;
          if (msgs) {
            const msgIdx = msgs.findIndex((m) => m.id === aiMsgId);
            if (msgIdx !== -1 && !msgs[msgIdx].text) {
              msgs[msgIdx] = { ...msgs[msgIdx], text: '抱歉，连接服务器失败，请检查后端服务是否启动。', isError: true };
            }
            const userIdx = msgs.findIndex((m) => m.id === userMsg.id);
            if (userIdx !== -1) {
              msgs[userIdx] = { ...msgs[userIdx], canRetry: true };
            }
          }

          currentStreamingId.value = null;
          isLoading.value = false;
          isReconnecting.value = false;
          activeStreamingConversationId = null;
          currentAbortController = null;
          // 错误状态下也持久化（保留错误消息和重试标记）
          convStore.scheduleSaveCache(true);
          saveDirectBackup(convStore.conversations[convIndex]);
          resolve();
        },
        onAbort: () => {
          currentStreamingId.value = null;
          isLoading.value = false;
          isReconnecting.value = false;
          activeStreamingConversationId = null;
          currentAbortController = null;
          resolve();
        },
      }, {
        signal: currentAbortController.signal,
        conversationId,
        enableRag,
        files: fileData ? [fileData] : [],
      });
    });
  };

  const retryMessage = async (msgId) => {
    const convStore = getConversationStore();
    const conv = convStore.currentConversation;
    if (!conv) return;
    const msg = conv.messages?.find((m) => m.id === msgId);
    if (!msg || msg.role !== 'user' || !msg.canRetry) return;
    msg.canRetry = false;
    await sendMessage(getMessageText(msg), false, msgId);
  };

  const getConversationHistory = () => {
    const convStore = getConversationStore();
    const messages = convStore.currentConversation?.messages || [];
    return messages
      .filter((m) => m.id !== 'welcome' && !m.isError)
      .map((m) => ({
        role: m.role,
        content: getMessageText(m),
        timestamp: m.timestamp,
      }));
  };

  const deleteMessage = (id) => {
    const convStore = getConversationStore();
    const conv = convStore.currentConversation;
    if (!conv || id === 'welcome') return;
    const index = conv.messages?.findIndex((m) => m.id === id);
    if (index > -1) {
      conv.messages.splice(index, 1);
      convStore.scheduleSaveCache(true);
    }
  };

  const clearMessages = async () => {
    const convStore = getConversationStore();
    const conv = convStore.currentConversation;
    if (!conv) return;
    conv.messages = [createWelcomeMessage()];
    convStore.scheduleSaveCache(true);
    // 清空备份，防止刷新后 tryRestoreFromBackup 恢复旧消息
    try { localStorage.removeItem('chat_messages_backup'); } catch {}
    try { localStorage.removeItem('chat_msgs_direct'); } catch {}

    if (!convStore.isLocalSession(conv.id) && convStore.isBackendAvailable()) {
      try {
        const { clearConversationMessages } = await import('../api/conversations.js');
        await clearConversationMessages(conv.id);
      } catch (error) {
        console.error('清空消息失败:', error);
      }
    }
  };

  const abortCurrentRequest = () => {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
      activeStreamingConversationId = null;
      currentStreamingId.value = null;
      isLoading.value = false;
    }
  };

  return {
    isLoading,
    currentStreamingId,
    isConnected,
    isReconnecting,
    reconnectAttempt,
    sendMessage,
    retryMessage,
    getConversationHistory,
    deleteMessage,
    clearMessages,
    abortCurrentRequest,
  };
});
