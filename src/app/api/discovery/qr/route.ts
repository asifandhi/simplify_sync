import { NextResponse } from 'next/server';
import { networkInterfaces } from 'os';
import { randomBytes } from 'crypto';
import { ApiResponse } from '@/lib/utils/ApiResponse';
import { tokenStore } from '@/lib/discovery/tokenStore';

export async function GET() {
  try {
    // 1. Find the PC's local IPv4 address on the network
    const nets = networkInterfaces();
    let localIP = '127.0.0.1';
    console.log('Network interfaces:', nets);

    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        if (net.family === 'IPv4' && !net.internal) {
          localIP = net.address;
          break; // Found the first external IP
        }
      }
    }

    // 2. Generate a temporary pairing token (valid for 5 mins usually)
    const temp_token = randomBytes(6).toString('hex'); // e.g. "a1b2c3d4e5f6"
    tokenStore.setToken(temp_token, 5 * 60 * 1000);

    
    const port = process.env.PORT || '3000';

    // 3. Create the payload that the phone will scan
    const payload = {
      ip: localIP,
      port: parseInt(port, 10),
      temp_token: temp_token,
      expires_at: Date.now() + 5 * 60 * 1000 // 5 minutes from now
    };

    return ApiResponse.success(payload, 'QR payload generated');
  } catch (error) {
    console.error('Error generating QR payload:', error);
    return ApiResponse.error('Failed to generate QR payload', 500);
  }
}