import { ApiResponse } from "@/lib/utils/ApiResponse";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { getIO } from "@/lib/socket";

export const POST = asyncHandler(async (request: Request) => {
  const data = await request.json();

  if (!data.targetDeviceId || !data.data) {
    return ApiResponse.error("targetDeviceId and data are required", 400);
  }

  try {
    const io = getIO();
    // Broadcast clipboard:receive to the device room
    io.in(data.targetDeviceId).emit("clipboard:receive", data);
  } catch (err) {
    console.error("[API/Clipboard] Failed to broadcast clipboard:", err);
    return ApiResponse.error("Failed to broadcast clipboard data", 500);
  }

  return ApiResponse.success({ success: true });
});
