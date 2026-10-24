import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.sciencebyhugs.core.staging',
  appName: 'core staging',
  webDir: 'dist',
  server: { hostname: 'localhost', iosScheme: 'capacitor' },
  ios: { contentInset: 'never', backgroundColor: '#07101c' },
}

export default config
