import WebSocket from "ws";

interface Frame {
  bytes: Uint8Array;
  tick: number;
}
/** Bounded application-acknowledged window. RTT never gates one game tick. */
export class ViewConnection {
  private queue: Frame[] = [];
  private queuedBytes = 0;
  private sequence = 0;
  private acknowledged = 0;
  private closed = false;
  private ackTimeout: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private ws: WebSocket,
    private onSlow: () => void,
  ) {}
  enqueue(bytes: Uint8Array, tick: number): void {
    if (this.closed) return;
    if (
      this.queue.length >= 1_024 ||
      this.queuedBytes + bytes.byteLength > 128 * 1024 * 1024
    ) {
      this.stop();
      this.onSlow();
      return;
    }
    this.queue.push({ bytes, tick });
    this.queuedBytes += bytes.byteLength;
    this.pump();
  }
  acknowledge(sequence: number): void {
    if (sequence <= this.acknowledged || sequence > this.sequence) return;
    clearTimeout(this.ackTimeout);
    this.ackTimeout = undefined;
    this.acknowledged = sequence;
    this.pump();
  }
  private pump(): void {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.sequence - this.acknowledged < 8 && this.queue.length) {
      const frame = this.queue.shift()!;
      this.queuedBytes -= frame.bytes.byteLength;
      const header = Buffer.alloc(4);
      header.writeUInt32BE(++this.sequence);
      this.ws.send(
        Buffer.concat([header, frame.bytes]),
        { binary: true },
        (error) => {
          if (error) {
            this.stop();
            this.onSlow();
          }
        },
      );
    }
    if (this.sequence > this.acknowledged && this.ackTimeout === undefined) {
      this.ackTimeout = setTimeout(() => {
        this.stop();
        this.onSlow();
      }, 30_000);
      this.ackTimeout.unref?.();
    }
  }
  stop(): void {
    this.closed = true;
    clearTimeout(this.ackTimeout);
    this.queue = [];
    this.queuedBytes = 0;
  }
}
