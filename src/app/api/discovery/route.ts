import { ApiResponse } from "@/lib/utils/ApiResponse";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getIO } from "@/lib/socket";
import { insertDevice, getAllDevices } from "@/db/sqlite";
import { tokenStore } from "@/lib/discovery/tokenStore";
import { asyncHandler } from "@/lib/utils/asyncHandler";

export const POST = asyncHandler(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { device_id, device_name, temp_token } = body;
    // 1. Basic validation
    if (!device_id || !device_name || !temp_token) {
      return ApiResponse.error("Missing required fields", 400);
    }
    if (!tokenStore.consume(temp_token)) {
      return ApiResponse.error("Invalid or expired token", 401);
    }

    // Server-side device limit enforcement (SEC-12)
    const existingDevices = getAllDevices() as any[];
    if (existingDevices.length >= 5) {
      return ApiResponse.error("Device limit reached (max 5 devices)", 403);
    }

    // 2. Here you would normally validate the temp_token matches what you generated in the QR code.
    // For local network pairing, we assume if they hit this API, they are on the network.

    // 3. Generate a permanent session token for this device
    const session_token = randomUUID();
    // 4. Save the device to our SQLite database
    insertDevice({
      device_id,
      device_name,
      session_token,
    });
    // 5. Emit a socket event to the PC Dashboard saying a device just paired!
    // (We will wrap this in a try-catch because getIO() might throw an error if Socket.io isn't set up yet)
    try {
      const io = getIO();
      if (io) {
        io.emit("pairing_request", { device_id, device_name });
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
