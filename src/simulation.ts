import type { Font } from "./font.js";
import type { Color } from "./color.js";
import { ProcessedCell, SimulationEffect } from "./effect.js";

export type CellCompatible = number | boolean | object;

export const SLEEP = Symbol("SLEEP");

export type SimulationOptions<T extends CellCompatible> = {
    /**
     * What new or out-of-bounds cells should receive as initial state.
     */
    defaultState: T,

    /**
     * Which glyph the given cell should be rendered with.
     */
    getChar(state: T, x: number, y: number): string,

    /**
     * Which foreground color the given cell should be rendered with.
     */
    getColor(state: T, x: number, y: number): Color,

    /**
     * Which background color the given cell should be rendered with.
     */
    getBackground(state: T, x: number, y: number): Color,

    /**
     * Called at the very start of the simulation, to initialize cells.
     * `onInit` may call destructive functions like `handle.set()`.
     */
    onInit?(handle: SimulationHandle<T>): void,

    /**
     * Called for each cell at each tick.
     * For the simulation to be consistent, it should not use destructive functions like `handle.set()`.
     *
     * If it returns `SLEEP`, then the cell will be marked as sleeping.
     * If all cells in a block of cells are sleeping, then the block will not be processed,
     * until an update within it is done.
     */
    onTick?(state: T, x: number, y: number, handle: SimulationHandle<T>): void | typeof SLEEP,

    /** How big the simulation is allowed to get. */
    simulationBounds?: Rect | (() => Rect),

    /** If set, indicates how far a cell who is awake may affect other cells.
     * The potentially affected cells will continue to get processed.
     */
    wakeRadius?: number,

    /** Various debug options */
    debug?: {
        /** If true, highlights in pink the cells that are asleep */
        sleep?: boolean,
        /** If true, always renders every cell */
        alwaysRender?: boolean,
    },
};

export type Rect = {
    x: number,
    y: number,
    width: number,
    height: number
};

export type SimulationHandle<T extends CellCompatible> = Readonly<{
    /** Immediately sets the cell's contents; do *not* use this during `onTick`. */
    set(x: number, y: number, state: T): void;

    /** Updates the cell's contents. This method is safe to use during `onTick`,
     * as long as it returns a new object.
     */
    update(x: number, y: number, update: (prev: Readonly<T>) => T): void;

    /** Registers the effect to be applied to the simulation render. */
    addEffect(effect: SimulationEffect<T>): void;

    /** Clears all effects currently affecting the cell at `(x, y)` */
    clearEffects(x: number, y: number): void;

    /** Returns the current cell contents. */
    get(x: number, y: number): T | null;

    /** Returns the list of effects currently being applied to the given cell. */
    getEffects(x: number, y: number): SimulationEffect<T>[];

    /** Runs a single simulation step */
    tick(): void;

    /** Renders the scene onto `canvas`, which should implement the Canvas API. */
    render(canvas: HTMLCanvasElement, font: Font, rect?: Rect, rerender?: boolean): void;
}>;

const ASLEEP_RATIO: number = 8;

export default function simulation<T extends CellCompatible>(options: SimulationOptions<T>): SimulationHandle<T> {
    function getSimulationBounds(): Rect {
        if (typeof options.simulationBounds === "function") return options.simulationBounds();
        else return options.simulationBounds ?? {
            x: 0,
            y: 0,
            width: 8,
            height: 8
        };
    }

    const onTick: Exclude<SimulationOptions<T>["onTick"], undefined> = options.onTick ?? (() => {});

    let cells = new Grid(getSimulationBounds(), options.defaultState);
    let dirty = new Grid<boolean>(getSimulationBounds(), true);
    let effectGrid = new Grid<SimulationEffect<T>[]>(getSimulationBounds(), () => []);
    let asleep = new Grid<boolean>(divideRect(getSimulationBounds(), ASLEEP_RATIO), false);
    const effects: SimulationEffect<T>[] = [];
    const actions: [x: number, y: number, callback: (prev: Readonly<T>) => T][] = [];

    let previousCanvas: HTMLCanvasElement | null = null;
    let previousRect: Rect | null = null;

    function resize(newBounds: Rect) {
        cells = new Grid(newBounds, cells, options.defaultState);
        dirty = new Grid(newBounds, dirty, true);
        effectGrid = new Grid(newBounds, effectGrid, () => []);
        asleep = new Grid(divideRect(newBounds, ASLEEP_RATIO), asleep, false);
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
        getEffects(x: number, y: number) {
            return effectGrid.get(x, y) ?? [];
        },
        tick() {
            // Increment all effects
            for (const effect of effects) {
                effect.nextTick();
            }
            for (let i = 0; i < effects.length; i++) {
                if (effects[i].done()) {
                    // PERF: swap_remove
                    effects.splice(i, 1);
                    i--;
                }
            }

            iterAwake(effectGrid, asleep, ASLEEP_RATIO, (effects, x, y) => {
                let stayAwake = effects.length > 0;
                // Mark cells with effects as dirty and remove effects that are done
                if (effects.length > 0) dirty.set(x, y, true);
                for (let i = 0; i < effects.length; i++) {
                    if (effects[i].done()) {
                        // PERF: swap_remove
                        effects.splice(i, 1);
                        i--;
                    }
                }

                // Run onTick on the existing cells
                const sleep = onTick(cells.get(x, y)!, x, y, res);
                if (sleep !== SLEEP) stayAwake = true;

                return stayAwake;
            }, options.wakeRadius ?? 0, true);

            // Resize the simulation area if needed
            const newBounds = getSimulationBounds();
            if (!rectsEqual(newBounds, cells.getRect())) {
                resize(newBounds);
            }

            // Trigger the updates
            for (const [x, y, update] of actions) {
                let prev = cells.get(x, y);
                if (prev !== null) {
                    cells.set(x, y, update(prev));
                    dirty.set(x, y, true);
                    asleep.set(Math.floor(x / ASLEEP_RATIO), Math.floor(y / ASLEEP_RATIO), false);
                }
            }

            actions.length = 0;
        },
        render(canvas: HTMLCanvasElement, font: Font, rectOpt?: Rect, _rerender?: boolean) {
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

            if (rerender || options.debug?.alwaysRender) {
                renderAll(cells, dirty, effectGrid, canvas, options, font, rect, res);
            } else {
                renderDirty(cells, dirty, effectGrid, canvas, options, font, rect, res);
            }

            if (options.debug?.sleep) {
                const ctx = canvas.getContext("2d")!;
                for (let gy = asleep.top; gy < asleep.top + asleep.height; gy++) {
                    for (let gx = asleep.left; gx < asleep.left + asleep.width; gx++) {
                        ctx.globalCompositeOperation = "source-over";
                        if (asleep.get(gx, gy)) {
                            ctx.fillStyle = "rgba(200, 100, 160, 0.2)";
                        } else {
                            ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
                        }
                        ctx.fillRect(
                            (gx * ASLEEP_RATIO - rect.x) * font.charWidth(),
                            (gy * ASLEEP_RATIO - rect.y) * font.charHeight(),
                            ASLEEP_RATIO * font.charWidth(),
                            ASLEEP_RATIO * font.charHeight()
                        );
                    }
                }
            }
        }
    } satisfies SimulationHandle<T>;

    options.onInit?.(res);

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

function divideRect(rect: Rect, by: number): Rect {
    return {
        x: Math.floor(rect.x / by),
        y: Math.floor(rect.y / by),
        width: Math.ceil(rect.width / by),
        height: Math.ceil(rect.height / by),
    };
}

function iterAwake<T extends CellCompatible>(
    cells: Grid<T>,
    asleep: Grid<boolean>,
    asleep_ratio: number,
    callback: (cell: T, x: number, y: number) => void | boolean,
    wakeRadius: number = 0,
    resetAsleep: boolean = false,
) {
    const awakeMetacells: Set<number> = new Set();
    const wakeMetaradius = Math.ceil(wakeRadius / asleep_ratio);
    function wakeAt(x: number, y: number) {
        const gx = Math.floor(x / asleep_ratio);
        const gy = Math.floor(y / asleep_ratio);
        if (
            gx < asleep.left
            || gx >= asleep.left + asleep.width
            || gy < asleep.top
            || gy >= asleep.top + asleep.height
        ) return;

        awakeMetacells.add((gx - asleep.left) + (gy - asleep.top) * asleep.width);
    }

    for (let gy = asleep.top; gy < asleep.top + asleep.height; gy++) {
        for (let gx = asleep.left; gx < asleep.left + asleep.width; gx++) {
            if (asleep.get(gx, gy)) continue;
            if (resetAsleep) {
                asleep.set(gx, gy, true);
            }

            for (let dy = 0; dy < asleep_ratio; dy++) {
                const y = gy * asleep_ratio + dy;
                if (y < cells.top || y >= cells.top + cells.height) continue;

                for (let dx = 0; dx < asleep_ratio; dx++) {
                    const x = gx * asleep_ratio + dx;
                    const cell = cells.get(x, y);
                    if (cell === null) continue;

                    if (callback(cell, x, y)) {
                        wakeAt(x, y);
                    }
                }
            }
        }
    }

    for (const index of awakeMetacells) {
        const x = (index % asleep.width) + asleep.left;
        const y = Math.floor(index / asleep.width) + asleep.top;

        for (let gy = y - wakeMetaradius; gy <= y + wakeMetaradius; gy++) {
            for (let gx = x - wakeMetaradius; gx <= x + wakeMetaradius; gx++) {
                asleep.set(gx, gy, false);
            }
        }
    }
}

/// Requires that `(x, y)` be in bounds of `cells`
function renderSingle<T extends CellCompatible>(
    ctx: CanvasRenderingContext2D,
    cells: Grid<T>,
    x: number,
    y: number,
    options: SimulationOptions<T>,
    font: Font,
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

    font.drawChar(
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
    options: SimulationOptions<T>,
    font: Font,
    rect: Rect,
    handle: SimulationHandle<T>,
) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");

    for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) {
            if (dirty.set(x, y, false)) {
                const effects = effectGrid.get(x, y)!;
                renderSingle(ctx, cells, x, y, options, font, rect, effects, handle);
            }
        }
    }
}

function renderDirty<T extends CellCompatible>(
    cells: Grid<T>,
    dirty: Grid<boolean>,
    effectGrid: Grid<SimulationEffect<T>[]>,
    canvas: HTMLCanvasElement,
    options: SimulationOptions<T>,
    font: Font,
    rect: Rect,
    handle: SimulationHandle<T>,
) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");

    for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) {
            if (!dirty.get(x, y)) continue;
            const effects = effectGrid.get(x, y)!;
            dirty.set(x, y, false);

            renderSingle(ctx, cells, x, y, options, font, rect, effects, handle);
        }
    }
}
