import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { PublicGameInfo, PublicGames } from "../core/Schemas";
import "./components/IOSAddToHomeScreenBanner";
import { PublicLobbySocket } from "./LobbySocket";
import { JoinLobbyEvent } from "./Main";
import { UsernameInput } from "./UsernameInput";
import { translateText } from "./Utils";

@customElement("game-mode-selector")
export class GameModeSelector extends LitElement {
  @state() private lobbies: PublicGames | null = null;
  @state() private inputValid = true;

  private lobbySocket = new PublicLobbySocket((lobbies) => {
    this.lobbies = lobbies;
    document.dispatchEvent(
      new CustomEvent("public-lobbies-update", {
        detail: { payload: lobbies },
      }),
    );
  });

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.lobbySocket.start();
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
    this.lobbySocket.stop();
  }

  private handleValidityChange = (event: Event) => {
    this.inputValid = (event as CustomEvent).detail?.isValid ?? true;
  };

  private preferredLobby(): PublicGameInfo | undefined {
    const games = this.lobbies?.games;
    return games?.ffa?.[0] ?? games?.special?.[0] ?? games?.team?.[0];
  }

  render() {
    const lobby = this.preferredLobby();
    const waiting = this.lobbies === null || !lobby;
    const disabled = waiting || !this.inputValid;

    return html`
      <div class="atlas-game-modes">
        <ios-add-to-home-screen-banner
          class="atlas-install-prompt no-crazygames"
        ></ios-add-to-home-screen-banner>

        <button
          type="button"
          class="atlas-quick-play ${disabled ? "is-disabled" : ""}"
          ?disabled=${disabled}
          @click=${() => lobby && this.validateAndJoin(lobby)}
        >
          <span class="atlas-quick-play__icon" aria-hidden="true">▶</span>
          <span class="atlas-quick-play__copy">
            <strong>${translateText("main.play")}</strong>
            <small>
              ${waiting ? "Finding the next match…" : "Public match"}
            </small>
          </span>
          ${waiting
            ? html`<span class="atlas-loading-ring" aria-hidden="true"></span>`
            : html`<svg
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
              </svg>`}
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

  private validateAndJoin(lobby: PublicGameInfo) {
    if (!this.validateUsername()) return;

    this.dispatchEvent(
      new CustomEvent("join-lobby", {
        detail: {
          gameID: lobby.gameID,
          source: "public",
          publicLobbyInfo: lobby,
        } as JoinLobbyEvent,
        bubbles: true,
        composed: true,
      }),
    );
  }
}
