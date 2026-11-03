import type { CapacitorConfig } from "@capacitor/cli";
import updates from "./mobile-updates.config.json";
import type {} from "@capacitor/local-notifications";

const config: CapacitorConfig = {
  appId: "com.oddk.todo",
  appName: "oddk",
  webDir: "out-native",
  backgroundColor: "#ffffff",
  loggingBehavior: "none",
  // Native-only zoom lock. The ordinary browser viewport is unchanged.
  zoomEnabled: false,
  server: { appStartPath: "/todo/", androidScheme: "https" },
  android: { allowMixedContent: false, zoomEnabled: false },
  ios: { contentInset: "automatic", preferredContentMode: "mobile", zoomEnabled: false },
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
