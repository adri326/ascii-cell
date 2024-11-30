import type { CellCompatible, Rect, SimulationHandle } from "./simulation.js";
import { mixColor, type Color } from "./color.js";

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
    affectedCells(): Iterable<readonly [x: number, y: number]>;

    /// Called after a tick has elapsed. This function is not called when the effect is registered.
    nextTick(): void;

    /// If `true`, then the effect will be removed.
    done(): boolean;

    /// Called to modify the way an affected cell will be rendered.
    /// To modify any of the visual properties (foreground, background, glyph),
    /// simply mutate `cell`.
    tweakCell(cell: ProcessedCell<T>, handle: SimulationHandle<T>): void;
};

export class FadeEffect implements SimulationEffect<CellCompatible> {
    static decreaseLinear(t: number): number {
        return 1.0 - t;
    }

    public readonly x: number;
    public readonly y: number;
    public readonly easing: (t: number) => number;
    public readonly length: number;
    public readonly fg: Color | null;
    public readonly bg: Color | null;
    private tick: number;

    constructor(
        x: number,
        y: number,
        options: {
            fg?: Color,
            bg?: Color,
            length: number,
        },
        easing: ((t: number) => number) = FadeEffect.decreaseLinear
    ) {
        this.x = x;
        this.y = y;
        this.easing = easing;
        this.length = options.length;
        this.tick = 0;
        this.fg = options.fg ?? null;
        this.bg = options.bg ?? null;
    }

    affectedCells() {
        return [[this.x, this.y]] as const;
    }

    nextTick(): void {

        this.tick++;
    }

    done(): boolean {
        return this.tick >= this.length;
    }

    tweakCell(cell: ProcessedCell<CellCompatible>, handle: SimulationHandle<CellCompatible>): void {
        const amount = this.easing(this.tick > 0 ? this.tick / (this.length - 1) : 0);
        if (this.fg) {
            cell.fg = mixColor(cell.fg, this.fg!, amount);
        }
        if (this.bg) {
            cell.bg = mixColor(cell.bg, this.bg!, amount);
        }
    }
}
