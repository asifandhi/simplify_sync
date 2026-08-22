import { getChatByDeviceId, insertChatMessage } from "@/db/sqlite";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { NextResponse } from "next/server";
import { getIO } from "@/lib/socket";

export const GET = asyncHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const device_id = searchParams.get("device_id");

  if (!device_id) {
    return ApiResponse.error("Device not found", 404);
  }
  const chatHistory = getChatByDeviceId(device_id) || [];
  return ApiResponse.success({ messages: chatHistory.reverse() });
});

export const POST = asyncHandler(async (request: Request) => {
  const data = await request.json();

  if (!data.device_id) {
    return ApiResponse.error("device_id is required", 400);
  }

  const savedMessage = insertChatMessage({
    device_id: data.device_id,
    sender: "me",
    content_type: data.content_type || "text",
    content: data.content,
    file_path: data.file_path,
    preview_data: data.preview_data,
    is_view_once: data.is_view_once,
  });

  try {
    const io = getIO();
    io.in(data.device_id).emit("receive_message", savedMessage);
  } catch (err) {
    console.error("[API/Chat] Failed to broadcast message:", err);
  }

  return ApiResponse.success(savedMessage);
});
