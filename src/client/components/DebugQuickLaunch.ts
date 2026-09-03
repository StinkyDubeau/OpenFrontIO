import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { quickJoinDebugGame, quickStartDebugGame } from "../DebugQuickStart";
import { requestHaptic } from "../ui/Haptics";

@customElement("idlefront-debug-quick-launch")
export class DebugQuickLaunch extends LitElement {
  @state() private action: "idle" | "starting" | "joining" = "idle";
  @state() private status = "Debug tools";

  static styles = css`
    :host {
      position: fixed;
      right: max(12px, env(safe-area-inset-right));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 10000;
      max-width: min(360px, calc(100vw - 24px));
      color: #f6f1df;
      font:
        600 12px/1.25 system-ui,
        sans-serif;
    }

    .panel {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
      padding: 8px;
      border: 1px solid rgb(255 213 100 / 55%);
      border-radius: 15px;
      background: rgb(14 22 22 / 86%);
      box-shadow:
        0 10px 32px rgb(0 0 0 / 45%),
        inset 0 1px rgb(255 255 255 / 16%);
      backdrop-filter: blur(16px) saturate(130%);
    }

    p {
      grid-column: 1 / -1;
      min-width: 0;
      margin: 0 4px 1px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: rgb(246 241 223 / 78%);
    }

    button {
      min-width: 0;
      min-height: 40px;
      padding: 0 13px;
      border: 1px solid rgb(255 255 255 / 28%);
      border-radius: 11px;
      color: #172019;
      background: linear-gradient(#fff5c7, #dcae42);
      box-shadow:
        inset 0 1px rgb(255 255 255 / 80%),
        0 3px 0 #76531b;
      font: inherit;
      cursor: pointer;
      transition:
        translate 100ms ease,
        box-shadow 100ms ease,
        filter 100ms ease;
    }

    button:last-child {
      color: #f6f1df;
      background: linear-gradient(#586864, #263430);
      box-shadow:
        inset 0 1px rgb(255 255 255 / 25%),
        0 3px 0 #111916;
    }

    button:active:not(:disabled) {
      translate: 0 3px;
      box-shadow: inset 0 2px 4px rgb(0 0 0 / 35%);
      filter: brightness(0.94);
    }

    button:disabled {
      cursor: wait;
      filter: grayscale(0.45) brightness(0.72);
    }

    @media (max-width: 520px) {
      :host {
        right: max(8px, env(safe-area-inset-right));
        bottom: max(8px, env(safe-area-inset-bottom));
        max-width: calc(100vw - 16px);
      }
    }
  `;

  private run = async (action: "starting" | "joining"): Promise<void> => {
    this.action = action;
    this.status = action === "starting" ? "Preparing game…" : "Finding game…";
    try {
      const quickAction =
        action === "starting" ? quickStartDebugGame : quickJoinDebugGame;
      await quickAction((message) => (this.status = message));
      requestHaptic("success");
    } catch (error) {
      this.status =
        error instanceof Error ? error.message : "Debug action failed";
      this.action = "idle";
      requestHaptic("error");
    }
  };

  render() {
    return html`
      <aside class="panel" aria-label="Debug quick launch">
        <p role="status">${this.status}</p>
        <button
          type="button"
          ?disabled=${this.action !== "idle"}
          @click=${() => this.run("starting")}
        >
          ${this.action === "starting" ? "Starting…" : "Quick start"}
        </button>
        <button
          type="button"
          ?disabled=${this.action !== "idle"}
          @click=${() => this.run("joining")}
        >
          ${this.action === "joining" ? "Joining…" : "Quick join"}
        </button>
      </aside>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "idlefront-debug-quick-launch": DebugQuickLaunch;
  }
}
