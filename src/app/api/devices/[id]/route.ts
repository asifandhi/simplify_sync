import { deleteDevice } from "@/db/sqlite";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { NextRequest } from "next/server";
import { getIO, disconnectDeviceSockets } from "@/lib/socket";
import { asyncHandler } from "@/lib/utils/asyncHandler";

export const DELETE = asyncHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    try {
      const { id: deviceId } = await params;

      const isLocalWeb = request.headers.get('x-is-local-client') === 'true';
      const authenticatedDeviceId = request.headers.get('x-device-id');

      if (authenticatedDeviceId) {
        // Mobile-originated caller: strictly restricted to revoking its own device
        if (authenticatedDeviceId !== deviceId) {
          return ApiResponse.error("Forbidden: Cannot revoke other devices", 403);
        }
      } else if (!isLocalWeb) {
        return ApiResponse.error("Forbidden: Cannot revoke other devices", 403);
      }

      // Emit session_revoke BEFORE deleting so the socket room still exists
      try {
        const io = getIO();
        if (io) {
          io.to(deviceId).emit("session_revoke");
        }
      } catch (e) {
        console.log("> Socket.io not initialized yet, skipping session_revoke emit.");
      }

      // W11: Force disconnect all sockets authenticated as this device
      try {
        disconnectDeviceSockets(deviceId);
      } catch (e) {
        console.error("> Error disconnecting device sockets:", e);
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
