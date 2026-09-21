import { EventBus } from "../core/EventBus";
import { PlayerBuildableUnitType } from "../core/game/Game";

export class StructureDragEvent {
  constructor(
    public phase: "move" | "drop" | "cancel",
    public type: PlayerBuildableUnitType,
    public x: number,
    public y: number,
  ) {}
}

/** Captures only this gesture; a second pointer nudges the ghost at quarter speed. */
export function startStructureDrag(
  event: PointerEvent,
  type: PlayerBuildableUnitType,
  bus: EventBus,
  onStart?: () => void,
) {
  event.stopPropagation();
  if (event.pointerType !== "touch") return;
  const source = event.currentTarget as HTMLElement;
  const first = event.pointerId;
  let secondary: number | null = null;
  let sx = 0,
    sy = 0,
    x = event.clientX,
    y = event.clientY;
  let lastX = x,
    lastY = y,
    dragging = false,
    fine = false;
  const originX = x,
    originY = y;
  const stop = (e: PointerEvent) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const down = (e: PointerEvent) => {
    if (e.pointerId === first || secondary !== null) return;
    secondary = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    fine = true;
    stop(e);
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== first && e.pointerId !== secondary) return;
    stop(e);
    if (e.pointerId === secondary) {
      x += (e.clientX - sx) * 0.25;
      y += (e.clientY - sy) * 0.25;
      sx = e.clientX;
      sy = e.clientY;
    } else {
      if (!fine) {
        x += e.clientX - lastX;
        y += e.clientY - lastY;
      }
      lastX = e.clientX;
      lastY = e.clientY;
    }
    if (
      !dragging &&
      e.pointerId === first &&
      Math.hypot(e.clientX - originX, e.clientY - originY) >= 8
    ) {
      dragging = true;
      onStart?.();
    }
    if (dragging) bus.emit(new StructureDragEvent("move", type, x, y));
  };
  const cleanup = () => {
    window.removeEventListener("pointerdown", down, true);
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("blur", abort);
  };
  const finish = (cancelled: boolean) => {
    cleanup();
    if (!dragging) return;
    const hit = document.elementFromPoint(x, y);
    const onMap = !!hit?.closest("canvas");
    bus.emit(
      new StructureDragEvent(
        cancelled || !onMap ? "cancel" : "drop",
        type,
        x,
        y,
      ),
    );
    // Suppress the synthesized tap, but never eat the next intentional click.
    const suppress = (e: MouseEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    source.addEventListener("click", suppress, { capture: true, once: true });
    setTimeout(() => source.removeEventListener("click", suppress, true), 350);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId === secondary) {
      stop(e);
      secondary = null;
      fine = false;
      return;
    }
    if (e.pointerId !== first) return;
    if (dragging) stop(e);
    finish(false);
  };
  const cancel = (e: PointerEvent) => {
    if (e.pointerId === first || e.pointerId === secondary) {
      stop(e);
      finish(true);
    }
  };
  const abort = () => finish(true);
  window.addEventListener("pointerdown", down, {
    capture: true,
    passive: false,
  });
  window.addEventListener("pointermove", move, {
    capture: true,
    passive: false,
  });
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("blur", abort);
}
