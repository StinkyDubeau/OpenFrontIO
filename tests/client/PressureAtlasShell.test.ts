import fs from "fs";
import path from "path";

const repoRoot = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("Pressure Atlas OpenFront shell", () => {
  test("keeps the canonical OpenFront renderer and HUD mount points", () => {
    const document = source("index.html");
    const hudDeck = source("src/client/components/AtlasGameHud.ts");

    expect(document).toContain('<div id="app"></div>');
    expect(document).toContain(
      '<script type="module" src="/src/client/Main.ts"',
    );
    expect(document).toContain("<atlas-game-hud>");
    expect(hudDeck).toContain("<control-panel");
    expect(hudDeck).toContain("<game-right-sidebar");
    expect(hudDeck).toContain("<game-left-sidebar");
  });

  test("uses the existing lobby entry flow rather than a replacement map", () => {
    const playPage = source("src/client/components/PlayPage.ts");
    const clientRunner = source("src/client/ClientGameRunner.ts");

    expect(playPage).toContain("<username-input");
    expect(playPage).toContain("<game-mode-selector>");
    expect(playPage).not.toContain('class="territory"');
    expect(clientRunner).toContain("createWebGLView");
    expect(clientRunner).toContain('inputOverlay.id = "game-input-overlay"');
  });

  test("redirects legacy idle preview bookmarks to the real client", () => {
    const viteConfig = source("vite.config.ts");

    expect(viteConfig).toContain("legacyIdlePreviewRedirect");
    expect(viteConfig).toContain('pathname !== "/idle/index.html"');
    expect(viteConfig).toContain('Location: "/"');
    expect(viteConfig).not.toContain("idleStandaloneDocument");
  });

  test("mounts the precision bezel beside, never around, the renderer host", () => {
    const document = source("index.html");
    const rendererHost = document.indexOf('<div id="app"></div>');
    const bezel = document.indexOf("<atlas-map-bezel></atlas-map-bezel>");

    expect(rendererHost).toBeGreaterThan(-1);
    expect(bezel).toBeGreaterThan(rendererHost);
  });

  test("consolidates repeated HTML mounts into reusable page and HUD decks", () => {
    const document = source("index.html");
    const pageDeck = source("src/client/components/AtlasPageDeck.ts");
    const rootCustomElements = [
      ...new Set(
        [...document.matchAll(/<([a-z][a-z0-9-]*-[a-z0-9-]+)/g)].map(
          (match) => match[1],
        ),
      ),
    ].sort();

    expect(document).toContain('<atlas-page-deck class="contents">');
    expect(document).toContain("<atlas-game-hud>");
    expect(document).not.toContain("<page-footer>");
    expect(document).not.toContain("<matchmaking-modal");
    expect(document).not.toContain("<control-panel");
    expect(pageDeck).toContain('id="page-settings"');
    expect(pageDeck).toContain('id="page-account"');
    expect(rootCustomElements).toEqual([
      "atlas-game-hud",
      "atlas-global-overlays",
      "atlas-map-bezel",
      "atlas-page-deck",
      "desktop-nav-bar",
      "main-layout",
      "mobile-nav-bar",
      "play-page",
    ]);
  });

  test("keeps the title screen free of marketing-page sections", () => {
    const playPage = source("src/client/components/PlayPage.ts");
    const mainLayout = source("src/client/components/MainLayout.ts");

    expect(playPage).toContain('class="atlas-title-stage"');
    expect(playPage).not.toContain("atlas-intro-copy");
    expect(playPage).not.toContain("atlas-field-note");
    expect(playPage).not.toContain("atlas-feature-row");
    expect(mainLayout).toContain("overflow-hidden");
    expect(mainLayout).not.toContain("overflow-y-auto");
  });

  test("presents one headerless public play action", () => {
    const playPage = source("src/client/components/PlayPage.ts");
    const modeSelector = source("src/client/GameModeSelector.ts");

    expect(playPage).not.toContain("<header");
    expect(playPage).not.toContain("hamburger-btn");
    expect(modeSelector.match(/class="atlas-quick-play /g)).toHaveLength(1);
    expect(modeSelector).not.toContain("atlas-public-lobbies");
    expect(modeSelector).not.toContain("atlas-game-actions");
    expect(modeSelector).toContain("games?.ffa?.[0]");
  });

  test("never offers Add to Home Screen inside the native shell", () => {
    const banner = source("src/client/components/IOSAddToHomeScreenBanner.ts");
    const nativeBridge = source("apps/mobile/src/config/game.ts");
    const renderMethod = banner.slice(banner.indexOf("  render() {"));

    expect(nativeBridge).toContain("window.__PRESSURE_ATLAS_NATIVE__");
    expect(banner).toContain(".__PRESSURE_ATLAS_NATIVE__");
    expect(renderMethod.indexOf(".__PRESSURE_ATLAS_NATIVE__")).toBeLessThan(
      renderMethod.indexOf("return html`"),
    );
  });

  test("keeps product styles away from renderer-owned selectors", () => {
    for (const stylesheet of [
      "src/client/styles/pressure-atlas.css",
      "src/client/styles/war-room.css",
    ]) {
      const cssWithoutComments = source(stylesheet).replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
      expect(cssWithoutComments).not.toMatch(
        /(?:^|[},])\s*(?:#app|canvas|map-display)\b/m,
      );
    }
  });

  test("ships local retina material assets rather than remote dependencies", () => {
    for (const asset of [
      "resources/images/ui/materials/mahogany@2x.webp",
      "resources/images/ui/materials/felt@2x.webp",
      "resources/images/ui/materials/parchment@2x.webp",
    ]) {
      expect(fs.statSync(path.join(repoRoot, asset)).size).toBeGreaterThan(512);
    }

    const warRoomStyles = source("src/client/styles/war-room.css");
    expect(warRoomStyles).toContain("--war-mahogany-texture");
    expect(warRoomStyles).toContain("--war-felt-texture");
    expect(warRoomStyles).toContain("--war-parchment-texture");
  });

  test("provides adaptive UI fidelity without coupling it to game rendering", () => {
    const uiRuntime = source("src/client/ui/WarRoomUI.ts");

    expect(uiRuntime).toContain('export type UiFidelity = "full"');
    expect(uiRuntime).toContain("data-ui-fidelity");
    expect(uiRuntime).toContain("prefers-reduced-motion: reduce");
    expect(uiRuntime).not.toMatch(
      /ClientGameRunner|createWebGLView|GameRenderer/,
    );
  });
});
