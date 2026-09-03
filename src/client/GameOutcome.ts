import type { Winner } from "../core/Schemas";

export type LocalGameOutcome = "victory" | "defeat" | "abandoned";

/** Classifies the canonical simulation winner from this client's perspective. */
export function classifyLocalGameOutcome(
  winner: Winner,
  clientID: string | undefined,
  localTeam?: string,
): LocalGameOutcome {
  if (winner === undefined) return "abandoned";
  if (winner[0] === "player") {
    return clientID !== undefined && winner[1] === clientID
      ? "victory"
      : "defeat";
  }
  if (winner[0] === "team") {
    return localTeam !== undefined && winner[1] === localTeam
      ? "victory"
      : "defeat";
  }
  return "defeat";
}
