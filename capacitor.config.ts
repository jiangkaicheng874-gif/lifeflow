import type { CapacitorConfig } from "@capacitor/cli";

// Development ID: select the permanent identifier before signing/release.
const config: CapacitorConfig = {
  appId: "dev.lifeflow.app",
  appName: "LifeFlow",
  webDir: "dist",
  ios: { contentInset: "automatic" },
};
export default config;
