import axios from 'axios';
import { useDeviceStore } from '@/store/deviceStore';

interface Props {
  device: {
    device_id: string;
    device_name: string;
    last_active: string;
  };
  isActive?: boolean;
  onClick?: () => void;
}

export default function DeviceCard({ device, isActive, onClick }: Props) {
  const removeDevice = useDeviceStore(state => state.removeDevice);

  const handleRevoke = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await axios.delete(`/api/devices/${device.device_id}`);
      removeDevice(device.device_id);
    } catch (err) {
      console.error('Failed to revoke device', err);
    }
  };

  return (
    <div className="px-2 py-0.5">
      <div 
        onClick={onClick}
        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors relative group ${
          isActive ? 'bg-[var(--color-surface-container-high)]' : 'hover:bg-[var(--color-surface-container-low)]'
        }`}
      >
        {/* Active Indicator */}
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[var(--color-primary)] rounded-r-full"></div>
        )}

        {/* Avatar */}
        <div className="relative shrink-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-headline-md border transition-colors ${
            isActive ? 'bg-[var(--color-surface-variant)] border-[var(--color-outline-variant)] text-[var(--color-on-surface)]' : 'bg-[var(--color-surface-container)] border-[var(--color-surface-variant)] text-[var(--color-on-surface-variant)] group-hover:border-[var(--color-outline-variant)]'
          }`}>
            {device.device_name.charAt(0).toUpperCase()}
          </div>
          {isActive && (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[var(--color-primary)] rounded-full border-2 border-[var(--color-surface-container-high)]"></div>
          )}
        </div>

        {/* Text Details */}
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex justify-between items-baseline mb-0.5">
            <span className={`font-headline-md text-[14px] truncate ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-on-surface)]'}`}>
              {device.device_name}
            </span>
          </div>
          <p className="font-body-md text-[var(--color-on-surface-variant)] truncate text-xs">
            {new Date(device.last_active).toLocaleDateString()}
          </p>
        </div>

        {/* Revoke Button (Visible on Hover) */}
        <button 
          onClick={handleRevoke}
          title="Revoke Access"
          className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--color-error)] hover:bg-[var(--color-error)]/10 rounded-lg transition-all"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
    </div>
  );
}