module.exports = {
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
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#0d1117",
      overlaysWebView: true,
    },
  },
};
