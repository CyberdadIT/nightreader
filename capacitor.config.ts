import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId:'com.nightreader.app', appName:'NightReader', webDir:'dist',
  server:{androidScheme:'https'},
  plugins:{StatusBar:{style:'DARK',backgroundColor:'#0d1117'}},
};
export default config;
