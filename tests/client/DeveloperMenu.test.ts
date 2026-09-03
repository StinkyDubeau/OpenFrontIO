import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  openDeveloperMenu,
  recordDeveloperMenuLogoTap,
  resetDeveloperMenuTapSequence,
  type IdleFrontDeveloperMenu,
} from "../../src/client/components/DeveloperMenu";
import "../../src/client/components/ProductWordmark";

describe("secret developer menu", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetDeveloperMenuTapSequence();
  });

  afterEach(() => {
    document.querySelector("idlefront-developer-menu")?.remove();
    document.body.classList.remove("atlas-dev-menu-open");
  });

  it("opens only after seven logo taps", async () => {
    const wordmark = document.createElement("product-wordmark");
    document.body.append(wordmark);
    await wordmark.updateComplete;
    const logo = wordmark.querySelector<HTMLElement>(".atlas-wordmark")!;
    expect(logo.getAttribute("role")).toBe("button");

    for (let tap = 0; tap < 6; tap++) logo.click();
    expect(document.querySelector("idlefront-developer-menu")).toBeNull();

    logo.click();
    const menu = document.querySelector<IdleFrontDeveloperMenu>(
      "idlefront-developer-menu",
    );
    expect(menu).not.toBeNull();
    await menu!.updateComplete;
    expect(menu!.querySelector('a[href="/?ui-lab=1"]')).not.toBeNull();
    expect(
      menu!.querySelector('a[href="/?ui-lab=stone-buttons"]'),
    ).not.toBeNull();
  });

  it("expires an incomplete tap sequence and keeps the menu singleton", () => {
    for (let tap = 0; tap < 6; tap++) {
      expect(recordDeveloperMenuLogoTap(tap * 100)).toBe(false);
    }
    expect(recordDeveloperMenuLogoTap(5_000)).toBe(false);
    expect(document.querySelector("idlefront-developer-menu")).toBeNull();

    for (let tap = 1; tap < 7; tap++) {
      recordDeveloperMenuLogoTap(5_000 + tap * 100);
    }
    const first = document.querySelector("idlefront-developer-menu");
    expect(first).not.toBeNull();
    expect(openDeveloperMenu()).toBe(first);
    expect(document.querySelectorAll("idlefront-developer-menu")).toHaveLength(
      1,
    );
  });

  it("closes from its explicit close control", async () => {
    const menu = openDeveloperMenu();
    await menu.updateComplete;
    menu
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Close developer menu"]',
      )!
      .click();
    expect(document.querySelector("idlefront-developer-menu")).toBeNull();
  });
});
