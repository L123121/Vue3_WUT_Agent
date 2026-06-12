const { Router } = require('express');
const ragRoutes = require('./rag.routes');

const router = Router();

// 聊天接口（/api/chat, /api/stream, /api/chat/title）已在 app.js 中内联注册
router.use('/rag', ragRoutes);

module.exports = router;
