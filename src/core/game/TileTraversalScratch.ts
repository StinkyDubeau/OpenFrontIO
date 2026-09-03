import { Game } from "./Game";
import { TileRef } from "./GameMap";

/**
 * Shared generation-stamped traversal state. Visited pages are allocated only
 * when a traversal reaches them, so local searches on very large worlds have
 * local memory cost rather than reserving one slot for every world tile.
 */
export interface TileTraversalScratch {
  readonly stack: TileRef[];
  readonly has: (tile: TileRef, generation: number) => boolean;
  readonly mark: (tile: TileRef, generation: number) => void;
  readonly clear: () => void;
  gen: number;
}

const scratches = new WeakMap<Game, TileTraversalScratch>();

export function tileTraversalScratch(game: Game): TileTraversalScratch {
  let scratch = scratches.get(game);
  if (scratch) return scratch;

  const pageStamps: Array<Uint32Array | undefined> = new Array(
    game.tilePages().length,
  );
  scratch = {
    stack: [],
    gen: 0,
    has(tile, generation) {
      const { pageIndex, offset } = game.tilePageLocation(tile);
      return pageStamps[pageIndex]?.[offset] === generation;
    },
    mark(tile, generation) {
      const { pageIndex, offset } = game.tilePageLocation(tile);
      const stamps =
        pageStamps[pageIndex] ??
        (pageStamps[pageIndex] = new Uint32Array(
          game.tilePages()[pageIndex].state.length,
        ));
      stamps[offset] = generation;
    },
    clear() {
      for (const page of pageStamps) page?.fill(0);
    },
  };
  scratches.set(game, scratch);
  return scratch;
}

/** Starts a new traversal pass and returns its generation stamp. */
export function bumpTraversalGeneration(scratch: TileTraversalScratch): number {
  scratch.gen++;
  if (scratch.gen === 0xffffffff) {
    scratch.clear();
    scratch.gen = 1;
  }
  return scratch.gen;
}
