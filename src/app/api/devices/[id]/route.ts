import { deleteDevice } from "@/db/sqlite";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { NextRequest } from "next/server";
import { getIO } from "@/lib/socket";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: deviceId } = await params;
    deleteDevice(deviceId);

    try {
      const io = getIO();
      if (io) {
        io.to(deviceId).emit("session_revoke");
      }
    } catch (e) {
      console.log("> Device deleted, but Socket.io not initialized yet.");
    }
    return ApiResponse.success(null, "Device revoked successfully");
  } catch (error) {
    console.error("Error deleting device:", error);
    return ApiResponse.error("Failed to revoke device", 500);
  }
}
