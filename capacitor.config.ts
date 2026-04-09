import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nightreader.app",
  appName: "NightReader",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // Uncomment during development to use live reload:
    // url: "http://YOUR_LOCAL_IP:1420",
    // cleartext: true,
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0d1117",
    preferredContentMode: "mobile",
  },
  android: {
    backgroundColor: "#0d1117",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#0d1117",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#0d1117",
      overlaysWebView: true,
    },
  },
};

export default config;
