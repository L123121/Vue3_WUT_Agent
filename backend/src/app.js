const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { AiService } = require('./services/ai.service');
const { ChatService } = require('./services/chat.service');
const config = require('./config');
const { RagService } = require('./services/rag.service');
const apiRoutes = require('./routes/index');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

const aiService = new AiService();
const chatService = new ChatService(aiService);
const ragService = new RagService();

// 中间件
const isProduction = process.env.NODE_ENV === 'production';
app.use(cors({
  origin: isProduction
    ? process.env.CORS_ORIGIN || true
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 速率限制
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { success: false, error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 健康检查
app.get('/api/health', (req, res) => {
  const hasApiConfig = !!config.ai.apiKey;
  res.json({
    status: 'ok',
    message: '武理小精灵后端服务运行正常',
    timestamp: new Date().toISOString(),
    ai_service: {
      enabled: hasApiConfig,
      provider: 'Qwen (通义千问)',
      model: config.ai.model || 'Qwen3.6-35B-A3B',
      status: hasApiConfig ? '配置正常' : '模拟模式',
    },
    storage: 'memory',
  });
});

// API 列表
app.get('/api', (req, res) => {
  res.json({
    app: '武理小精灵后端',
    version: '1.0.0',
    endpoints: [
      { method: 'GET', path: '/api/health', description: '健康检查' },
      { method: 'GET', path: '/api', description: 'API列表' },
      { method: 'GET', path: '/api/usage', description: '已弃用' },
      { method: 'POST', path: '/api', description: '聊天接口（非流式）' },
      { method: 'POST', path: '/api/stream', description: '流式聊天接口' },
      { method: 'POST', path: '/api/chat/title', description: '生成会话标题' },
    ],
  });
});

app.get('/api/usage', (req, res) => {
  res.json({ success: true, data: { summary: { totalTokens: 0, estimatedCost: 0 } } });
});

// ========== 聊天接口（内联处理，使用 app.js 单例） ==========

const MAX_MESSAGE_LENGTH = 50000; // 增加到 50000 字符（支持文件内容嵌入）
const MAX_HISTORY_LENGTH = 50;

const handleChatRequest = async (req, res, endpoint = '/api') => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: '消息内容不能为空',
        code: 'MESSAGE_EMPTY',
      });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `消息内容过长，最多${MAX_MESSAGE_LENGTH}个字符`,
        code: 'MESSAGE_TOO_LONG',
      });
    }

    if (!Array.isArray(history) || history.length > MAX_HISTORY_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `历史消息过多，最多${MAX_HISTORY_LENGTH}条`,
        code: 'HISTORY_TOO_LONG',
      });
    }

    const result = await chatService.getResponse(message.trim(), history);

    console.log(`✅ ${endpoint} AI回复完成`);
    res.json({
      success: true,
      data: {
        reply: result.reply,
        timestamp: result.timestamp,
        messageId: `msg_${Date.now()}`,
        model: result.model,
        isMock: result.isMock,
        via: endpoint,
      },
    });
  } catch (error) {
    console.error(`❌ ${endpoint} 处理错误:`, error);
    res.status(500).json({
      success: false,
      error: 'AI服务处理失败',
      code: 'SERVER_ERROR',
    });
  }
};

// 主聊天接口（非流式）
app.post('/api', chatLimiter, (req, res) => {
  handleChatRequest(req, res, '/api');
});

// 兼容接口
app.post('/api/chat', chatLimiter, (req, res) => {
  handleChatRequest(req, res, '/api/chat');
});

// 生成会话标题
const { generateTitle } = require('./controllers/chat.controller');
app.post('/api/chat/title', chatLimiter, generateTitle);

// 注册子路由（通过 routes/index.js 统一入口）
// 包含: /api/rag
app.use('/api', apiRoutes);

// SSE 流式聊天接口
app.post('/api/stream', chatLimiter, async (req, res) => {
  let streamAborted = false;

  // 客户端断开连接时停止处理
  req.on('close', () => { streamAborted = true; });

  try {
    const { message, history = [], conversationId, enableRag = false, files = [] } = req.body;
    // 注意：文件内容已由前端直接嵌入到 message 中，无需后端重复拼接

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ success: false, error: '消息内容不能为空' });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `消息内容过长，最多${MAX_MESSAGE_LENGTH}个字符`,
      });
    }

    if (!Array.isArray(history) || history.length > MAX_HISTORY_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `历史消息过多，最多${MAX_HISTORY_LENGTH}条`,
      });
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    if (enableRag) {
      for await (const chunk of ragService.chatStream(message.trim(), history)) {
        if (streamAborted) break;
        if (chunk.type === 'sources') {
          res.write(`data: ${JSON.stringify({ sources: chunk.sources })}\n\n`);
        } else if (chunk.type === 'content') {
          if (chunk.done) {
            res.write(`data: [DONE]\n\n`);
          } else {
            res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
          }
        }
      }
    } else {
      for await (const chunk of aiService.getCompletionStream(message.trim(), history)) {
        if (streamAborted) break;
        if (chunk.done) {
          res.write(`data: [DONE]\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        }
      }
    }

    if (!streamAborted) {
      console.log('✅ /api/stream 流式响应完成');
      res.end();
    }
  } catch (error) {
    if (!streamAborted) {
      console.error('❌ /api/stream 错误:', error);
      res.write(`data: ${JSON.stringify({ error: '流式响应出错，请重试' })}\n\n`);
      res.end();
    }
  }
});

// ========== 聊天文件上传 ==========
const path = require('path');
const fs = require('fs');
const { chatUpload, parseFile, cleanupFile } = require('./services/file-upload.service');

// 上传目录对外可访问
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

/**
 * 修复 multer 可能将 UTF-8 文件名误读为 Latin-1 的编码问题
 */
function fixFilenameEncoding(name) {
  if (!name) return name;
  try {
    // 检查是否包含需要修复的字符（非 ASCII 扩展字符被当作 Latin-1 解码的典型现象）
    // 如果重新编码可得到有效的 UTF-8 则修复
    const reencoded = Buffer.from(name, 'latin1').toString('utf8');
    // 如果修复后包含更多中文字符，则采用修复后的版本
    const origChinese = (name.match(/[ÿ-￿]/g) || []).length;
    const fixedChinese = (reencoded.match(/[一-鿿]/g) || []).length;
    if (fixedChinese > origChinese) {
      return reencoded;
    }
  } catch {}
  return name;
}

// 聊天文件上传接口
app.post('/api/chat/upload', chatUpload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '请上传文件' });
  }

  try {
    const file = req.file;
    const originalName = fixFilenameEncoding(file.originalname);
    const isImage = file.mimetype.startsWith('image/');
    let textContent = null;

    // 文档类文件解析文字内容
    if (!isImage) {
      try {
        textContent = await parseFile(file.path, originalName);
      } catch (e) {
        console.warn('[ChatUpload] 文件解析失败:', e.message);
      }
    }

    // 确保返回给前端的文字内容是有效的 UTF-8
    if (textContent && Buffer.isBuffer(textContent)) {
      textContent = textContent.toString('utf8');
    }

    res.json({
      success: true,
      data: {
        url: `/uploads/${file.filename}`,
        name: originalName,
        type: file.mimetype,
        size: file.size,
        textContent,
        isImage,
      }
    });
  } catch (error) {
    console.error('[ChatUpload] 上传失败:', error);
    res.status(500).json({ success: false, error: '文件上传失败' });
  }
});

// ========== 生产环境托管前端 ==========
if (isProduction) {
  const frontendDist = path.join(__dirname, '../../dist');
  app.use(express.static(frontendDist));
  // SPA fallback：非 API 请求返回 index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    }
  });
}

// 404 处理
app.use((req, res) => {
  // 生产环境中非 API 请求已被上面的 SPA fallback 捕获，不会走到这里
  res.status(404).json({
    success: false,
    error: '接口不存在',
    path: req.originalUrl,
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
  });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', async () => {
  const hasApi = !!config.ai.apiKey;
  console.log('='.repeat(60));
  console.log('🚀 武理小精灵后端服务启动成功！');
  console.log(`📍 地址：http://localhost:${PORT}`);
  console.log(`🤖 AI模型：${config.ai.model || 'Qwen3.6-35B-A3B'}`);
  console.log(`📡 模式：${hasApi ? 'Qwen (通义千问) 在线模式' : '模拟模式'}`);
  console.log(`💾 存储：本地文件 (data/store.json)`);
  console.log(`📚 RAG知识库：星火知识库 (chatdoc.xfyun.cn)`);
  console.log('='.repeat(60));
});
