const API_URL = '/api';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000;
const STREAM_STALL_TIMEOUT = 60000; // 60s without data = stalled

import { getAuthHeaders, apiGet, apiPost } from './client.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getExponentialDelay = (attempt) => {
  const delayMs = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
  return delayMs + Math.random() * 1000;
};

// Connection state management
export const connectionManager = {
  isConnected: true,
  lastHeartbeat: Date.now(),
  pendingMessages: [],
  listeners: new Set(),

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  },

  notify(event, data) {
    this.listeners.forEach((cb) => cb(event, data));
  },

  setConnected(connected) {
    const wasConnected = this.isConnected;
    this.isConnected = connected;
    if (wasConnected !== connected) {
      this.notify(connected ? 'connected' : 'disconnected');
      if (connected) this.flushPendingMessages();
    }
  },

  addPendingMessage(message) {
    this.pendingMessages.push({ ...message, timestamp: Date.now() });
    this.savePendingMessages();
  },

  removePendingMessage(id) {
    this.pendingMessages = this.pendingMessages.filter((m) => m.id !== id);
    this.savePendingMessages();
  },

  savePendingMessages() {
    try {
      localStorage.setItem('pending_messages', JSON.stringify(this.pendingMessages));
    } catch (e) {
      console.warn('Failed to save pending messages:', e);
    }
  },

  loadPendingMessages() {
    try {
      const stored = localStorage.getItem('pending_messages');
      if (stored) {
        this.pendingMessages = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load pending messages:', e);
    }
  },

  clearPendingMessages() {
    this.pendingMessages = [];
    localStorage.removeItem('pending_messages');
  },

  async flushPendingMessages() {
    if (this.pendingMessages.length === 0) return;
    // Notify listeners about pending messages to flush
    this.notify('flush-pending', this.pendingMessages);
  },
};

// Heartbeat
let heartbeatTimer = null;

const startHeartbeat = () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  heartbeatTimer = setInterval(async () => {
    if (!connectionManager.isConnected) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT);

      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        connectionManager.lastHeartbeat = Date.now();
        connectionManager.setConnected(true);
      } else {
        connectionManager.setConnected(false);
      }
    } catch {
      connectionManager.setConnected(false);
    }
  }, HEARTBEAT_INTERVAL);
};

connectionManager.loadPendingMessages();
startHeartbeat();

// Non-streaming message
export const sendMessageToBackend = async (message, history = [], retries = MAX_RETRIES) => {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message, history }),
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    connectionManager.setConnected(true);
    return data.data.reply || '抱歉，我没有收到回复。';
  } catch (error) {
    console.error('Chat API Error:', error);
    connectionManager.setConnected(false);

    if (retries > 0) {
      const retryDelay = getExponentialDelay(MAX_RETRIES - retries);
      await delay(retryDelay);
      return sendMessageToBackend(message, history, retries - 1);
    }
    throw error;
  }
};

// Streaming message with stall detection
export const sendMessageStream = async (message, history = [], callbacks, options = {}) => {
  const controller = options.signal ? { abort: () => {} } : new AbortController();
  const signal = options.signal || controller.signal;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const attempt = options.attempt ?? 0;
  const conversationId = options.conversationId;
  const enableRag = options.enableRag ?? false;

  const messageId = `msg_${Date.now()}`;
  if (attempt === 0) {
    connectionManager.addPendingMessage({ id: messageId, message, history, conversationId });
  }

  try {
    const response = await fetch(`${API_URL}/stream`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message, history, conversationId, enableRag, files: options.files || [] }),
      signal,
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    if (!response.body) throw new Error('Response body is null');

    connectionManager.setConnected(true);
    connectionManager.removePendingMessage(messageId);

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let lastDataTime = Date.now();

    // Stall detection timer
    const stallCheck = setInterval(() => {
      if (Date.now() - lastDataTime > STREAM_STALL_TIMEOUT) {
        clearInterval(stallCheck);
        reader.cancel();
        connectionManager.setConnected(false);
        // Will trigger reconnection via the catch block
      }
    }, 5000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          clearInterval(stallCheck);
          callbacks.onDone();
          break;
        }

        lastDataTime = Date.now();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') {
            clearInterval(stallCheck);
            callbacks.onDone();
            return;
          }

          try {
            const json = JSON.parse(data);

            // 兼容两种流式格式：
            //   {"content":"..."}              — 标准格式
            //   {"choices":[{"delta":{"content":"..."}}]} — OpenAI 兼容格式
            let content = json.content;
            if (!content && json.choices?.[0]?.delta?.content) {
              content = json.choices[0].delta.content;
            }
            if (content) callbacks.onChunk(content);
            if (json.sources) callbacks.onSources?.(json.sources);
            if (json.error) {
              clearInterval(stallCheck);
              callbacks.onError(new Error(json.error));
              return;
            }
          } catch {
            // skip parse errors
          }
        }
      }
    } finally {
      clearInterval(stallCheck);
    }
  } catch (error) {
    connectionManager.setConnected(false);

    if (error.name === 'AbortError') {
      connectionManager.removePendingMessage(messageId);
      callbacks.onAbort?.();
      return;
    }

    // Exponential backoff retry
    if (attempt < maxRetries) {
      const retryDelay = getExponentialDelay(attempt);
      callbacks.onRetry?.(attempt + 1, maxRetries, retryDelay);
      await delay(retryDelay);
      return sendMessageStream(message, history, callbacks, {
        ...options,
        attempt: attempt + 1,
        maxRetries,
      });
    }

    connectionManager.removePendingMessage(messageId);
    callbacks.onError(error);
  }
};

export const fetchUsageStats = async (hours = 24) => {
  const response = await apiGet(`/usage?hours=${hours}`);
  if (!response.ok) throw new Error(`Usage API error: ${response.status}`);

  const payload = await response.json();
  if (!payload?.success) throw new Error(payload?.error || 'Failed to fetch usage data');

  return payload.data;
};

export const uploadChatFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  // 注意：不设置 Content-Type，让浏览器自动设为 multipart/form-data
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_URL}/chat/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || '文件上传失败');
  }
  return response.json();
};

export const generateTitle = async (message) => {
  try {
    const response = await apiPost('/chat/title', { message });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    return data.title || message.slice(0, 18);
  } catch {
    return message.slice(0, 18);
  }
};
