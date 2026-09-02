import cluster from "cluster";
import crypto from "crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { GameEnv } from "../core/configuration/Config";
import { createIdleRouter, IdleService } from "./idle";
import { verifyClientToken } from "./jwt";
import { logger } from "./Logger";
import { MapPlaylist } from "./MapPlaylist";
import { MasterLobbyService } from "./MasterLobbyService";
import { setNoStoreHeaders } from "./NoStoreHeaders";
import {
  createPersistentWorldRouter,
  PersistentWorldNotificationWorker,
  PersistentWorldRepository,
  PersistentWorldService,
  PersistentWorldServiceError,
} from "./persistent";
import { PersistentWorldRuntimeBridge } from "./PersistentWorldRuntimeBridge";
import { renderAppShell } from "./RenderHtml";
import { ServerEnv } from "./ServerEnv";
import { applyStaticAssetCacheControl } from "./StaticAssetCache";
import { createTrustedProxyPredicate } from "./TrustedProxy";
import { installWorkerReverseProxy } from "./WorkerReverseProxy";

const playlist = new MapPlaylist();
let lobbyService: MasterLobbyService;

const app = express();
const server = http.createServer(app);

const log = logger.child({ comp: "m" });
let idleService: IdleService | undefined;
let idleRouter: ReturnType<typeof createIdleRouter> | undefined;
let persistentWorldService: PersistentWorldService | undefined;
let persistentWorldRouter:
  ReturnType<typeof createPersistentWorldRouter> | undefined;
let persistentWorldNotificationTimer: NodeJS.Timeout | undefined;
let persistentWorldNotificationTickInFlight = false;
let persistentWorldRuntimeBridge: PersistentWorldRuntimeBridge | undefined;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Trust only local loopback in development or the exact, configured gateway
// of the isolated production container bridge. A direct LAN/public client
// therefore cannot spoof X-Forwarded-For to rotate rate-limit keys or
// telemetry pseudonyms.
app.set(
  "trust proxy",
  createTrustedProxyPredicate(process.env.IDLE_TRUSTED_PROXY_ADDRESS),
);

// Production exposes only the master port. Keep worker-owned HTTP and sockets
// on loopback and stream canonical /wN routes through this single origin. This
// must precede parsers and rate-limit middleware so gameplay payloads are not
// buffered or interpreted by the master.
if (cluster.isPrimary) {
  installWorkerReverseProxy(app, server, {
    numWorkers: ServerEnv.numWorkers(),
  });
}

// Run hard transport ceilings before JSON parsing. Human taps still reach the
// durable watchdog, while malformed or hostile floods cannot consume
// unbounded parser, synchronous SQLite, or disk capacity.
app.use(
  "/api/idle/tap",
  rateLimit({
    windowMs: 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  rateLimit({
    windowMs: 60_000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(
  "/api/idle/session",
  rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(
  "/api/worlds/session",
  rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(
  "/api/worlds",
  rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use(express.json());

// Serve the shared app shell for the root document.
app.use(async (req, res, next) => {
  if (req.path === "/") {
    try {
      await renderAppShell(
        res,
        path.join(__dirname, "../../static/index.html"),
      );
    } catch (error) {
      log.error("Error rendering index.html:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    next();
  }
});

app.use(
  express.static(path.join(__dirname, "../../static"), {
    maxAge: "1y", // Set max-age to 1 year for all static assets
    setHeaders: (res) => {
      applyStaticAssetCacheControl(
        res.setHeader.bind(res),
        res.req.originalUrl,
      );
    },
  }),
);

app.use(
  rateLimit({
    windowMs: 1000, // 1 second
    max: 20, // 20 requests per IP per second
    // The route-specific ceilings above protect transport resources. Beneath
    // those ceilings, every validly authenticated tap reaches the watchdog.
    skip: (req) => req.path === "/api/idle/tap",
  }),
);

app.use("/api", (_req, res, next) => {
  setNoStoreHeaders(res);
  next();
});

// This lazy mount must be registered before the SPA fallback. Only the primary
// process opens SQLite; workers import this module too, but never initialize it.
app.use("/api/idle", (req, res, next) => {
  if (!idleRouter) {
    res.status(503).json({
      error: { code: "IDLE_STARTING", message: "Idle service is starting" },
    });
    return;
  }
  idleRouter(req, res, next);
});

// Durable invitation lobbies live on the master and remain separate from the
// worker-owned ordinary OpenFront match lifecycle. Do not construct a normal
// GameServer merely because an invitation reaches its scheduled start time.
app.use("/api/worlds", (req, res, next) => {
  if (!persistentWorldRouter) {
    res.status(503).json({
      error: {
        code: "PERSISTENT_WORLDS_STARTING",
        message: "Persistent-world service is starting",
      },
    });
    return;
  }
  persistentWorldRouter(req, res, next);
});

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (
    !req.path.startsWith("/api/idle") &&
    !req.path.startsWith("/api/worlds")
  ) {
    next(error);
    return;
  }
  res.status(400).json({
    error: { code: "INVALID_JSON", message: "Request body is not valid JSON" },
  });
});

// Start the master process
export async function startMaster() {
  if (!cluster.isPrimary) {
    throw new Error(
      "startMaster() should only be called in the primary process",
    );
  }

  log.info(`Primary ${process.pid} is running`);
  idleService = new IdleService({ dbPath: process.env.IDLE_DB_PATH });
  idleRouter = createIdleRouter(idleService, {
    adminEnabled: process.env.IDLE_ADMIN_ENABLED === "true",
    adminToken: process.env.IDLE_ADMIN_TOKEN,
  });
  process.once("exit", () => idleService?.close());

  // Managed runtimes are dispatched through the same shard-aware master
  // service as ordinary lobbies. It is safe to construct this before workers:
  // durable provisioning requests remain retryable until their shard reports
  // ready.
  lobbyService = new MasterLobbyService(playlist, log);

  const persistentWorldRepository = new PersistentWorldRepository({
    dbPath: process.env.PERSISTENT_WORLD_DB_PATH,
  });
  persistentWorldRuntimeBridge = new PersistentWorldRuntimeBridge(
    persistentWorldRepository,
    playlist,
    (command) => lobbyService.createManagedGame(command),
  );
  lobbyService.setManagedGameTurnHandler((message) =>
    persistentWorldRuntimeBridge!.persistTurns(message),
  );
  persistentWorldService = new PersistentWorldService(
    persistentWorldRepository,
    {
      runtimeCoordinator: persistentWorldRuntimeBridge,
      onRuntimeError: (error) =>
        log.warn("Persistent-world runtime reconciliation failed", error),
    },
  );
  persistentWorldService.activateDueWorlds();
  persistentWorldService.startScheduler();
  const persistentWorldNotificationWorker =
    new PersistentWorldNotificationWorker(persistentWorldRepository, {
      // In-app notices are delivered immediately by the same durable worker.
      // Email jobs remain retryable until an operator-owned provider replaces
      // this explicit unavailable sink; they are never marked delivered by a
      // fake or console-only transport.
      emailSink: {
        async send() {
          throw new Error("Persistent-world email delivery is not configured");
        },
      },
    });
  const runPersistentWorldNotifications = () => {
    if (persistentWorldNotificationTickInFlight) return;
    persistentWorldNotificationTickInFlight = true;
    void persistentWorldNotificationWorker
      .runDueBatch()
      .catch((error) =>
        log.error("Persistent-world notification worker failed", error),
      )
      .finally(() => {
        persistentWorldNotificationTickInFlight = false;
      });
  };
  runPersistentWorldNotifications();
  persistentWorldNotificationTimer = setInterval(
    runPersistentWorldNotifications,
    5_000,
  );
  persistentWorldNotificationTimer.unref?.();
  persistentWorldRouter = createPersistentWorldRouter(persistentWorldService, {
    onInternalError: (error) =>
      log.error("Persistent-world request failed", error),
    gameplayIdentityVerifier: async (playToken) => {
      const verified = await verifyClientToken(playToken);
      if (verified.type !== "success") {
        throw new PersistentWorldServiceError(
          401,
          "GAME_IDENTITY_INVALID",
          "The gameplay identity could not be verified",
        );
      }
      return crypto
        .createHash("sha256")
        .update(verified.persistentId)
        .digest("hex");
    },
  });
  process.once("exit", () => {
    if (persistentWorldNotificationTimer) {
      clearInterval(persistentWorldNotificationTimer);
    }
    persistentWorldService?.close();
  });
  log.info(`Setting up ${ServerEnv.numWorkers()} workers...`);

  const INSTANCE_ID =
    ServerEnv.env() === GameEnv.Dev
      ? "DEV_ID"
      : crypto.randomBytes(4).toString("hex");
  process.env.INSTANCE_ID = INSTANCE_ID;

  log.info(`Instance ID: ${INSTANCE_ID}`);

  // Fork workers
  for (let i = 0; i < ServerEnv.numWorkers(); i++) {
    const worker = cluster.fork({
      WORKER_ID: i,
      INSTANCE_ID,
    });

    lobbyService.registerWorker(i, worker);
    log.info(`Started worker ${i} (PID: ${worker.process.pid})`);
  }

  // Handle worker crashes
  cluster.on("exit", (worker, code, signal) => {
    const workerId = (worker as any).process?.env?.WORKER_ID;
    if (workerId === undefined) {
      log.error(`worker crashed could not find id`);
      return;
    }

    const workerIdNum = parseInt(workerId);
    lobbyService.removeWorker(workerIdNum);
    persistentWorldRuntimeBridge?.invalidateAll();

    log.warn(
      `Worker ${workerId} (PID: ${worker.process.pid}) died with code: ${code} and signal: ${signal}`,
    );
    log.info(`Restarting worker ${workerId}...`);

    // Restart the worker with the same ID
    const newWorker = cluster.fork({
      WORKER_ID: workerId,
      INSTANCE_ID,
    });

    lobbyService.registerWorker(workerIdNum, newWorker);
    log.info(
      `Restarted worker ${workerId} (New PID: ${newWorker.process.pid})`,
    );
  });

  const PORT = 3000;
  server.listen(PORT, () => {
    log.info(`Master HTTP server listening on port ${PORT}`);
  });
}

app.get("/api/health", (_req, res) => {
  const ready =
    (lobbyService?.isHealthy() ?? false) &&
    persistentWorldService !== undefined;
  if (ready) {
    res.json({ status: "ok" });
  } else {
    res.status(503).json({ status: "unavailable" });
  }
});

// SPA fallback route
app.get("/{*splat}", async function (_req, res) {
  try {
    const htmlPath = path.join(__dirname, "../../static/index.html");
    await renderAppShell(res, htmlPath);
  } catch (error) {
    log.error("Error rendering SPA fallback:", error);
    res.status(500).send("Internal Server Error");
  }
});
