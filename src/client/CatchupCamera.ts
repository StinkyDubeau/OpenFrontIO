import type { EventBus } from "../core/EventBus";
import { FitMapEvent } from "./TransformHandler";

/** Camera presentation only: never delays snapshot application or live turns. */
export class CatchupCamera {
  active = false;
  constructor(private events: EventBus) {}

  update(pendingTurns: number): void {
    const catchingUp = pendingTurns > 1;
    if (catchingUp && !this.active) this.events.emit(new FitMapEvent());
    this.active = catchingUp;
  }
}
