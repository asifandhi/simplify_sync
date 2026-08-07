import axios from 'axios';
import { useDeviceStore } from '@/store/deviceStore';

interface Props {
  device: {
    device_id: string;
    device_name: string;
    last_active: string;
  };
  onClick?: () => void;
}

export default function DeviceCard({ device, onClick }: Props) {
  const removeDevice = useDeviceStore(state => state.removeDevice);

  const handleRevoke = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the card click
    try {
      await axios.delete(`/api/devices/${device.device_id}`);
      removeDevice(device.device_id);
    } catch (err) {
      console.error('Failed to revoke device', err);
    }
  };

  return (
    <div 
      onClick={onClick}
      className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
    >
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