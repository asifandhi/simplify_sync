import { ApiResponse } from "@/lib/utils/ApiResponse";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { getIO } from "@/lib/socket";
import { insertDevice, getAllDevices } from "@/db/sqlite";
import { tokenStore } from "@/lib/discovery/tokenStore";
import { asyncHandler } from "@/lib/utils/asyncHandler";

export const POST = asyncHandler(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { device_id, device_name, temp_token } = body || {};

    // 1. Validate payload types and lengths BEFORE consuming token
    const isDeviceIdValid =
      typeof device_id === 'string' &&
      device_id.trim().length >= 1 &&
      device_id.trim().length <= 64 &&
      /^[a-zA-Z0-9_-]+$/.test(device_id.trim());

    const isDeviceNameValid =
      typeof device_name === 'string' &&
      device_name.trim().length >= 1 &&
      device_name.trim().length <= 64;

    const isTempTokenValid =
      typeof temp_token === 'string' &&
      temp_token.trim().length >= 1 &&
      temp_token.trim().length <= 64;

    if (!isDeviceIdValid || !isDeviceNameValid || !isTempTokenValid) {
      return ApiResponse.error("Invalid device_id, device_name, or token", 400);
    }

    // Single-use and expiration check
    if (!tokenStore.consume(temp_token)) {
      return ApiResponse.error("Invalid or expired token", 401);
    }

    // Server-side device limit enforcement (SEC-12)
    const existingDevices = getAllDevices() as any[];
    if (existingDevices.length >= 5) {
      return ApiResponse.error("Device limit reached (max 5 devices)", 403);
    }

    // 2. Generate a permanent session token for this device
    const session_token = randomUUID();
    // 3. Save the device to our SQLite database
    insertDevice({
      device_id: device_id.trim(),
      device_name: device_name.trim(),
      session_token,
    });
    // 4. Emit a socket event to the PC Dashboard saying a device just paired!
    try {
      const io = getIO();
      if (io) {
        io.emit("pairing_request", { device_id: device_id.trim(), device_name: device_name.trim() });
      }
    } catch (socketError) {
      // Ignore socket errors for now until Phase 3 is built
      console.log(
        "> Device paired, but Socket.io is not initialized yet to update the UI.",
      );
    }
    // 6. Return success to the phone with its new session token
    return ApiResponse.success(
      {
        session_token,
        device_id: "pc-host", // Tells the phone the ID of this PC
      },
      "Pairing successful",
    );
  } catch (error) {
    console.error("Pairing error:", error);
    return ApiResponse.error("Failed to process pairing request", 500);
  }
});
