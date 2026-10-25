import type { CapacitorConfig } from '@capacitor/cli';

// The Android app ships the same build as the site, packed inside the app (works offline).
const config: CapacitorConfig = {
  appId: 'io.github.madar.planner',
  appName: 'مدار',
  webDir: 'dist',
  android: {
    backgroundColor: '#FFF4E3',
  },
};

export default config;
