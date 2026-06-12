const config = require('../config');
const { AiService } = require('./ai.service');

class ChatService {
  /**
   * @param {AiService|null} aiService - AI 服务实例，不传则内部创建
   */
  constructor(aiService = null) {
    this.aiService = aiService || new AiService();
  }

  async getResponse(message, history = []) {
    try {
      const result = await this.aiService.getCompletion(message, history);
      return {
        reply: result.content,
        timestamp: new Date(),
        model: config.ai.model || 'Qwen3.6-35B-A3B',
        isMock: result.isMock,
      };
    } catch (error) {
      console.error('ChatService 错误:', error);
      return {
        reply: '抱歉，AI服务处理出错，请稍后重试',
        timestamp: new Date(),
        model: config.ai.model || 'Qwen3.6-35B-A3B',
        isMock: true,
        error: error.message,
      };
    }
  }
}

module.exports = { ChatService };
