import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { generateID } from "../../../core/Util";
import { getPlayerCosmetics } from "../../Cosmetics";
import type { JoinLobbyEvent } from "../../Main";
import { requestHaptic } from "../../ui/Haptics";
import { genAnonUsername, UsernameInput } from "../../UsernameInput";
import "./massive-world.css";
import {
  MASSIVE_WORLD_PACING,
  MassiveSectorTerrain,
  MassiveSectorView,
  MassiveWorldDuration,
  MassiveWorldModel,
} from "./MassiveWorldModel";
import { MassiveWorldRenderer } from "./MassiveWorldRenderer";
import {
  beginMassiveWorldTacticalSession,
  clearMassiveWorldTacticalSession,
  peekMassiveWorldTacticalSession,
} from "./MassiveWorldSession";
import { buildMassiveWorldTacticalGameStartInfo } from "./MassiveWorldTactical";

const PREFERENCES_KEY = "idlefront.experimental.massive-world.ui.v1";
const SAVE_INTERVAL_MS = 8_000;
const TAP_DISTANCE_PX = 9;

const DURATION_OPTIONS: ReadonlyArray<{
  value: MassiveWorldDuration;
  label: string;
  shortLabel: string;
}> = [
  { value: "1h", label: "One hour world", shortLabel: "1 hour" },
  { value: "1d", label: "One day world", shortLabel: "1 day" },
  { value: "7d", label: "One week world", shortLabel: "1 week" },
];

interface MassiveWorldPreferences {
  version: 1;
  duration: MassiveWorldDuration;
  camera?: {
    x: number;
    y: number;
    zoom: number;
  };
}

interface PointerSample {
  x: number;
  y: number;
  startX: number;
  startY: number;
}

function isDuration(value: unknown): value is MassiveWorldDuration {
  return value === "1h" || value === "1d" || value === "7d";
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readPreferences(): MassiveWorldPreferences {
  const fallback: MassiveWorldPreferences = { version: 1, duration: "1d" };
  const storage = localStorageOrNull();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(PREFERENCES_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<MassiveWorldPreferences>;
    if (value.version !== 1 || !isDuration(value.duration)) return fallback;
    const camera = value.camera;
    return {
      version: 1,
      duration: value.duration,
      ...(camera &&
      Number.isFinite(camera.x) &&
      Number.isFinite(camera.y) &&
      Number.isFinite(camera.zoom)
        ? {
            camera: {
              x: camera.x,
              y: camera.y,
              zoom: Math.max(3, Math.min(180, camera.zoom)),
            },
          }
        : {}),
    };
  } catch {
    return fallback;
  }
}

function durationFromLocation(
  fallback: MassiveWorldDuration,
): MassiveWorldDuration {
  try {
    const requested = new URLSearchParams(location.search).get("duration");
    return isDuration(requested) ? requested : fallback;
  } catch {
    return fallback;
  }
}

function loadWorld(duration: MassiveWorldDuration): MassiveWorldModel {
  const storage = localStorageOrNull();
  return storage
    ? (MassiveWorldModel.restore(duration, storage) ??
        MassiveWorldModel.create(duration))
    : MassiveWorldModel.create(duration);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

function formatWorldTime(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function terrainLabel(terrain: MassiveSectorTerrain): string {
  switch (terrain) {
    case MassiveSectorTerrain.Ocean:
      return "Open water";
    case MassiveSectorTerrain.River:
      return "River country";
    default:
      return "Land sector";
  }
}

function routeLabel(sector: MassiveSectorView): string {
  switch (sector.route) {
    case "held":
      return "Under your control";
    case "border":
      return "Border route open";
    case "river":
      return "River route open";
    case "ocean":
      return "Expedition route open";
    default:
      return "Beyond current reach";
  }
}

@customElement("massive-world-page")
export class MassiveWorldPage extends LitElement {
  @state() private duration: MassiveWorldDuration;
  @state() private feedback = "Select a neighboring sector to begin.";
  @state() private rendererError = "";
  @state() private enteringSector = false;

  private model: MassiveWorldModel;
  private renderer: MassiveWorldRenderer | null = null;
  private preferences: MassiveWorldPreferences;
  private pointers = new Map<number, PointerSample>();
  private gestureMoved = false;
  private lastPinchDistance = 0;
  private lastPinchMidpoint = { x: 0, y: 0 };
  private tickTimer: number | undefined;
  private saveTimer: number | undefined;
  private lastModelSave = 0;
  private consumedTacticalGameID: string | null = null;

  constructor() {
    super();
    this.preferences = readPreferences();
    this.duration = durationFromLocation(this.preferences.duration);
    this.model = loadWorld(this.duration);
    // Apply a recorded stock-game result against the original frontier before
    // offline bot activity can advance the local strategic clock.
    this.consumeTacticalReturn();
    this.model.advance();
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("pagehide", this.persistNow);
    window.addEventListener("showPage", this.handlePageChange);
    window.addEventListener(
      "pressureatlas:app-state",
      this.handleNativeAppState,
    );
  }

  disconnectedCallback() {
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange,
    );
    window.removeEventListener("pagehide", this.persistNow);
    window.removeEventListener("showPage", this.handlePageChange);
    window.removeEventListener(
      "pressureatlas:app-state",
      this.handleNativeAppState,
    );
    this.persistNow();
    this.stopTicking();
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.renderer?.destroy();
    this.renderer = null;
    this.pointers.clear();
    super.disconnectedCallback();
  }

  /** Called by the route owner after this initially-hidden page is revealed. */
  open(): void {
    this.enteringSector = false;
    this.consumeTacticalReturn();
    void this.updateComplete.then(() => {
      if (!this.isConnected) return;
      if (!this.renderer) {
        this.mountRenderer();
      } else {
        this.renderer.resume();
        this.startTicking();
        this.advanceWorld();
      }
    });
  }

  private consumeTacticalReturn(): void {
    const value = peekMassiveWorldTacticalSession();
    if (!value || value.gameID === this.consumedTacticalGameID) return;
    if (
      value.duration !== this.duration ||
      value.sectorIndex >= this.model.owners.length
    ) {
      clearMassiveWorldTacticalSession(value.gameID);
      return;
    }
    this.consumedTacticalGameID = value.gameID;
    this.model.selectedIndex = value.sectorIndex;
    const outcome = this.model.applyTacticalOutcome({
      outcomeId: value.gameID,
      targetIndex: value.sectorIndex,
      result: value.result ?? "abandoned",
    });
    if (value.result === "victory" && outcome.accepted) {
      this.feedback = `${value.sectorName} secured by tactical victory.`;
      requestHaptic("success");
    } else if (
      value.result === "victory" &&
      outcome.reason === "already-held"
    ) {
      this.feedback = `${value.sectorName} defended. The frontier holds.`;
    } else if (
      value.result === "victory" &&
      outcome.reason === "already-applied"
    ) {
      this.feedback = `${value.sectorName} victory already recorded.`;
    } else if (value.result === "defeat") {
      this.feedback = `${value.sectorName} resisted the encounter. The frontier is unchanged.`;
    } else {
      this.feedback = `Returned from ${value.sectorName}. The frontier is unchanged.`;
    }
    this.renderer?.updateState(this.model);
    if (this.persistNow()) {
      clearMassiveWorldTacticalSession(value.gameID);
    }
  }

  render() {
    const sector = this.model.sector();
    const stats = this.model.stats();
    const isOcean = sector.terrain === MassiveSectorTerrain.Ocean;
    const canEnterSector = !isOcean && (sector.isPlayer || sector.isAttackable);
    const commandPercent = Math.max(
      0,
      Math.min(100, (stats.command / stats.commandCap) * 100),
    );

    return html`
      <main class="mw-shell" aria-label="Massive world prototype">
        <canvas
          class="mw-canvas"
          tabindex="0"
          aria-label="World map. Drag to move, pinch or scroll to zoom, and tap a sector to select it."
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.handlePointerCancel}
          @wheel=${this.handleWheel}
          @dblclick=${this.focusSelected}
          @keydown=${this.handleCanvasKeydown}
        ></canvas>

        <div class="mw-atmosphere" aria-hidden="true"></div>
        <div class="mw-vignette" aria-hidden="true"></div>

        <header class="mw-header">
          <button
            class="mw-title-lockup"
            type="button"
            aria-label="Return to the world menu"
            data-haptic="light"
            @click=${this.exitPrototype}
          >
            <span class="mw-title-lockup__back" aria-hidden="true">‹</span>
            <span class="mw-orbit" aria-hidden="true"></span>
            <div>
              <span class="mw-eyebrow">Experimental atlas</span>
              <h1>Massive world</h1>
            </div>
          </button>

          <div class="mw-duration" role="group" aria-label="World duration">
            ${DURATION_OPTIONS.map(
              (option) => html`
                <button
                  class="mw-duration__option ${
                    this.duration === option.value ? "is-selected" : ""
                  }"
                  type="button"
                  aria-label=${option.label}
                  aria-pressed=${this.duration === option.value}
                  @click=${() => this.changeDuration(option.value)}
                >
                  ${option.shortLabel}
                </button>
              `,
            )}
          </div>
        </header>

        <aside class="mw-telemetry" aria-label="World status">
          <div class="mw-stat mw-stat--command">
            <span class="mw-stat__label">Command</span>
            <strong>${Math.floor(stats.command)}</strong>
            <span class="mw-stat__limit">/ ${stats.commandCap}</span>
            <span class="mw-meter" aria-hidden="true">
              <span style=${`width: ${commandPercent}%`}></span>
            </span>
          </div>
          <div class="mw-stat">
            <span class="mw-stat__label">Held</span>
            <strong>${stats.heldSectors}</strong>
            <span class="mw-stat__limit">sectors</span>
          </div>
          <div class="mw-stat mw-stat--travel">
            <span class="mw-stat__label">Travel</span>
            <strong
              >${
                stats.oceanUnlocked
                  ? "Open"
                  : `${Math.floor(stats.oceanProgress * 100)}%`
              }</strong
            >
            <span class="mw-stat__limit"
              >${stats.oceanUnlocked ? "short crossings" : "rivers only"}</span
            >
            <span class="mw-meter" aria-hidden="true">
              <span style=${`width: ${stats.oceanProgress * 100}%`}></span>
            </span>
          </div>
          <div class="mw-stat mw-stat--desktop">
            <span class="mw-stat__label">World clock</span>
            <strong>${formatWorldTime(stats.worldElapsedMs)}</strong>
            <span class="mw-stat__limit">elapsed</span>
          </div>
          <div class="mw-stat mw-stat--desktop">
            <span class="mw-stat__label">World scale</span>
            <strong>${formatCompact(stats.logicalTiles)}</strong>
            <span class="mw-stat__limit">logical tiles</span>
          </div>
        </aside>

        <nav class="mw-map-tools" aria-label="Map controls">
          <button
            type="button"
            class="mw-tool-button"
            aria-label="Zoom in"
            data-haptic="light"
            @click=${() => this.zoomFromCenter(1.45)}
          >
            <span aria-hidden="true">+</span>
          </button>
          <button
            type="button"
            class="mw-tool-button"
            aria-label="Zoom out"
            data-haptic="light"
            @click=${() => this.zoomFromCenter(1 / 1.45)}
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            class="mw-tool-button mw-tool-button--target"
            aria-label="Center selected sector"
            data-haptic="none"
            @click=${this.focusSelected}
          >
            <span aria-hidden="true"></span>
          </button>
        </nav>

        <section class="mw-sector-card" aria-label="Selected sector">
          <div class="mw-sector-card__identity">
            <span class="mw-sector-card__coordinate"
              >Sector ${sector.x + 1}.${sector.y + 1}</span
            >
            <h2>${sector.name}</h2>
            <p>
              ${terrainLabel(sector.terrain)}
              <span aria-hidden="true">·</span>
              ${routeLabel(sector)}
            </p>
          </div>

          <div class="mw-sector-card__strength">
            <span>Strength</span>
            <strong>${formatCompact(sector.strength)}</strong>
          </div>

          <div class="mw-sector-card__actions">
            <button
              type="button"
              class="mw-action mw-action--attack"
              ?disabled=${!sector.isAttackable}
              data-haptic="none"
              @click=${this.attackSelected}
            >
              <span class="mw-action__icon" aria-hidden="true">↗</span>
              <span>
                <strong>${sector.isPlayer ? "Secured" : "Attack"}</strong>
                <small
                  >${
                    sector.isAttackable ? "Spend command" : routeLabel(sector)
                  }</small
                >
              </span>
            </button>

            <button
              type="button"
              class="mw-action mw-action--enter"
              ?disabled=${!canEnterSector || this.enteringSector}
              data-haptic="none"
              @click=${this.enterSector}
            >
              <span>
                <strong
                  >${this.enteringSector ? "Preparing…" : "Enter sector"}</strong
                >
                <small>Open tactical encounter</small>
              </span>
              <span class="mw-action__chevron" aria-hidden="true">›</span>
            </button>
          </div>
        </section>

        <div class="mw-help" aria-hidden="true">
          <span class="mw-help__drag"></span>
          Drag to move · pinch or scroll to zoom
        </div>

        <div
          class="mw-feedback ${this.rendererError ? "is-error" : ""}"
          role="status"
          aria-live="polite"
        >
          ${
            this.rendererError
              ? html`
                  <span>${this.rendererError}</span>
                  <button
                    type="button"
                    data-haptic="light"
                    @click=${this.retryRenderer}
                  >
                    Retry map
                  </button>
                `
              : this.feedback
          }
        </div>
      </main>
    `;
  }

  private mountRenderer(): void {
    if (this.renderer) return;
    const canvas = this.querySelector<HTMLCanvasElement>(".mw-canvas");
    if (!canvas) return;

    try {
      this.renderer = new MassiveWorldRenderer(
        canvas,
        this.model,
        (message) => {
          this.rendererError = message ?? "";
          this.requestUpdate();
        },
      );
      this.renderer.fit();
      if (this.preferences.duration === this.duration) {
        const camera = this.preferences.camera;
        if (camera) {
          this.renderer.cameraX = camera.x;
          this.renderer.cameraY = camera.y;
          this.renderer.zoom = camera.zoom;
        }
      }
      this.renderer.start();
      this.rendererError = "";
    } catch (error) {
      this.rendererError =
        error instanceof Error ? error.message : "Unable to start the map";
    }

    this.startTicking();
    this.advanceWorld();
  }

  private readonly retryRenderer = () => {
    this.renderer?.destroy();
    this.renderer = null;
    this.rendererError = "";
    void this.updateComplete.then(() => {
      if (this.isConnected && window.currentPageId === "page-massive-world") {
        this.mountRenderer();
      }
    });
  };

  private startTicking(): void {
    if (this.tickTimer !== undefined) return;
    this.tickTimer = window.setInterval(this.advanceWorld, 1_000);
  }

  private stopTicking(): void {
    if (this.tickTimer !== undefined) window.clearInterval(this.tickTimer);
    this.tickTimer = undefined;
  }

  private pauseVisuals(): void {
    this.persistNow();
    this.stopTicking();
    this.renderer?.suspend();
    this.pointers.clear();
  }

  private readonly advanceWorld = () => {
    if (
      document.visibilityState === "hidden" ||
      document.body.classList.contains("in-game")
    ) {
      return;
    }
    this.model.advance();
    this.renderer?.updateState(this.model);
    const now = Date.now();
    if (now - this.lastModelSave >= SAVE_INTERVAL_MS) {
      this.persistNow();
      this.lastModelSave = now;
    }
    this.requestUpdate();
  };

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      this.pauseVisuals();
      return;
    }
    if (
      window.currentPageId === "page-massive-world" &&
      !this.enteringSector &&
      !document.body.classList.contains("in-game")
    ) {
      this.open();
    }
  };

  private readonly handlePageChange = (event: Event) => {
    const pageId = (event as CustomEvent<unknown>).detail;
    if (pageId === "page-massive-world") {
      this.open();
    } else {
      this.pauseVisuals();
    }
  };

  private readonly handleNativeAppState = (event: Event) => {
    const state = (event as CustomEvent<{ state?: unknown }>).detail?.state;
    if (state === "active") {
      if (
        window.currentPageId === "page-massive-world" &&
        !this.enteringSector &&
        !document.body.classList.contains("in-game")
      ) {
        this.open();
      }
      return;
    }
    if (state === "background" || state === "inactive") this.pauseVisuals();
  };

  private readonly persistNow = (): boolean => {
    const storage = localStorageOrNull();
    if (!storage) return false;
    try {
      this.model.save(storage);
      const renderer = this.renderer;
      this.preferences = {
        version: 1,
        duration: this.duration,
        ...(renderer
          ? {
              camera: {
                x: renderer.cameraX,
                y: renderer.cameraY,
                zoom: renderer.zoom,
              },
            }
          : {}),
      };
      storage.setItem(PREFERENCES_KEY, JSON.stringify(this.preferences));
      return true;
    } catch {
      // Private browsing and embedded webviews may reject storage writes.
      return false;
    }
  };

  private schedulePersistence(): void {
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = undefined;
      this.persistNow();
    }, 280);
  }

  private changeDuration(duration: MassiveWorldDuration): void {
    if (duration === this.duration) return;
    this.persistNow();
    this.duration = duration;
    this.model = loadWorld(duration);
    this.model.advance();
    this.feedback = `${MASSIVE_WORLD_PACING[duration].label} campaign loaded.`;
    this.preferences = { version: 1, duration };
    this.renderer?.updateState(this.model);
    this.renderer?.fit();
    try {
      const url = new URL(location.href);
      url.searchParams.set("duration", duration);
      history.replaceState(null, "", `${url.pathname}${url.search}`);
    } catch {
      // Synthetic documents may not expose a navigable location.
    }
    this.persistNow();
    requestHaptic("selection");
    this.requestUpdate();
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLCanvasElement;
    target.setPointerCapture(event.pointerId);
    if (this.pointers.size === 0) this.gestureMoved = false;
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    });
    if (this.pointers.size === 2) this.capturePinchGeometry();
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous || !this.renderer) return;
    event.preventDefault();
    const next: PointerSample = {
      ...previous,
      x: event.clientX,
      y: event.clientY,
    };
    this.pointers.set(event.pointerId, next);

    if (this.pointers.size === 1) {
      const deltaX = next.x - previous.x;
      const deltaY = next.y - previous.y;
      this.renderer.pan(deltaX, deltaY);
      if (
        Math.hypot(next.x - next.startX, next.y - next.startY) > TAP_DISTANCE_PX
      ) {
        this.gestureMoved = true;
      }
      this.schedulePersistence();
      return;
    }

    if (this.pointers.size === 2) {
      const geometry = this.pinchGeometry();
      if (!geometry || this.lastPinchDistance <= 0) return;
      this.gestureMoved = true;
      this.renderer.pan(
        geometry.midpoint.x - this.lastPinchMidpoint.x,
        geometry.midpoint.y - this.lastPinchMidpoint.y,
      );
      this.renderer.zoomAt(
        geometry.distance / this.lastPinchDistance,
        geometry.midpoint.x,
        geometry.midpoint.y,
      );
      this.lastPinchDistance = geometry.distance;
      this.lastPinchMidpoint = geometry.midpoint;
      this.schedulePersistence();
    }
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    const wasOnlyPointer = this.pointers.size === 1;
    this.pointers.delete(event.pointerId);
    const target = event.currentTarget as HTMLCanvasElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    if (this.pointers.size === 1) this.captureSinglePointerAsFreshGesture();
    if (!pointer || !wasOnlyPointer || this.gestureMoved) return;
    if (
      Math.hypot(
        event.clientX - pointer.startX,
        event.clientY - pointer.startY,
      ) <= TAP_DISTANCE_PX
    ) {
      this.selectAt(event.clientX, event.clientY);
    }
  };

  private readonly handlePointerCancel = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.gestureMoved = true;
    if (this.pointers.size === 1) this.captureSinglePointerAsFreshGesture();
  };

  private captureSinglePointerAsFreshGesture(): void {
    const pointer = this.pointers.values().next().value as
      PointerSample | undefined;
    if (!pointer) return;
    pointer.startX = pointer.x;
    pointer.startY = pointer.y;
  }

  private capturePinchGeometry(): void {
    const geometry = this.pinchGeometry();
    if (!geometry) return;
    this.lastPinchDistance = geometry.distance;
    this.lastPinchMidpoint = geometry.midpoint;
  }

  private pinchGeometry(): {
    distance: number;
    midpoint: { x: number; y: number };
  } | null {
    const pointers = Array.from(this.pointers.values());
    if (pointers.length !== 2) return null;
    return {
      distance: Math.max(
        1,
        Math.hypot(
          pointers[1].x - pointers[0].x,
          pointers[1].y - pointers[0].y,
        ),
      ),
      midpoint: {
        x: (pointers[0].x + pointers[1].x) / 2,
        y: (pointers[0].y + pointers[1].y) / 2,
      },
    };
  }

  private readonly handleWheel = (event: WheelEvent) => {
    if (!this.renderer) return;
    event.preventDefault();
    this.renderer.zoomAt(
      Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * 0.0024),
      event.clientX,
      event.clientY,
    );
    this.schedulePersistence();
  };

  private selectAt(clientX: number, clientY: number): void {
    const coordinates = this.renderer?.sectorAt(clientX, clientY);
    if (!coordinates) return;
    const sector = this.model.select(coordinates.x, coordinates.y);
    if (!sector) return;
    this.feedback = `${sector.name} selected. ${routeLabel(sector)}.`;
    this.renderer?.updateState(this.model);
    this.schedulePersistence();
    requestHaptic("selection");
    this.requestUpdate();
  }

  private readonly focusSelected = () => {
    this.renderer?.focus(this.model.selectedIndex, true);
    this.schedulePersistence();
    requestHaptic("light");
  };

  private readonly exitPrototype = () => {
    this.pauseVisuals();
    history.pushState(null, "", "/worlds");
    window.showPage?.("page-persistent-worlds");
    const page = document.querySelector("persistent-world-page") as {
      open?: () => void;
    } | null;
    page?.open?.();
  };

  private zoomFromCenter(factor: number): void {
    const canvas = this.querySelector<HTMLCanvasElement>(".mw-canvas");
    if (!canvas || !this.renderer) return;
    const bounds = canvas.getBoundingClientRect();
    this.renderer.zoomAt(
      factor,
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    this.schedulePersistence();
  }

  private readonly handleCanvasKeydown = (event: KeyboardEvent) => {
    if (!this.renderer) return;
    const panDistance = event.shiftKey ? 96 : 42;
    switch (event.key) {
      case "ArrowLeft":
        this.renderer.pan(panDistance, 0);
        break;
      case "ArrowRight":
        this.renderer.pan(-panDistance, 0);
        break;
      case "ArrowUp":
        this.renderer.pan(0, panDistance);
        break;
      case "ArrowDown":
        this.renderer.pan(0, -panDistance);
        break;
      case "+":
      case "=":
        this.zoomFromCenter(1.35);
        break;
      case "-":
      case "_":
        this.zoomFromCenter(1 / 1.35);
        break;
      case "Enter":
      case " ":
        this.attackSelected();
        break;
      default:
        return;
    }
    event.preventDefault();
    this.schedulePersistence();
  };

  private readonly attackSelected = () => {
    const selectedIndex = this.model.selectedIndex;
    const result = this.model.attack(selectedIndex);
    if (!result.accepted) {
      const reason =
        result.reason === "no-command"
          ? "Command is replenishing."
          : result.reason === "already-held"
            ? "This sector is already secure."
            : result.reason === "water-locked"
              ? "Expedition routes have not opened yet."
              : "Capture a connecting sector first.";
      this.feedback = reason;
      requestHaptic("error");
      this.requestUpdate();
      return;
    }

    this.renderer?.pulseAttack(selectedIndex);
    this.renderer?.updateState(this.model);
    const sector = this.model.sector(selectedIndex);
    this.feedback = result.captured
      ? `${sector.name} secured. The frontier has advanced.`
      : `${formatCompact(result.damage)} pressure applied to ${sector.name}.`;
    this.persistNow();
    requestHaptic(result.captured ? "success" : "medium");
    this.requestUpdate();
  };

  private readonly enterSector = async () => {
    const sector = this.model.sector();
    const canEnterSector =
      sector.terrain !== MassiveSectorTerrain.Ocean &&
      (sector.isPlayer || sector.isAttackable);
    if (!canEnterSector || this.enteringSector) {
      return;
    }

    this.enteringSector = true;
    this.feedback = `Preparing the tactical map for ${sector.name}…`;
    this.persistNow();

    try {
      const usernameInput = document.querySelector(
        "username-input",
      ) as UsernameInput | null;
      await usernameInput?.whenSeeded();
      if (usernameInput && !usernameInput.canPlay()) {
        this.enteringSector = false;
        this.feedback = "Choose a valid commander name before entering.";
        requestHaptic("error");
        return;
      }
      const gameID = generateID();
      const clientID = generateID();
      const cosmetics = await getPlayerCosmetics().catch(() => undefined);
      const gameStartInfo = buildMassiveWorldTacticalGameStartInfo({
        gameID,
        lobbyCreatedAt: Date.now(),
        clientID,
        username: usernameInput?.getUsername() ?? genAnonUsername(),
        cosmetics,
        isMobile: window.matchMedia("(max-width: 760px), (pointer: coarse)")
          .matches,
        oceanTravelUnlocked: this.model.oceanUnlocked(),
      });

      if (
        !beginMassiveWorldTacticalSession({
          duration: this.duration,
          sectorIndex: sector.index,
          sectorName: sector.name,
          gameID,
          enteredAt: Date.now(),
        })
      ) {
        this.enteringSector = false;
        this.feedback =
          "This device could not preserve the sector return. Enable site storage and try again.";
        requestHaptic("error");
        return;
      }
      this.pauseVisuals();

      // The strategic layer only chooses the tactical scenario and device
      // scale. The canonical handoff helper owns the unchanged stock rules.
      this.dispatchEvent(
        new CustomEvent("join-lobby", {
          detail: {
            gameID,
            gameStartInfo,
            source: "massive-world",
          } satisfies JoinLobbyEvent,
          bubbles: true,
          composed: true,
        }),
      );
      requestHaptic("success");
      window.setTimeout(() => {
        if (
          this.enteringSector &&
          !document.body.classList.contains("in-game") &&
          window.currentPageId === "page-massive-world"
        ) {
          this.enteringSector = false;
          this.feedback = "The tactical map did not open. Try again.";
          this.open();
        }
      }, 45_000);
    } catch (error) {
      this.enteringSector = false;
      this.feedback =
        error instanceof Error
          ? `Could not enter the sector: ${error.message}`
          : "Could not enter the sector.";
      requestHaptic("error");
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "massive-world-page": MassiveWorldPage;
  }
}
