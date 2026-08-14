import { readFile } from "node:fs/promises";
import path from "node:path";

function requireString(config, name) {
  const value = config[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Runtime configuration is missing ${name}`);
  }
  return value;
}

function requirePort(config, name, fallback) {
  const value = Number(config[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Runtime configuration has an invalid ${name}`);
  }
  return value;
}

async function main() {
  const [component, configArgument] = process.argv.slice(2);
  if (!["Authority", "Gateway"].includes(component) || !configArgument) {
    throw new Error(
      "Usage: node --import tsx scripts/idle-windows-launcher.mjs Authority|Gateway CONFIG",
    );
  }
  const configPath = path.resolve(configArgument);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const workspace = path.resolve(requireString(config, "Workspace"));
  const authorityPort = requirePort(config, "AuthorityPort", 3000);
  const gatewayPort = requirePort(config, "GatewayPort", 3100);

  if (component === "Authority") {
    process.env.GAME_ENV = "dev";
    process.env.IDLE_DB_PATH = requireString(config, "DatabasePath");
    process.env.IDLE_AUTHORITY_HOST = "127.0.0.1";
    process.env.IDLE_AUTHORITY_PORT = String(authorityPort);
    process.env.IDLE_ADMIN_ENABLED = "false";
    process.env.IDLE_ADMIN_TOKEN = "";
    process.env.IDLE_DEBUG_ERRORS = "false";
    process.env.IDLE_TELEMETRY_HMAC_SECRET = requireString(
      config,
      "TelemetryHmacSecret",
    );
    process.env.IDLE_RAW_TAP_RETENTION_DAYS = "14";
    process.env.IDLE_TRUSTED_PROXY_ADDRESS = "";
    const { startStandaloneIdleServer } =
      await import("../src/server/idle/StandaloneServer.ts");
    await startStandaloneIdleServer();
    process.stdout.write(
      `Pressure Atlas authority listening on 127.0.0.1:${authorityPort}\n`,
    );
    return;
  }

  const { startPreviewGateway } = await import("./idle-public-gateway.mjs");
  const server = await startPreviewGateway({
    accessToken: requireString(config, "PreviewAccessToken"),
    host: "127.0.0.1",
    port: gatewayPort,
    origin: `http://127.0.0.1:${authorityPort}`,
    staticDir: path.join(workspace, "resources", "idle"),
  });
  const close = () => server.close(() => (process.exitCode = 0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  process.stdout.write(
    `Pressure Atlas preview gateway listening on 127.0.0.1:${gatewayPort}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `Pressure Atlas launcher failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
