import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { tokenStore } from "@/lib/discovery/tokenStore";
import { asyncHandler } from "@/lib/utils/asyncHandler";

import { getActiveLocalIP } from "@/lib/discovery/network";

export const GET = asyncHandler(async () => {
  try {
    // 1. Find the PC's active local IPv4 address on the network
    const { ip: localIP, interfaceName } = getActiveLocalIP();
    console.log(`[QR API] Selected active interface '${interfaceName}' with IP: ${localIP}`);

    // 2. Generate a temporary pairing token (valid for 5 mins usually)
    const temp_token = randomBytes(6).toString("hex"); // e.g. "a1b2c3d4e5f6"
    tokenStore.setToken(temp_token, 5 * 60 * 1000);

    const port = process.env.PORT || "3000";

    // 3. Create the payload that the phone will scan
    const payload = {
      ip: localIP,
      port: parseInt(port, 10),
      temp_token: temp_token,
      expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes from now
    };

    return ApiResponse.success(payload, "QR payload generated");
  } catch (error) {
    console.error("Error generating QR payload:", error);
    return ApiResponse.error("Failed to generate QR payload", 500);
  }
});
