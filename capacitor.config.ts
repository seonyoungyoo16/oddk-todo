import type { CapacitorConfig } from "@capacitor/cli";
import updates from "./mobile-updates.config.json";
import type {} from "@capacitor/local-notifications";

const config: CapacitorConfig = {
  appId: "com.oddk.todo",
  appName: "oddk",
  webDir: "out-native",
  backgroundColor: "#ffffff",
  loggingBehavior: "none",
  // CSS disables native double-tap zoom while WebView pinch/accessibility zoom remains available.
  zoomEnabled: true,
  server: { appStartPath: "/todo/", androidScheme: "https" },
  android: { allowMixedContent: false },
  ios: { contentInset: "automatic", preferredContentMode: "mobile" },
  plugins: {
    LocalNotifications: { presentationOptions: ["banner", "list", "sound"] },
    LiveUpdate: {
      autoUpdateStrategy: "none",
      autoBlockRolledBackBundles: true,
      autoDeleteBundles: true,
      publicKey: updates.publicKey,
      readyTimeout: 30000,
      httpTimeout: 30000,
    },
  },
};

export default config;
