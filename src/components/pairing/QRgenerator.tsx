"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface QRPayload {
  ip: string;
  port: number;
  temp_token: string;
  expires_at: number;
}

export default function QRGenerator() {
  const [payload, setPayload] = useState<QRPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    // Fetch the QR payload when the component loads
    const fetchQRData = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/discovery/qr");
        const json = await res.json();
        if (json.success) {
          setPayload(json.data);
        } else {
          setError(json.error || "Failed to load QR data");
        }
      } catch (err) {
        setError("Network error loading QR data");
      } finally {
        setLoading(false);
      }
    };
    fetchQRData();
    // Auto-refresh the QR code every 5 minutes before it expires
    const interval = setInterval(fetchQRData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div className="text-red-500">{error}</div>;
  if (!payload || loading)
    return <div className="text-gray-500">Generating QR code...</div>;

  const qrString = JSON.stringify(payload);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800">
      <h3 className="text-lg font-semibold mb-4 text-zinc-800 dark:text-zinc-100">
        Scan to Connect
      </h3>

      <div className="p-4 bg-white rounded-xl">
        <QRCodeSVG
          value={qrString}
          size={200}
          level="H"
          includeMargin={false}
        

        />
      </div>
      <p className="mt-6 text-sm text-zinc-500 font-mono bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-md">
        {payload.ip}:{payload.port}
      </p>
    </div>
  );
}
