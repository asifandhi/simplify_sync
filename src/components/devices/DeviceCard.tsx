import axios from 'axios';
import { useDeviceStore } from '@/store/deviceStore';

interface Props {
  device: {
    device_id: string;
    device_name: string;
    last_active: string;
  };
}

export default function DeviceCard({ device }: Props) {
  const removeDevice = useDeviceStore(state => state.removeDevice);

  const handleRevoke = async () => {
    try {
      await axios.delete(`/api/devices/${device.device_id}`);
      removeDevice(device.device_id); // Remove it from the UI immediately
    } catch (err) {
      console.error('Failed to revoke device', err);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
      <div className="flex items-center gap-4">
        <div className="text-3xl">📱</div>
        <div>
          <h4 className="font-medium text-zinc-900 dark:text-zinc-100">{device.device_name}</h4>
          <p className="text-xs text-zinc-500">Last active: {new Date(device.last_active).toLocaleString()}</p>
        </div>
      </div>
      
      <button 
        onClick={handleRevoke}
        className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-lg transition-colors"
      >
        Revoke
      </button>
    </div>
  );
}