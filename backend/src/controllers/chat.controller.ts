import { Request, Response, NextFunction } from 'express';
import { ChatService } from '../services/chat.service';
import { successResponse } from '../utils/response';

const chatService = new ChatService();

export const chat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, history } = (req as any).body;
    
    if (!message) {
      throw new Error('Message is required');
    }

    const result = await chatService.getResponse(message, history || []);
    successResponse(res, result, 'Message processed');
  } catch (error) {
    next(error);
  }
};