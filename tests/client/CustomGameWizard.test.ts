import { render } from "lit";
import { PersistentWorldCreationWizard } from "../../src/client/components/persistent-world/PersistentWorldCreationWizard";
import { worldModeSummary } from "../../src/client/components/persistent-world/WorldModeSummary";

describe("public game creation", () => {
  afterEach(() => document.body.replaceChildren());

  async function wizard(customGame: boolean) {
    const element = new PersistentWorldCreationWizard();
    element.customGame = customGame;
    document.body.append(element);
    await element.updateComplete;
    return element;
  }

  async function continueStep(element: PersistentWorldCreationWizard) {
    const button =
      element.querySelector<HTMLButtonElement>(
        ".pw-wizard__footer .pw-button--primary",
      ) ??
      element.querySelector<HTMLButtonElement>("footer .pw-button--primary");
    expect(button).not.toBeNull();
    button!.click();
    await element.updateComplete;
  }

  it("offers public map presets and readable economic symbols without a debug flag", async () => {
    const element = await wizard(true);
    expect(element.querySelectorAll('input[name="game-preset"]')).toHaveLength(
      5,
    );
    expect(element.textContent).toContain("Great Lakes");
    expect(
      element.querySelector('[aria-label="Trade ships ×10"]'),
    ).not.toBeNull();
    expect(element.querySelector('[aria-label="Trains ×10"]')).not.toBeNull();
    expect(
      element.querySelector('[aria-label="Attack speed ÷15"]'),
    ).not.toBeNull();
  });

  it("uses the host-start path through every custom wizard step", async () => {
    const element = await wizard(true);
    const input =
      element.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.value = "My custom room";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await element.updateComplete;
    await continueStep(element);
    await continueStep(element);
    expect(element.textContent).toContain("Host-controlled start");
    expect(element.querySelector('input[type="datetime-local"]')).toBeNull();
    await continueStep(element);
    expect(element.textContent).toContain("Starts when the host is ready");
    const create = vi.fn();
    element.addEventListener("world-create", create);
    await continueStep(element);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].detail.input).toMatchObject({
      startMode: "host",
      gamePreset: "great-lakes",
      name: "My custom room",
    });
  });

  it("shows scheduled Earth as a fixed choice, not selectable custom economies", async () => {
    const element = await wizard(false);
    expect(element.textContent).toContain("Enormous Earth · 4×");
    expect(element.querySelector('input[name="game-preset"]')).toBeNull();
    expect(element.querySelector('input[name="duration"]')).toBeNull();
    expect(
      element.querySelector('[aria-label="Trade ships ×1"]'),
    ).not.toBeNull();
  });

  it("renders modifier symbols without relying on mouse tooltips", () => {
    render(worldModeSummary("hd-earth-9x"), document.body);
    expect(document.body.textContent).toContain("Trade ships");
    expect(document.body.textContent).toContain("Trains");
    expect(document.body.textContent).toContain("Attack speed");
    expect(document.querySelectorAll("svg")).toHaveLength(3);
  });
});
