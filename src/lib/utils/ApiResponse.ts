import { NextResponse } from 'next/server';

export class ApiResponse {
  static success<T>(data: T, message: string = "Success", statusCode: number = 200) {
    return NextResponse.json(
      { success: true, message, data },
      { status: statusCode }
    );
  }

  static error(message: string = "Internal Server Error", statusCode: number = 500) {
    return NextResponse.json(
      { success: false, error: message },
      { status: statusCode }
    );
  }
}