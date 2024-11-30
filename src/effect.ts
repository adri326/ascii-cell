import type { CellCompatible, Color, SimulationHandle } from "./simulation.js";

export type ProcessedCell<T> = {
    readonly state: Readonly<T>,
    readonly x: number,
    readonly y: number,
    fg: Color,
    bg: Color,
    glyph: string,
};

export interface SimulationEffect<T extends CellCompatible> {
    /// Should return all cells that have or will be affected by the visual effect.
    /// Cells not indicated as affected will **not** receive the visual effect.
    affectedCells(): Iterable<[x: number, y: number]>;

    /// Called after a tick has elapsed. This function is not called when the effect is registered.
    nextTick(): void;

    /// If `true`, then the effect will be removed.
    done(): boolean;

    /// Called to modify the way an affected cell will be rendered.
    /// To modify any of the visual properties (foreground, background, glyph),
    /// simply mutate `cell`.
    tweakCell(cell: ProcessedCell<T>, handle: SimulationHandle<T>): void;
};
