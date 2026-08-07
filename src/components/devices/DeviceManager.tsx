"use client";

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useDeviceStore } from '@/store/deviceStore';
import DeviceCard from './DeviceCard';

interface Props {
  onSelectDevice?: (deviceId: string, deviceName: string) => void;
}

export default function DeviceManager({ onSelectDevice }: Props) {
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

  if (loading) return <div className="text-zinc-500">Loading devices...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100 mb-6">Connected Devices</h2>
      
      {devices.length === 0 ? (
        <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500">
          No devices paired yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {devices.map((device) => (
            <DeviceCard 
              key={device.device_id} 
              device={device} 
              onClick={() => onSelectDevice && onSelectDevice(device.device_id, device.device_name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}