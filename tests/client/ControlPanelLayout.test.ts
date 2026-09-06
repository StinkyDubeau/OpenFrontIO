import { ControlPanel } from "../../src/client/hud/layers/ControlPanel";

describe("control-panel layout", () => {
  afterEach(() => {
    document
      .querySelectorAll("control-panel")
      .forEach((panel) => panel.remove());
  });

  it("omits the duplicate structure count in both layouts and keeps both dials", async () => {
    const panel = new ControlPanel();
    document.body.append(panel);
    await panel.updateComplete;

    expect(panel.querySelector(".atlas-structure-count")).toBeNull();
    expect(panel.querySelectorAll("attack-ratio-dial")).toHaveLength(2);
    const desktop = panel.querySelector(".atlas-desktop-control-layout");
    expect(desktop?.children).toHaveLength(2);
    expect(desktop?.lastElementChild?.tagName).toBe("ATTACK-RATIO-DIAL");
    expect(
      panel.querySelector(".atlas-mobile-control-ledger")?.children,
    ).toHaveLength(2);

    for (const dial of panel.querySelectorAll("attack-ratio-dial")) {
      await dial.updateComplete;
      expect(dial.querySelector(".atlas-attack-dial__ratio")?.textContent).toBe(
        "20%",
      );
    }
  });
});
