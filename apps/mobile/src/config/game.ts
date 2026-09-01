import { Platform } from "react-native";

const LAN_GAME_URL = "http://192.168.2.118:9000/";

function normalizeGameUrl(value: string | undefined): string {
  const candidate = value?.trim() || LAN_GAME_URL;
  return candidate.endsWith("/") ? candidate : `${candidate}/`;
}

export const GAME_URL = normalizeGameUrl(process.env.EXPO_PUBLIC_GAME_URL);

export const SOURCE_URL = "https://github.com/StinkyDubeau/OpenFrontIO";

export const NATIVE_BRIDGE_BOOTSTRAP = `
  (function () {
    var detail = {
      platform: ${JSON.stringify(Platform.OS)},
      shellVersion: "0.1.0",
      capabilities: ["app-state", "haptics", "persistent-session"]
    };
    window.__PRESSURE_ATLAS_NATIVE__ = detail;
    window.dispatchEvent(new CustomEvent("pressureatlas:native-ready", { detail: detail }));
  })();
  true;
`;

export function appStateScript(state: string): string {
  return `
    window.dispatchEvent(new CustomEvent("pressureatlas:app-state", {
      detail: { state: ${JSON.stringify(state)} }
    }));
    true;
  `;
}

export function safeAreaScript(
  top: number,
  right: number,
  bottom: number,
  left: number,
): string {
  return `
    (function () {
      var root = document.documentElement;
      if (!root) return;
      root.style.setProperty("--native-safe-top", ${JSON.stringify(`${top}px`)});
      root.style.setProperty("--native-safe-right", ${JSON.stringify(`${right}px`)});
      root.style.setProperty("--native-safe-bottom", ${JSON.stringify(`${bottom}px`)});
      root.style.setProperty("--native-safe-left", ${JSON.stringify(`${left}px`)});
    })();
    true;
  `;
}
