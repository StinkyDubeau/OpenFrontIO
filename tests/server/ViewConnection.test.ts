import { afterEach, describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { ViewConnection } from "../../src/server/simulation/ViewConnection";

afterEach(() => vi.useRealTimers());
describe("view flow control", () => {
  it("pipelines eight frames, ignores invalid acknowledgements, then advances", () => {
    vi.useFakeTimers();
    const ws = { readyState: 1, send: vi.fn() };
    const slow = vi.fn();
    const view = new ViewConnection(ws as unknown as WebSocket, slow);
    for (let n = 0; n < 20; n++) view.enqueue(new Uint8Array([n]), n);
    expect(ws.send).toHaveBeenCalledTimes(8);
    view.acknowledge(99);
    expect(ws.send).toHaveBeenCalledTimes(8);
    view.acknowledge(4);
    expect(ws.send).toHaveBeenCalledTimes(12);
    view.acknowledge(3);
    expect(ws.send).toHaveBeenCalledTimes(12);
    view.stop();
  });
  it("new game ticks do not extend a stalled client's deadline", () => {
    vi.useFakeTimers();
    const slow = vi.fn();
    const view = new ViewConnection(
      { readyState: 1, send: vi.fn() } as unknown as WebSocket,
      slow,
    );
    for (let n = 0; n < 31; n++) {
      view.enqueue(new Uint8Array([0]), n);
      vi.advanceTimersByTime(1000);
    }
    expect(slow).toHaveBeenCalledOnce();
  });
});
