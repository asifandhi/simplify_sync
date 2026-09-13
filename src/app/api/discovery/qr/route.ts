import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { ApiResponse } from "@/lib/utils/ApiResponse";
import { tokenStore } from "@/lib/discovery/tokenStore";
import { asyncHandler } from "@/lib/utils/asyncHandler";
import { isValidLocalOrigin } from "@/lib/localAccess";
import { getActiveLocalIP } from "@/lib/discovery/network";

const PAIRING_TOKEN_TTL_MS = 60 * 1000;

export const GET = asyncHandler(async (req: NextRequest) => {
  if (req.headers.get('x-is-local-client') !== 'true') {
    return ApiResponse.error("Unauthorized: Local web access required", 401);
  }

  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin && !isValidLocalOrigin(origin, host)) {
    return ApiResponse.error("Forbidden: Invalid origin", 403);
  }

  try {
    // 1. Find the PC's active local IPv4 address on the network
    const { ip: localIP, interfaceName } = getActiveLocalIP();
    console.log(`[QR API] Selected active interface '${interfaceName}' with IP: ${localIP}`);

    // 2. Generate a temporary pairing token (valid for 60s)
    const temp_token = randomBytes(6).toString("hex"); // e.g. "a1b2c3d4e5f6"
    tokenStore.setToken(temp_token, PAIRING_TOKEN_TTL_MS);

    const port = process.env.PORT || "3000";

    // 3. Create the payload that the phone will scan
    const payload = {
      ip: localIP,
      port: parseInt(port, 10),
      temp_token: temp_token,
      expires_at: Date.now() + PAIRING_TOKEN_TTL_MS,
    };

    return ApiResponse.success(payload, "QR payload generated");
  } catch (error) {
    console.error("Error generating QR payload:", error);
    return ApiResponse.error("Failed to generate QR payload", 500);
  }
});
