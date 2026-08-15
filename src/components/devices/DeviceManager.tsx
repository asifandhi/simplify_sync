"use client";

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useDeviceStore } from '@/store/deviceStore';
import DeviceCard from './DeviceCard';

interface Props {
  onSelectDevice?: (deviceId: string, deviceName: string) => void;
  selectedDeviceId?: string | null;
}

export default function DeviceManager({ onSelectDevice, selectedDeviceId }: Props) {
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

  if (loading) return <div className="p-4 text-center text-[var(--color-on-surface-variant)] text-sm">Loading...</div>;

  return (
    <div className="flex flex-col gap-1">
      {devices.length === 0 ? (
        <div className="p-8 text-center text-[var(--color-on-surface-variant)] text-sm italic">
          No devices paired yet.
        </div>
      ) : (
        devices.map((device) => (
          <DeviceCard 
            key={device.device_id} 
            device={device} 
            isActive={device.device_id === selectedDeviceId}
            onClick={() => onSelectDevice && onSelectDevice(device.device_id, device.device_name)}
          />
        ))
      )}
    </div>
  );
}