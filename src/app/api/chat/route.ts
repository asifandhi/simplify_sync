import { getChatByDeviceId, getPendingChatMessages, insertChatMessage, deleteMultipleChatMessages, deleteAllChatMessages } from "@/db/sqlite";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { fetchOpenGraph } from "@/lib/utils/openGraph";

export const GET = asyncHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const queryDeviceId = searchParams.get("device_id");
  const authDeviceId = request.headers.get("x-device-id");

  // If authenticated (mobile), strictly use authDeviceId. Otherwise (Web UI), use query parameter.
  const device_id = authDeviceId || queryDeviceId;

  if (!device_id) {
    return ApiResponse.error("Device not identified", 400);
  }

  // Prevent authenticated mobile clients from reading other devices' chats (IDOR protection)
  if (authDeviceId && queryDeviceId && authDeviceId !== queryDeviceId) {
    return ApiResponse.error("Unauthorized: Cannot access other device's chat", 403);
  }
  
  if (searchParams.get("pending") === "true") {
    const pendingMessages = getPendingChatMessages(device_id);
    return ApiResponse.success({ messages: pendingMessages });
  }

  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  
  const chatHistory = getChatByDeviceId(device_id, limit, offset) || [];
  return ApiResponse.success({ messages: chatHistory.reverse() });
});

export const POST = asyncHandler(async (request: Request) => {
  const data = await request.json();
  const authDeviceId = request.headers.get("x-device-id");
  
  // If authenticated (mobile), strictly use authDeviceId. Otherwise (Web UI), use body parameter.
  const device_id = authDeviceId || data.device_id;

  if (!device_id) {
    return ApiResponse.error("device_id is required", 400);
  }

  // Prevent authenticated mobile clients from posting to other devices' chats
  if (authDeviceId && data.device_id && authDeviceId !== data.device_id) {
    return ApiResponse.error("Unauthorized: Cannot post to other device's chat", 403);
  }

  let finalPreviewData = data.preview_data;
  if ((data.content_type || "text") === "text" && data.content && !finalPreviewData) {
    const ogPreview = await fetchOpenGraph(data.content);
    if (ogPreview) {
      finalPreviewData = ogPreview;
    }
  }

  const savedMessage = insertChatMessage({
    device_id: device_id,
    sender: "me",
    content_type: data.content_type || "text",
    content: data.content,
    file_path: data.file_path,
    preview_data: finalPreviewData,
    is_view_once: data.is_view_once,
  });

  // ponytail: broadcast removed — messages are now sent exclusively through socket
  // send_message handler which does persist + broadcast (single emit path)

  return ApiResponse.success(savedMessage);
});

export const DELETE = asyncHandler(async (request: Request) => {
  const data = await request.json();
  const authDeviceId = request.headers.get("x-device-id");
  const device_id = authDeviceId || data.device_id;
  
  if (!device_id) return ApiResponse.error("device_id is required", 400);

  // Prevent authenticated mobile clients from deleting other devices' chats
  if (authDeviceId && data.device_id && authDeviceId !== data.device_id) {
    return ApiResponse.error("Unauthorized: Cannot delete other device's chat", 403);
  }

  const { message_ids } = data;

  if (message_ids === "all") {
    deleteAllChatMessages(device_id);
  } else if (Array.isArray(message_ids) && message_ids.length > 0) {
    deleteMultipleChatMessages(message_ids, device_id);
  }

  // ponytail: broadcast removed — deletes are now handled exclusively through
  // socket delete_messages handler which does DB + broadcast (single emit path)

  return ApiResponse.success({ deleted: true });
});
