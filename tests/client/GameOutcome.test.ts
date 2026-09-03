import { describe, expect, it } from "vitest";
import { classifyLocalGameOutcome } from "../../src/client/GameOutcome";

describe("local game outcome", () => {
  it("recognizes the local player winner", () => {
    expect(classifyLocalGameOutcome(["player", "LOCAL"], "LOCAL")).toBe(
      "victory",
    );
    expect(classifyLocalGameOutcome(["player", "OTHER"], "LOCAL")).toBe(
      "defeat",
    );
  });

  it("uses the team identity rather than the surviving-player tuple", () => {
    expect(
      classifyLocalGameOutcome(
        ["team", "red", "SURVIVING-ALLY"],
        "ELIMINATED-LOCAL",
        "red",
      ),
    ).toBe("victory");
    expect(classifyLocalGameOutcome(["team", "blue"], "LOCAL", "red")).toBe(
      "defeat",
    );
  });

  it("treats cancellation and a bot nation winner as non-victories", () => {
    expect(classifyLocalGameOutcome(undefined, "LOCAL")).toBe("abandoned");
    expect(classifyLocalGameOutcome(["nation", "Bot nation"], "LOCAL")).toBe(
      "defeat",
    );
  });
});
