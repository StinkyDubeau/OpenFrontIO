import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import "./components/IOSAddToHomeScreenBanner";
import { UsernameInput } from "./UsernameInput";
import { translateText } from "./Utils";

@customElement("game-mode-selector")
export class GameModeSelector extends LitElement {
  @state() private inputValid = true;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener(
      "username-validity-change",
      this.handleValidityChange,
    );

    const usernameInput = document.querySelector(
      "username-input",
    ) as UsernameInput | null;
    if (usernameInput) this.inputValid = usernameInput.canPlay();
  }

  disconnectedCallback() {
    this.stop();
    window.removeEventListener(
      "username-validity-change",
      this.handleValidityChange,
    );
    super.disconnectedCallback();
  }

  public stop() {
    // Kept for the existing Client lifecycle. The standalone IdleFront launch
    // surface no longer owns an ordinary public-lobby socket.
  }

  private handleValidityChange = (event: Event) => {
    this.inputValid = (event as CustomEvent).detail?.isValid ?? true;
  };

  render() {
    const disabled = !this.inputValid;

    return html`
      <div class="atlas-game-modes">
        <ios-add-to-home-screen-banner
          class="atlas-install-prompt no-crazygames"
        ></ios-add-to-home-screen-banner>

        <button
          type="button"
          class="atlas-quick-play ${disabled ? "is-disabled" : ""}"
          ?disabled=${disabled}
          @click=${this.openWorlds}
        >
          <span class="atlas-quick-play__icon" aria-hidden="true">▶</span>
          <span class="atlas-quick-play__copy">
            <strong>${translateText("main.play")}</strong>
            <small>${translateText("main.persistent_worlds")}</small>
          </span>
          <svg
            class="atlas-quick-play__chevron"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m7.5 4.5 5 5.5-5 5.5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    `;
  }

  private validateUsername(): boolean {
    const usernameInput = document.querySelector(
      "username-input",
    ) as UsernameInput | null;
    return usernameInput ? usernameInput.canPlay() : true;
  }

  private openWorlds = () => {
    if (!this.validateUsername()) return;

    history.pushState(history.state, "", "/worlds");
    window.showPage?.("page-persistent-worlds");
    document
      .querySelector<PersistentWorldPageElement>("persistent-world-page")
      ?.open?.();
  };
}

interface PersistentWorldPageElement extends Element {
  open?: () => void;
}
