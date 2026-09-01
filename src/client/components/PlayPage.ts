import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
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

        <div class="atlas-title-stage">
          <section class="atlas-launch-console" aria-label="Pressure Atlas">
            <h1 class="sr-only">Pressure Atlas</h1>
            <div class="atlas-app-identity" aria-hidden="true">
              <product-wordmark compact></product-wordmark>
            </div>

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
