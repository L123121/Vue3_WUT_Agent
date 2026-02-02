// src/app.ts
// 使用正确的导入方式
import express, { Request, Response, NextFunction } from 'express';
import type { Express } from 'express'; // 单独导入类型
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const app: Express = express();
const PORT: number = parseInt(process.env.PORT || '3000', 10);

// 中间件
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    message: '武理小精灵后端服务运行正常',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 示例路由
// API 列表
app.get('/api', (req: Request, res: Response) => {
  res.json({ 
    app: '武理小精灵后端',
    version: '1.0.0',
    endpoints: [
      { method: 'GET', path: '/api/health', description: '健康检查' },
      { method: 'GET', path: '/api', description: 'API列表' },
      { method: 'GET', path: '/api/students', description: '获取学生列表' },
      { method: 'GET', path: '/api/courses', description: '获取课程列表' },
      { method: 'POST', path: '/api', description: '聊天接口' },
      { method: 'POST', path: '/api/chat', description: '聊天接口（兼容）' }
    ]
  });
});

app.get('/api/students', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: [
      { id: 1, name: '张三', studentId: '2021001', major: '计算机科学' },
      { id: 2, name: '李四', studentId: '2021002', major: '软件工程' },
      { id: 3, name: '王五', studentId: '2021003', major: '人工智能' }
    ]
  });
});

app.get('/api/courses', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: [
      { id: 1, name: 'Vue.js 前端开发', code: 'CS101', credit: 3 },
      { id: 2, name: 'Node.js 后端开发', code: 'CS102', credit: 3 },
      { id: 3, name: '数据库系统原理', code: 'CS201', credit: 4 }
    ]
  });
});

// 在 app.get('/api/courses', ...) 后面添加

// 聊天接口 - POST /api
app.post('/api', (req: Request, res: Response) => {
  try {
    const { message, history = [] } = req.body;
    
    console.log('收到聊天请求:', { 
      message: message?.substring(0, 100),
      historyLength: history.length 
    });
    
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: '消息内容不能为空',
        code: 'MESSAGE_EMPTY'
      });
    }
    
    // 智能回复
    let reply = `你好！我是武理小精灵。你说了："${message}"`;
    
    if (message.includes('你好') || message.includes('hello')) {
      reply = '你好！我是武理小精灵，有什么可以帮助你的吗？';
    } else if (message.includes('课程') || message.includes('课表')) {
      reply = '课程信息可以通过教务系统查询。需要了解哪门课程？';
    } else if (message.includes('图书馆')) {
      reply = '图书馆开放时间：周一至周日 8:00-22:00';
    } else if (message.includes('食堂') || message.includes('吃饭')) {
      reply = '食堂供应时间：早餐6:30-9:00，午餐11:00-13:00，晚餐17:00-19:00';
    } else if (message.includes('武汉理工') || message.includes('武理')) {
      reply = '武汉理工大学是教育部直属全国重点大学，是首批列入国家"211工程"和"双一流"建设高校。';
    }
    
    res.json({
      success: true,
      data: {
        reply,
        timestamp: new Date().toISOString(),
        messageId: `msg_${Date.now()}`,
        model: 'qwen-1.7b'
      }
    });
    
  } catch (error: any) {
    console.error('聊天处理错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器处理消息时出错',
      code: 'SERVER_ERROR'
    });
  }
});

// 兼容接口 - POST /api/chat
app.post('/api/chat', (req: Request, res: Response) => {
  // 直接调用 /api 的处理逻辑
  console.log('通过 /api/chat 收到请求');
  
  try {
    const { message, history = [] } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: '消息内容不能为空',
        code: 'MESSAGE_EMPTY'
      });
    }
    
    // 智能回复
    let reply = `你好！我是武理小精灵。通过兼容接口收到："${message}"`;
    
    if (message.includes('你好') || message.includes('hello')) {
      reply = '你好！我是武理小精灵，很高兴为你服务！';
    } else if (message.includes('课程') || message.includes('课表')) {
      reply = '课程信息可以通过教务系统查询。需要了解哪门课程？';
    } else if (message.includes('图书馆')) {
      reply = '图书馆开放时间：周一至周日 8:00-22:00';
    }
    
    res.json({
      success: true,
      data: {
        reply,
        timestamp: new Date().toISOString(),
        messageId: `msg_${Date.now()}`,
        model: 'qwen-1.7b',
        via: 'api/chat'
      }
    });
    
  } catch (error: any) {
    console.error('聊天处理错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器处理消息时出错',
      code: 'SERVER_ERROR'
    });
  }
});

// 然后继续现有的 404 处理...
// 404 处理
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ 
    success: false,
    error: '接口不存在',
    path: req.originalUrl
  });
});

// 错误处理
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('服务器错误:', err);
  res.status(500).json({ 
    success: false,
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('🚀 武理小精灵后端服务启动成功！');
  console.log(`📍 服务器地址：http://localhost:${PORT}`);
  console.log(`📡 API 地址：http://localhost:${PORT}/api`);
  console.log(`🏥 健康检查：http://localhost:${PORT}/api/health`);
  console.log('='.repeat(50));
});