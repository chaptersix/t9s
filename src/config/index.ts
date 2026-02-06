/**
 * Application configuration
 */

export interface AppConfig {
  // Temporal connection
  temporalUiServerUrl: string;
  namespace: string;

  // Polling
  pollingInterval: number;
  pollingEnabled: boolean;

  // UI
  theme: "dark" | "light";

  // Keybindings
  vimMode: boolean;
}

export function getDefaultConfig(): AppConfig {
  return {
    temporalUiServerUrl:
      process.env.TEMPORAL_UI_SERVER_URL || "http://localhost:8233",
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
    pollingInterval: 3000,
    pollingEnabled: true,
    theme: "dark",
    vimMode: true,
  };
}

export function loadConfig(): AppConfig {
  // TODO: Load from ~/.config/temporal-tui/config.json
  return getDefaultConfig();
}
