import { NextRequest } from 'next/server';
import { ApiError } from './ApiError';
import { ApiResponse } from './ApiResponse';


type HandlerFunction = (req: NextRequest, context?: any) => Promise<any>;

export function asyncHandler(fn: HandlerFunction) {
  return async (req: NextRequest, context?: any) => {
    try {
      return await fn(req, context);
    } catch (error: any) {
      console.error('API Error:', error);
      
      if (error instanceof ApiError) {
        return ApiResponse.error(error.message, error.statusCode);
      }
      
      return ApiResponse.error(error.message || "Something went wrong", 500);
    }
  };
}