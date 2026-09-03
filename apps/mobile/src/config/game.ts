import { Platform } from "react-native";

const LAN_GAME_URL = "http://192.168.2.118:9000/";

function normalizeGameUrl(value: string | undefined): string {
  const configured = value?.trim();
  const candidate = configured?.length ? configured : LAN_GAME_URL;
  const match = /^(.*?)([?#].*)?$/.exec(candidate);
  const path = match?.[1] ?? candidate;
  const suffix = match?.[2] ?? "";
  return `${path.endsWith("/") ? path : `${path}/`}${suffix}`;
}

export const GAME_URL = normalizeGameUrl(process.env.EXPO_PUBLIC_GAME_URL);

export const NATIVE_BRIDGE_BOOTSTRAP = `
  (function () {
    var lockViewport = function () {
      if (!document.head) return;
      var viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement("meta");
        viewport.setAttribute("name", "viewport");
        document.head.appendChild(viewport);
      }
      viewport.setAttribute(
        "content",
        "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
      );
    };
    lockViewport();
    document.addEventListener("DOMContentLoaded", lockViewport, { once: true });

    var detail = {
      platform: ${JSON.stringify(Platform.OS)},
      shellVersion: "0.1.0",
      capabilities: ["app-state", "haptics", "persistent-session"]
    };
    window.__PRESSURE_ATLAS_NATIVE__ = detail;
    window.__IDLEFRONT_NATIVE__ = detail;
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
