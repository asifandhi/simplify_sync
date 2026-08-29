"use client";

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useDeviceStore } from '@/store/deviceStore';
import DeviceCard from './DeviceCard';

interface Props {
  onSelectDevice?: (deviceId: string, deviceName: string) => void;
  selectedDeviceId?: string | null;
  searchQuery?: string;
}

export default function DeviceManager({ onSelectDevice, selectedDeviceId, searchQuery = '' }: Props) {
  const { devices, setDevices } = useDeviceStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await axios.get('/api/devices');
        if (res.data.success) {
          setDevices(res.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch devices', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDevices();
  }, [setDevices]);

  if (loading) return (
    <div className="p-4 text-center text-[var(--color-on-surface-variant)] text-sm">Loading...</div>
  );

  const filtered = searchQuery.trim()
    ? devices.filter(d => d.device_name.toLowerCase().includes(searchQuery.toLowerCase()))
    : devices;

  if (devices.length === 0) return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
      <span className="material-symbols-outlined text-[36px] text-[var(--color-on-surface-variant)]">devices</span>
      <p className="text-[var(--color-on-surface-variant)] text-sm">No devices paired yet.</p>
    </div>
  );

  if (filtered.length === 0) return (
    <div className="py-10 text-center text-[var(--color-on-surface-variant)] text-sm">
      No results for &ldquo;{searchQuery}&rdquo;
    </div>
  );

  return (
    <div className="flex flex-col">
      {filtered.map((device) => (
        <DeviceCard
          key={device.device_id}
          device={device}
          isActive={device.device_id === selectedDeviceId}
          onClick={() => onSelectDevice && onSelectDevice(device.device_id, device.device_name)}
        />
      ))}
    </div>
  );
}