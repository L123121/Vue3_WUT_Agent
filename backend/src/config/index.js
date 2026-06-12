// config.js
require('dotenv').config();

module.exports = {
  // AI 模型服务（OpenAI-compatible API，适配通义千问 Qwen / 讯飞 MaaS 等）
  ai: {
    apiKey: process.env.AI_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
    baseUrl: process.env.AI_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'https://maas-api.cn-huabei-1.xf-yun.com',
    model: process.env.AI_MODEL || 'xopqwen36v35b',
    maxTokens: 4000,
    temperature: 0.7,
    timeout: 60000,
  },
  // 讯飞配置（保留用于 Embedding / 星火知识库）
  xunfei: {
    apiKey: process.env.XUNFEI_API_KEY || '',
    appId: process.env.XUNFEI_APP_ID || '',
  },
  // Embedding 配置
  embedding: {
    host: process.env.XUNFEI_EMBEDDING_HOST || 'maas-api.cn-huabei-1.xf-yun.com',
    path: '/v2/embeddings',
    model: process.env.XUNFEI_EMBEDDING_MODEL || 'emb-text-001',
  },
};
