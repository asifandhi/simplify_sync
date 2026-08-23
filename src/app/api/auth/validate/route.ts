import { getDeviceBySessionToken } from "@/db/sqlite";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const sessionToken = request.headers.get("x-session-token");
  
  if (!sessionToken) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const device = getDeviceBySessionToken(sessionToken);
  
  if (!device) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  return NextResponse.json({ valid: true, device_id: device.device_id });
}
