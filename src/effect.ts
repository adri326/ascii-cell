import type { CellCompatible, Rect, SimulationHandle } from "./simulation.js";
import { mixColor, type Color } from "./color.js";

/** Temporary data structure used by `Simulation.render`
 * to pass information to effects for them to modify the way characters are drawn.
 * `fg`, `bg` and `glyph` may all be modified by the list of `SimulationEffect`s.
 */
export type ProcessedCell<T> = {
    readonly state: Readonly<T>,
    readonly x: number,
    readonly y: number,
    fg: Color,
    bg: Color,
    glyph: string,
};

/** An effect has the ability to modify the way cells are rendered,
 * and call also be reacted to by cells.
 */
export interface SimulationEffect<T extends CellCompatible> {
    /** Should return all cells that have or will be affected by the visual effect.
     * Cells not indicated as affected will **not** receive the visual effect.
     */
    affectedCells(): Iterable<readonly [x: number, y: number]>;

    /** Called after a tick has elapsed.
     * This function is not called during the tick in which the effect is registered.
     */
    nextTick(): void;

    /** If `true`, then the effect will be removed. */
    done(): boolean;

    /** Called to modify the way an affected cell will be rendered.
     * To modify any of the visual properties (foreground, background, glyph),
     * simply mutate `cell`.
     */
    tweakCell(cell: ProcessedCell<T>, handle: SimulationHandle<T>): void;
};

/**
 * A single-cell effect that mixes its base color with another,
 * with the amount decreasing after each tick.
 */
export class FadeEffect implements SimulationEffect<CellCompatible> {
    /** Linear interpolation. */
    static LINEAR(t: number): number {
        return 1.0 - t;
    }

    /** Quadratic interpolation. */
    static QUADRATIC(t: number): number {
        return (1.0 - t) * (1.0 - t);
    }

    /** Cubic interpolation. */
    static CUBIC(t: number): number {
        return Math.pow(1.0 - t, 3);
    }

    /** Sine ease-out interpolation. */
    static SINE(t: number): number {
        return 1.0 - Math.sin(t * Math.PI / 2);
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
        easing: ((t: number) => number) = FadeEffect.LINEAR
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

    tweakCell(cell: ProcessedCell<CellCompatible>, _handle: SimulationHandle<CellCompatible>): void {
        const amount = this.easing(this.tick > 0 ? this.tick / (this.length - 1) : 0);
        if (this.fg) {
            cell.fg = mixColor(cell.fg, this.fg!, amount);
        }
        if (this.bg) {
            cell.bg = mixColor(cell.bg, this.bg!, amount);
        }
    }
}
