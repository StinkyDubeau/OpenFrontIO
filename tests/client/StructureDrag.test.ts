import { startStructureDrag } from "../../src/client/StructureDrag";
import type { EventBus } from "../../src/core/EventBus";
import { UnitType } from "../../src/core/game/Game";

function pointer(name: string, id: number, x: number, y: number) {
  const event = new Event(name, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: id,
    clientX: x,
    clientY: y,
    pointerType: "touch",
  });
  return event as PointerEvent;
}
test("structure drag uses relative fine adjustment and releases only with primary finger", () => {
  const button = document.createElement("button");
  const canvas = document.createElement("canvas");
  document.body.append(button, canvas);
  const emit = vi.fn();
  button.addEventListener("pointerdown", (event) =>
    startStructureDrag(event, UnitType.Factory, {
      emit,
    } as unknown as EventBus),
  );
  const previous = document.elementFromPoint;
  document.elementFromPoint = () => canvas;
  button.dispatchEvent(pointer("pointerdown", 1, 20, 100));
  window.dispatchEvent(pointer("pointermove", 1, 30, 60));
  window.dispatchEvent(pointer("pointerdown", 2, 200, 100));
  window.dispatchEvent(pointer("pointermove", 2, 220, 80));
  expect(emit).toHaveBeenLastCalledWith(
    expect.objectContaining({ phase: "move", x: 35, y: 55 }),
  );
  window.dispatchEvent(pointer("pointerup", 2, 220, 80));
  expect(emit.mock.calls.some(([event]) => event.phase === "drop")).toBe(false);
  window.dispatchEvent(pointer("pointerup", 1, 30, 60));
  expect(emit).toHaveBeenLastCalledWith(
    expect.objectContaining({ phase: "drop", x: 35, y: 55 }),
  );
  document.elementFromPoint = previous;
  button.remove();
  canvas.remove();
});
test("a simple tap emits no placement events", () => {
  const button = document.createElement("button");
  document.body.append(button);
  const emit = vi.fn();
  button.addEventListener("pointerdown", (event) =>
    startStructureDrag(event, UnitType.City, { emit } as unknown as EventBus),
  );
  button.dispatchEvent(pointer("pointerdown", 1, 20, 100));
  window.dispatchEvent(pointer("pointerup", 1, 20, 100));
  expect(emit).not.toHaveBeenCalled();
  button.remove();
});
