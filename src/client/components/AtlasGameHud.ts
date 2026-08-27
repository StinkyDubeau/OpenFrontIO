import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Reusable mount deck for the canonical OpenFront HUD controllers. It composes
 * their hosts but owns no simulation, map, camera, sampling, or input logic.
 */
@customElement("atlas-game-hud")
export class AtlasGameHud extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <div
        class="atlas-hud-dock fixed bottom-0 left-0 w-full z-[200] flex flex-col pointer-events-none sm:flex-row sm:items-end lg:grid lg:grid-cols-[1fr_500px_1fr] lg:items-end min-[1200px]:px-4"
        style="padding-bottom: env(safe-area-inset-bottom); padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right);"
      >
        <div
          class="contents sm:flex sm:flex-col sm:pointer-events-none w-full sm:w-[500px] lg:col-start-2 sm:z-10"
        >
          <attacks-display
            class="w-full pointer-events-auto order-1 sm:order-none"
          ></attacks-display>
          <div
            class="atlas-control-deck pointer-events-auto order-3 sm:order-none"
          >
            <control-panel class="w-full"></control-panel>
            <unit-display class="hidden lg:block w-full"></unit-display>
          </div>
        </div>

        <div
          class="flex flex-col pointer-events-none items-end order-2 sm:order-none sm:flex-1 lg:col-start-3 lg:self-end lg:justify-end"
        >
          <chat-display
            class="w-full sm:w-auto pointer-events-auto"
          ></chat-display>
          <events-display
            class="w-full sm:w-auto pointer-events-auto"
          ></events-display>
          <actionable-events
            class="w-full sm:w-auto pointer-events-auto"
          ></actionable-events>
        </div>
      </div>

      <emoji-table></emoji-table>
      <build-menu></build-menu>
      <win-modal></win-modal>
      <new-lobby-prompt></new-lobby-prompt>
      <game-starting-modal></game-starting-modal>
      <div
        class="atlas-hud-corner-stack flex flex-col items-end fixed top-0 right-0 min-[1200px]:top-4 min-[1200px]:right-4 z-1000 gap-2"
      >
        <game-right-sidebar></game-right-sidebar>
        <replay-panel></replay-panel>
      </div>
      <settings-modal></settings-modal>
      <graphics-settings-modal></graphics-settings-modal>
      <player-panel></player-panel>
      <spawn-timer></spawn-timer>
      <immunity-timer></immunity-timer>
      <in-game-promo class="hidden"></in-game-promo>
      <alert-frame></alert-frame>
      <chat-modal></chat-modal>
      <multi-tab-modal></multi-tab-modal>
      <game-left-sidebar></game-left-sidebar>
      <performance-overlay></performance-overlay>
      <player-info-overlay></player-info-overlay>
      <heads-up-message></heads-up-message>
    `;
  }
}
