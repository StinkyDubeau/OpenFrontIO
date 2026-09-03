const LAN_GAME_URL = "http://192.168.2.118:9000/";

export function normalizeGameUrl(value: string | undefined): string {
  const configured = value?.trim();
  const candidate = configured?.length ? configured : LAN_GAME_URL;

  // Keep query strings and fragments attached to the route they configure.
  // Appending a slash to the raw string turned `?duration=1d` into
  // `?duration=1d/`, which silently selected the wrong world duration in the
  // native shell.
  try {
    const url = new URL(candidate);
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.toString();
  } catch {
    return candidate.endsWith("/") ? candidate : `${candidate}/`;
  }
}
