import {create} from 'zustand';

interface Device {
  device_id: string;
  device_name: string;
  last_active: string;
  is_trusted: number;
  profile_image?: string;
}

interface DeviceStore {
  devices: Device[];
  setDevices: (devices: Device[]) => void;
  removeDevice: (id: string) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  setDevices: (devices) => set({ devices }),
  removeDevice: (id) => set((state) => ({ 
    devices: state.devices.filter(d => d.device_id !== id) 
  })),
}));

