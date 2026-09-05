import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { quickJoinDebugGame, quickStartDebugGame } from "../DebugQuickStart";
import { requestHaptic } from "../ui/Haptics";

@customElement("idlefront-debug-quick-launch")
export class DebugQuickLaunch extends LitElement {
  @state() private longSession = false;
  @state() private action: "idle" | "starting" | "joining" = "idle";
  @state() private status = "Debug tools";

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      width: 100%;
      margin-bottom: 12px;
      color: #f6f1df;
      font:
        600 12px/1.25 system-ui,
        sans-serif;
    }
    label {
      grid-column: 1 / -1;
      display: flex;
      gap: 8px;
      align-items: center;
      min-height: 44px;
      padding: 4px;
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
      overflow-wrap: anywhere;
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
  `;

  private run = async (action: "starting" | "joining"): Promise<void> => {
    this.action = action;
    this.status = action === "starting" ? "Preparing game…" : "Finding game…";
    try {
      const status = (message: string) => (this.status = message);
      if (action === "starting") {
        await quickStartDebugGame(status, this.longSession ? "1d" : "1h");
      } else {
        await quickJoinDebugGame(status);
      }
      requestHaptic("success");
    } catch (error) {
      this.status =
        error instanceof Error ? error.message : "Debug action failed";
      requestHaptic("error");
    } finally {
      this.action = "idle";
    }
  };

  render() {
    return html`
      <aside class="panel" aria-label="Debug quick launch">
        <p role="status">${this.status}</p>
        <label>
          <input
            type="checkbox"
            .checked=${this.longSession}
            ?disabled=${this.action !== "idle"}
            @change=${(event: Event) => {
              this.longSession = (event.target as HTMLInputElement).checked;
            }}
          />
          Long session (up to 24h; normal victories still apply)
        </label>
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
