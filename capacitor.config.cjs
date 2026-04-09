module.exports = {
  appId: "com.nightreader.app",
  appName: "NightReader",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#0d1117",
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#0d1117",
    },
  },
};
