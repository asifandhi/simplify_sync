import { deleteDevice } from "@/db/sqlite";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { NextRequest } from "next/server";
import { getIO } from "@/lib/socket";
import { asyncHandler } from "@/lib/utils/asyncHandler";

export const DELETE = asyncHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    try {
      const { id: deviceId } = await params;

      // Emit session_revoke BEFORE deleting so the socket room still exists
      try {
        const io = getIO();
        if (io) {
          io.to(deviceId).emit("session_revoke");
        }
      } catch (e) {
        console.log("> Socket.io not initialized yet, skipping session_revoke emit.");
      }

      deleteDevice(deviceId);
      return ApiResponse.success(null, "Device revoked successfully");
    } catch (error: any) {
      console.error("[API/Devices] Error deleting device:");
      console.error(error?.stack || error);
      return ApiResponse.error(`Failed to revoke device: ${error?.message || String(error)}`, 500);
    }
  },
);
