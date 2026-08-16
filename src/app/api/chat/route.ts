import { getChatByDeviceId } from "@/db/sqlite";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { NextResponse } from "next/server";

export const GET = asyncHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const device_id = searchParams.get("device_id");

  if (!device_id) {
    return ApiResponse.error("Device not found", 404);
  }
  const chatHistory = getChatByDeviceId(device_id) || [];
  return ApiResponse.success({ messages: chatHistory.reverse() });
});
