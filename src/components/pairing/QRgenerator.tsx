"use client";

import { useEffect, useState } from "react";
import axios from "axios";
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
    const fetchQRData = async () => {
      setLoading(true);
      try {
        const res = await axios.get("/api/discovery/qr");
        if (res.data.success) {
          setPayload(res.data.data);
        } else {
          setError(res.data.error || "Failed to load QR data");
        }
      } catch (err: any) {
        setError(err.response?.data?.error || "Network error loading QR data");
      } finally {
        setLoading(false);
      }
    };
    fetchQRData();
    const interval = setInterval(fetchQRData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div className="text-[var(--color-error)] font-medium text-center p-4">{error}</div>;
  if (!payload || loading)
    return <div className="text-[var(--color-on-surface-variant)] text-center p-4">Generating QR code...</div>;

  const qrString = JSON.stringify(payload);

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-[var(--color-surface-container)] rounded-3xl shadow-lg border border-[var(--color-outline-variant)]/30">
      <div className="p-4 bg-white rounded-2xl mb-6 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
        <QRCodeSVG
          value={qrString}
          size={220}
          level="H"
          includeMargin={false}
          bgColor="#ffffff"
          fgColor="#131313"
        />
      </div>
      <p className="text-sm text-[var(--color-on-surface-variant)] font-label-sm tracking-wider bg-[var(--color-surface-container-high)] border border-[var(--color-outline-variant)]/30 px-4 py-1.5 rounded-full">
        {payload.ip}:{payload.port}
      </p>
    </div>
  );
}
