import {create} from 'zustand';

export interface Device {
  device_id: string;
  device_name: string;
  last_active: string;
  is_trusted: number;
  profile_image?: string;
  is_online?: boolean;
}

interface DeviceStore {
  devices: Device[];
  setDevices: (devices: Device[]) => void;
  updateDevice: (id: string, partial: Partial<Device>) => void;
  removeDevice: (id: string) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  setDevices: (devices) => set({ devices }),
  updateDevice: (id, partial) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.device_id === id ? { ...d, ...partial } : d
      ),
    })),
  removeDevice: (id) => set((state) => ({ 
    devices: state.devices.filter(d => d.device_id !== id) 
  })),
}));

