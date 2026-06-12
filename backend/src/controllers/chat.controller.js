const { AiService } = require('../services/ai.service');

let aiService = null;
const getAiService = () => {
  if (!aiService) aiService = new AiService();
  return aiService;
};

/**
 * 从消息中提取用户问题
 */
function extractQuestion(message) {
  if (!message) return '';
  const match = message.match(/用户问题[：:]\s*(.+?)(?:\s*AI回答|$)/s);
  if (match && match[1].trim()) {
    return match[1].trim();
  }
  return message.slice(0, 8);
}

/**
 * 生成会话标题
 */
const generateTitle = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const prompt = `你是一个标题生成器。请根据以下对话内容，生成一个简短标题。
规则：
1. 不超过8个汉字
2. 只输出标题，不要任何解释
3. 概括对话主题，不要直接复制原文
4. 不要加引号、冒号等符号

对话内容：
${message}

标题：`;

    const result = await getAiService().getCompletion(prompt, []);
    let title = (result.content || '').replace(/["'「」【】：:]/g, '').trim();

    if (title.length > 10) {
      title = title.slice(0, 10);
    }

    if (!title || title.length < 2) {
      title = extractQuestion(message).slice(0, 8);
    }

    res.json({ title });
  } catch (error) {
    console.error('Generate title error:', error);
    const { message = '' } = req.body || {};
    res.json({ title: extractQuestion(message).slice(0, 8) });
  }
};

module.exports = { generateTitle };
