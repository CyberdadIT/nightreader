const config = {
  appId: "com.nightreader.app",
  appName: "NightReader",
  webDir: "dist",
  server: {
    androidScheme: "https",
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

module.exports = config;
