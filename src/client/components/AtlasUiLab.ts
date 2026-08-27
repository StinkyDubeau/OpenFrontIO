import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import "./AtlasPrimitives";

@customElement("atlas-ui-lab")
export class AtlasUiLab extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <main class="atlas-ui-lab" aria-label="Pressure Atlas UI material lab">
        <header class="atlas-ui-lab__header">
          <p>Pressure Atlas · Material Laboratory</p>
          <h1>Executive war-room component system</h1>
          <span>Development-only deterministic reference surface</span>
        </header>

        <section class="atlas-ui-lab__grid" aria-label="Material surfaces">
          ${(
            [
              "mahogany",
              "felt",
              "parchment",
              "brass",
              "chrome",
              "glass",
            ] as const
          ).map(
            (material) => html`
              <atlas-surface material=${material} elevation="raised">
                <div class="atlas-ui-lab__sample">
                  <small>${material}</small>
                  <strong>Material specimen</strong>
                  <span>Retina texture · polished edge · semantic depth</span>
                </div>
              </atlas-surface>
            `,
          )}
        </section>

        <section class="atlas-ui-lab__controls" aria-label="Control states">
          <button class="atlas-war-button atlas-war-button--primary">
            Confirm order
          </button>
          <button class="atlas-war-button atlas-war-button--secondary">
            Review front
          </button>
          <button class="atlas-war-button atlas-war-button--danger">
            Break alliance
          </button>
          <button class="atlas-war-button" disabled>Unavailable</button>
          <label class="atlas-war-field">
            <span>Operation name</span>
            <input value="Northern Watch" />
          </label>
          <label class="atlas-war-field">
            <span>Commitment</span>
            <input type="range" min="1" max="100" value="42" />
          </label>
        </section>

        <section class="atlas-ui-lab__gauges" aria-label="Instrument states">
          <atlas-gauge
            label="Reserve"
            value="42%"
            progress="0.42"
          ></atlas-gauge>
          <atlas-gauge
            label="Treasury"
            value="8.4M"
            progress="0.73"
            tone="green"
          ></atlas-gauge>
          <atlas-gauge
            label="Pressure"
            value="HIGH"
            progress="0.91"
            tone="danger"
          ></atlas-gauge>
        </section>
      </main>
    `;
  }
}

export function mountAtlasUiLab(): boolean {
  if (new URLSearchParams(location.search).get("ui-lab") !== "1") return false;
  document.body.classList.add("atlas-ui-lab-active");
  document.body.append(document.createElement("atlas-ui-lab"));
  return true;
}
