import type { CapacitorConfig } from "@capacitor/cli";
import updates from "./mobile-updates.config.json";

const config: CapacitorConfig = {
  appId: "com.oddk.todo",
  appName: "oddk",
  webDir: "out-native",
  backgroundColor: "#ffffff",
  loggingBehavior: "none",
  server: { appStartPath: "/todo/", androidScheme: "https" },
  android: { allowMixedContent: false },
  ios: { contentInset: "automatic", preferredContentMode: "mobile" },
  plugins: {
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
