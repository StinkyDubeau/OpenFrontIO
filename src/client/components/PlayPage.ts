import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { crazyGamesSDK } from "../CrazyGamesSDK";
import "./AtlasPrimitives";
import "./ProductWordmark";

@customElement("play-page")
export class PlayPage extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <div id="page-play" class="atlas-play-page">
        <token-login class="absolute"></token-login>
        <rewards-modal class="absolute"></rewards-modal>

        <header class="atlas-mobile-header lg:hidden">
          <div class="atlas-mobile-header__inner">
            <button
              id="hamburger-btn"
              class="atlas-icon-button col-start-1 justify-self-start"
              data-i18n-aria-label="main.menu"
              aria-expanded="false"
              aria-controls="sidebar-menu"
              aria-haspopup="dialog"
              data-i18n-title="main.menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-8"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M4 7h16M4 12h10M4 17h16"
                />
              </svg>
            </button>

            <product-wordmark compact class="col-start-2"></product-wordmark>

            ${crazyGamesSDK.isOnCrazyGames()
              ? html`
                  <button
                    id="crazygames-account-btn"
                    data-page="page-account"
                    class="atlas-icon-button nav-menu-item col-start-3 justify-self-end overflow-hidden"
                    data-i18n-aria-label="main.account"
                    data-i18n-title="main.account"
                  >
                    <img
                      id="crazygames-account-avatar"
                      class="hidden w-8 h-8 rounded-full object-cover"
                      alt=""
                      referrerpolicy="no-referrer"
                    />
                    <svg
                      id="crazygames-account-icon"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                      class="w-7 h-7"
                    >
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <path d="M12 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
                    </svg>
                  </button>
                `
              : html`
                  <div
                    aria-hidden="true"
                    class="col-start-3 justify-self-end size-11"
                  ></div>
                `}
          </div>
        </header>

        <div class="atlas-title-stage">
          <section
            class="atlas-launch-console"
            aria-labelledby="atlas-title-screen-heading"
          >
            <header class="atlas-title-masthead">
              <div class="atlas-title-masthead__brand">
                <h1 id="atlas-title-screen-heading" class="sr-only">
                  Pressure Atlas
                </h1>
                <product-wordmark></product-wordmark>
                <p data-i18n="pressure_atlas.menu_tagline">
                  Persistent multiplayer strategy
                </p>
              </div>
              <atlas-status-lamp
                label="World online"
                i18n-key="pressure_atlas.world_online"
              ></atlas-status-lamp>
            </header>

            <div class="atlas-identity-card">
              <span
                class="atlas-identity-card__label"
                data-i18n="pressure_atlas.commander_identity"
                >Commander identity</span
              >
              <username-input class="atlas-username-input"></username-input>
            </div>

            <game-mode-selector></game-mode-selector>
          </section>
        </div>
      </div>
    `;
  }
}
