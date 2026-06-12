"use strict";

const https = require('https');
const config = require('../config');

/**
 * AI 服务
 *
 * 两种模式：
 *   1. OpenAI 兼容模式（默认）— /v2/chat/completions + Bearer 认证
 *   2. Anthropic 代理模式 — baseUrl 含 "/anthropic" 时，x-api-key + /v1/messages
 */
class AiService {
  constructor() {
    this.apiKey = config.ai.apiKey || '';
    this.baseUrl = config.ai.baseUrl || 'https://maas-api.cn-huabei-1.xf-yun.com/v2';
    this.model = config.ai.model || 'xopqwen36v35b';
    this.maxTokens = config.ai.maxTokens || 4000;
    this.temperature = config.ai.temperature || 0.7;
    this.timeout = config.ai.timeout || 60000;

    // 自动检测 Anthropic 代理模式
    this.anthropicMode = this.baseUrl.includes('/anthropic');
  }

  _buildHeaders(path) {
    if (this.anthropicMode) {
      return {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        ...(path.includes('/messages') ? { 'anthropic-version': '2023-06-01' } : {}),
      };
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  _buildOptions(path, method = 'POST') {
    const fullUrl = this.baseUrl + path;
    const urlObj = new URL(fullUrl);
    return {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: this._buildHeaders(path),
      timeout: this.timeout,
    };
  }

  _buildMessages(message, history = []) {
    return [
      ...history.map(h => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      })),
      { role: 'user', content: message },
    ];
  }

  _buildPayload(message, history, stream = false) {
    return {
      model: this.model,
      messages: this._buildMessages(message, history),
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream,
    };
  }

  // ========== 非流式 ==========

  async getCompletion(message, history = []) {
    if (!this.apiKey) {
      console.warn('[AI] API Key 缺失，使用模拟模式');
      return { content: this.getMockResponse(message), isMock: true };
    }

    const path = this.anthropicMode ? '/v1/messages' : '/v2/chat/completions';
    const payload = this._buildPayload(message, history, false);
    const body = JSON.stringify(payload);
    const options = this._buildOptions(path);
    options.headers['Content-Length'] = Buffer.byteLength(body, 'utf8');

    console.log(`[AI] ${options.hostname}${options.path} model=${this.model} bodyLen=${body.length}`);

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            console.error(`[AI] ${res.statusCode}: ${data.substring(0, 200)}`);
            return resolve({ content: this.getMockResponse(message), isMock: true });
          }
          try {
            const json = JSON.parse(data);
            let content = '';
            if (this.anthropicMode) {
              content = json.content?.[0]?.text || '';
            } else {
              content = json.choices?.[0]?.message?.content || '';
            }
            if (content) {
              console.log(`[AI] 响应 ${content.length} 字符`);
              resolve({ content, isMock: false });
            } else {
              console.warn('[AI] 空响应:', JSON.stringify(json).substring(0, 200));
              resolve({ content: this.getMockResponse(message), isMock: true });
            }
          } catch (e) {
            console.error('[AI] 解析失败:', e.message);
            resolve({ content: this.getMockResponse(message), isMock: true });
          }
        });
      });
      req.on('error', (err) => {
        console.error('[AI] 请求错误:', err.message);
        resolve({ content: this.getMockResponse(message), isMock: true });
      });
      req.on('timeout', () => {
        console.error('[AI] 请求超时');
        req.destroy();
        resolve({ content: this.getMockResponse(message), isMock: true });
      });
      req.write(body);
      req.end();
    });
  }

  // ========== 流式 ==========

  async *getCompletionStream(message, history = []) {
    if (!this.apiKey) {
      const mock = this.getMockResponse(message);
      for (const c of mock) yield { content: c, done: false };
      yield { content: '', done: true };
      return;
    }

    const path = this.anthropicMode ? '/v1/messages' : '/v2/chat/completions';
    const payload = this._buildPayload(message, history, true);
    const body = JSON.stringify(payload);
    const options = this._buildOptions(path);
    options.headers['Content-Length'] = Buffer.byteLength(body, 'utf8');

    console.log(`[AI 流式] ${options.hostname}${options.path} model=${this.model} bodyLen=${body.length}`);

    let res;
    try {
      res = await new Promise((resolve, reject) => {
        const req = https.request(options, r => resolve(r));
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(body);
        req.end();
      });
    } catch (err) {
      console.error('[AI 流式] 失败:', err.message);
      yield { content: `[${err.message}]`, done: false };
      yield { content: '', done: true };
      return;
    }

    if (res.statusCode !== 200) {
      let err = '';
      for await (const c of res) err += c;
      console.error(`[AI 流式] ${res.statusCode}: ${err.substring(0, 200)}`);
      yield { content: `[错误 ${res.statusCode}]`, done: false };
      yield { content: '', done: true };
      return;
    }

    yield* this._parseStream(res);
  }

  async *_parseStream(res) {
    let buf = '';
    for await (const chunk of res) {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('event:')) continue;
        if (!t.startsWith('data:')) continue;
        const d = t.slice(5).trim();
        if (d === '[DONE]') { yield { content: '', done: true }; return; }
        try {
          const j = JSON.parse(d);
          let content = '';
          let done = false;
          if (this.anthropicMode) {
            if (j.type === 'content_block_delta' && j.delta?.text) content = j.delta.text;
            if (j.type === 'message_stop' || j.type === 'message_delta') done = true;
          } else {
            content = j.choices?.[0]?.delta?.content || '';
          }
          if (content) yield { content, done: false };
          if (done) { yield { content: '', done: true }; return; }
        } catch { /* skip */ }
      }
    }
    yield { content: '', done: true };
  }

  getMockResponse(message) {
    return `收到您的问题："${message}"。AI 服务暂时不可用，请稍后再试。`;
  }
}

module.exports = { AiService };
