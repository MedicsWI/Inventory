import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.medicswi.inventory",
  appName: "Medics WI Inventory",
  webDir: "out",
  server: {
    // Production URL the native app talks to for its API calls.
    // Local dev: comment `url` out and the bundled static export is served from the app itself.
    url: "https://inventory.medicswisconsin.com",
    androidScheme: "https",
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: "#0b1220",
      androidSplashResourceName: "splash",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#0ea5e9",
    },
    BarcodeScanning: {
      // ML Kit scanner — works offline, supports QR + 1D codes
    },
    Camera: {
      // requested at runtime via plugin
    },
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
