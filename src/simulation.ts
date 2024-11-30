import type { Font } from "./font.js";
import type { Color } from "./color.js";
import { ProcessedCell, SimulationEffect } from "./effect.js";

export type CellCompatible = number | boolean | object;

export type Options<T extends CellCompatible> = {
    defaultState: T,
    font: Font,
    getChar(state: T, x: number, y: number): string,
    getColor(state: T, x: number, y: number): Color,
    getBackground(state: T, x: number, y: number): Color,
    onTick?(state: T, x: number, y: number, handle: SimulationHandle<T>): void,

    /// How big the simulation is allowed to get.
    simulationBounds: Rect | (() => Rect),
};

export type Rect = {
    x: number,
    y: number,
    width: number,
    height: number
};

export type SimulationHandle<T extends CellCompatible> = Readonly<{
    /// Immediately sets the cell's contents; do *not* use this during `onTick`.
    set(x: number, y: number, state: T): void;

    /// Updates the cell's contents. This method is safe to use during `onTick`,
    /// as long as it returns a new object
    update(x: number, y: number, update: (prev: Readonly<T>) => T): void;

    /// Registers the effect to be applied to the simulation render.
    addEffect(effect: SimulationEffect<T>): void;

    /// Clears all effects currently affecting the cell at `(x, y)`
    clearEffects(x: number, y: number): void;

    /// Returns the current cell contents.
    get(x: number, y: number): T | null;

    /// Runs a single simulation step
    tick(): void;

    /// Renders the scene onto `canvas`.
    render(canvas: HTMLCanvasElement, rect?: Rect, rerender?: boolean): void;
}>;

export default function simulation<T extends CellCompatible>(options: Options<T>) {
    function getSimulationBounds(): Rect {
        if (typeof options.simulationBounds === "function") return options.simulationBounds();
        else return options.simulationBounds;
    }

    let cells = new Grid(getSimulationBounds(), options.defaultState);
    let dirty = new Grid<boolean>(getSimulationBounds(), true);
    let effectGrid = new Grid<SimulationEffect<T>[]>(getSimulationBounds(), () => []);
    const effects: SimulationEffect<T>[] = [];
    const actions: [x: number, y: number, callback: (prev: Readonly<T>) => T][] = [];

    let previousCanvas: HTMLCanvasElement | null = null;
    let previousRect: Rect | null = null;

    function resize(newBounds: Rect) {
        cells = new Grid(newBounds, cells, options.defaultState);
        dirty = new Grid(newBounds, dirty, true);
        effectGrid = new Grid(newBounds, effectGrid, () => []);
    }

    const res = {
        set(x: number, y: number, state: T) {
            if (!cells.set(x, y, state)) {
                throw new Error("resizing not yet implemented");
            }
            dirty.set(x, y, true);
        },
        get(x: number, y: number): T {
            return cells.get(x, y) ?? options.defaultState;
        },
        update(x: number, y: number, callback: (prev: Readonly<T>) => T) {
            actions.push([x, y, callback]);
        },
        addEffect(effect: SimulationEffect<T>) {
            if (effect.done()) return;

            effects.push(effect);
            for (const [x, y] of effect.affectedCells()) {
                effectGrid.get(x, y)?.push(effect);
            }
        },
        clearEffects(x: number, y: number) {
            const effects = effectGrid.get(x, y);
            if (effects) effects.length = 0;
        },
        tick() {
            // Increment all effects before everything else
            for (const effect of effects) {
                effect.nextTick();
            }
            for (let i = 0; i < effects.length; i++) {
                if (effects[i].done()) {
                    effects.splice(i, 1);
                    i--;
                }
            }

            let onTick = options.onTick;
            if (onTick) {
                for (let y = cells.top; y < cells.top + cells.height; y++) {
                    for (let x = cells.left; x < cells.left + cells.width; x++) {
                        onTick(cells.get(x, y)!, x, y, res);
                    }
                }
            }

            const newBounds = getSimulationBounds();
            if (!rectsEqual(newBounds, cells.getRect())) {
                resize(newBounds);
            }

            for (const [x, y, update] of actions) {
                let prev = cells.get(x, y);
                if (prev !== null) {
                    cells.set(x, y, update(prev));
                    dirty.set(x, y, true);
                }
            }

            actions.length = 0;
        },
        render(canvas: HTMLCanvasElement, rectOpt?: Rect, _rerender?: boolean) {
            let rerender = _rerender ?? false;
            const rect = rectOpt ?? cells.getRect();
            if (canvas !== previousCanvas) {
                previousCanvas = canvas;
                rerender = true;
            }
            if (!rectsEqual(previousRect, rect)) {
                previousRect = rect;
                rerender = true;
            }

            if (rerender) {
                renderAll(cells, dirty, effectGrid, canvas, options, rect, res);
            } else {
                renderDirty(cells, dirty, effectGrid, canvas, options, rect, res);
            }
        }
    } satisfies SimulationHandle<T>;

    return res;
}

class Grid<T extends CellCompatible> {
    private _width: number;
    private _height: number;
    private _left: number;
    private _top: number;
    private data: T[];

    constructor(
        rect: Rect,
        fill: T | ((x: number, y: number) => T)
    );
    constructor(
        rect: Rect,
        blitFrom: Grid<T>, fillDefault: T | ((x: number, y: number) => T)
    );
    constructor(
        rect: Rect,
        fill: T | ((x: number, y: number) => T) | Grid<T>,
        fillDefault?: T | ((x: number, y: number) => T)
    ) {
        this._left = rect.x;
        this._top = rect.y;
        this._width = rect.width;
        this._height = rect.height;

        if (typeof fill == "function") {
            this.data = new Array(rect.width * rect.height).fill(null).map((_, i) => {
                return fill(
                    i % rect.width + rect.x,
                    Math.floor(i / rect.width) + rect.y
                );
            });
        } else if (fill instanceof Grid) {
            this.data = new Array(rect.width * rect.height).fill(null).map((_, i) => {
                const x = i % rect.width + rect.x;
                const y = Math.floor(i / rect.width) + rect.y;

                const res = fill.get(x, y);
                if (res !== null) return res;

                if (typeof fillDefault === "function") return fillDefault(x, y);
                else return fillDefault!
            });
        } else {
            let x = fill;
            this.data = new Array(rect.width * rect.height).fill(fill);
        }
    }

    getRect(): Rect {
        return {
            x: this._left,
            y: this._top,
            width: this._width,
            height: this._height,
        };
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    get left(): number {
        return this._left;
    }

    get top(): number {
        return this._top;
    }

    get(x: number, y: number): T | null {
        x -= this._left;
        y -= this._top;
        if (x < 0 || y < 0 || x >= this._width || y >= this._height) return null;
        else return this.data[y * this._width + x];
    }

    set(x: number, y: number, value: T): boolean {
        x -= this._left;
        y -= this._top;
        if (x < 0 || y < 0 || x >= this._width || y >= this._height) return false;
        this.data[y * this._width + x] = value;
        return true;
    }
}

function rectsEqual(left: Rect | null | undefined, right: Rect) {
    if (!left) return false;

    return (
        left.x === right.x
        && left.y === right.y
        && left.width === right.width
        && left.height === right.height
    );
}

/// Requires that `(x, y)` be in bounds of `cells`
function renderSingle<T extends CellCompatible>(
    ctx: CanvasRenderingContext2D,
    cells: Grid<T>,
    x: number,
    y: number,
    options: Options<T>,
    rect: Rect,
    effects: SimulationEffect<T>[],
    handle: SimulationHandle<T>,
) {
    const state = cells.get(x, y)!;

    const processed: ProcessedCell<T> = {
        state,
        x,
        y,
        glyph: options.getChar(state, x, y),
        fg: options.getColor(state, x, y),
        bg: options.getBackground(state, x, y)
    };

    for (let i = 0; i < effects.length; i++) {
        if (effects[i].done()) {
            effects.splice(i, 1);
            i--;
            continue;
        }
        effects[i].tweakCell(processed, handle);
    }

    options.font.drawChar(
        ctx,
        processed.glyph,
        x - rect.x,
        y - rect.y,
        processed.fg,
        processed.bg,
    );
}

function renderAll<T extends CellCompatible>(
    cells: Grid<T>,
    dirty: Grid<boolean>,
    effectGrid: Grid<SimulationEffect<T>[]>,
    canvas: HTMLCanvasElement,
    options: Options<T>,
    rect: Rect,
    handle: SimulationHandle<T>,
) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");

    for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) {
            if (dirty.set(x, y, false)) {
                const effects = effectGrid.get(x, y)!;
                renderSingle(ctx, cells, x, y, options, rect, effects, handle);
            }
        }
    }
}

function renderDirty<T extends CellCompatible>(
    cells: Grid<T>,
    dirty: Grid<boolean>,
    effectGrid: Grid<SimulationEffect<T>[]>,
    canvas: HTMLCanvasElement,
    options: Options<T>,
    rect: Rect,
    handle: SimulationHandle<T>,
) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");

    for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) {
            const effects = effectGrid.get(x, y)!;
            if (!dirty.get(x, y) && !effects?.length) continue;
            dirty.set(x, y, false);

            renderSingle(ctx, cells, x, y, options, rect, effects, handle);
        }
    }
}
