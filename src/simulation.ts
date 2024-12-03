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
    onInit?(handle: Simulation<T>): void,

    /**
     * Called for each cell at each tick.
     * For the simulation to be consistent, it should not use destructive functions like `handle.set()`.
     *
     * If it returns `SLEEP`, then the cell will be marked as sleeping.
     * If all cells in a block of cells are sleeping, then the block will not be processed,
     * until an update within it is done.
     */
    onTick?(state: T, x: number, y: number, handle: Simulation<T>): void | typeof SLEEP,

    /** How big the simulation is allowed to get. */
    simulationBounds?: Rect | (() => Rect),

    /**
     * Options related to improving the simulation's performances.
    */
    performance?: {
        /** If set, indicates how far a cell who is awake may affect other cells.
         * The potentially affected cells will continue to get processed.
         *
         * Only has an effect if cells can become asleep.
         */
        wakeRadius?: number,

        /**
         * Indicates whether or not the initial state should be rendered on screen when first spawned in.
         */
        initialStateIsClean?: boolean,

        /**
         * Indicates whether or not cells spawned in with the initial state can immediately become asleep.
         */
        initialStateSleep?: boolean,
    },

    /** Various debug options */
    debug?: {
        /** If true, highlights in pink the cells that are asleep */
        sleep?: boolean,
        /** If true, always renders every cell */
        alwaysRender?: boolean,
        /** If true, logs performance metrics */
        logPerformance?: boolean,
    },
};

export type Rect = {
    x: number,
    y: number,
    width: number,
    height: number
};

const ASLEEP_RATIO: number = 8;

function getSimulationBounds(bounds: SimulationOptions<CellCompatible>["simulationBounds"]): Rect {
    if (typeof bounds === "function") return bounds();
    else return bounds ?? {
        x: 0,
        y: 0,
        width: 8,
        height: 8
    };
}

export class Simulation<T extends CellCompatible> {
    protected readonly options: Readonly<SimulationOptions<T>>;

    private _onTick: Exclude<SimulationOptions<T>["onTick"], undefined>;
    private _initialDirty: boolean;
    private _initialSleepy: boolean;
    private _defaultState: T;

    private _previousCanvas: HTMLCanvasElement | null;
    private _previousRect: Rect | null;
    /** Skips the rendering logic if no changes were made anywhere */
    private _globalDirty: boolean;

    /** The actual cell states */
    protected cells: Grid<T>;
    /** Whether or not the given cells need to be re-renredered */
    protected dirty: Grid<boolean>;
    /** The current visual effects for each cell */
    protected effectGrid: Grid<SimulationEffect<T>[]>;
    /** A grid with a lower resolution, indicating whether the grouped cells are all asleep or not.
     * This notably helps simulations where many cells are empty and do nothing.
     */
    protected asleep: Grid<boolean>;
    /** All current effects, used for housekeeping */
    protected effects: SimulationEffect<T>[];
    /** The current unresolved actions; these are queued by the `update` method, when called with `onTick` */
    protected actions: [x: number, y: number, callback: (prev: Readonly<T>) => T][];

    protected currentTick: number;

    constructor(options: SimulationOptions<T>) {
        this.options = options;
        this._defaultState = options.defaultState;
        this._onTick = options.onTick ?? (() => {});
        this._initialDirty = !options.performance?.initialStateIsClean;
        this._initialSleepy = options.performance?.initialStateSleep ?? false;

        const bounds = getSimulationBounds(options.simulationBounds);
        this.cells = new Grid(bounds, this._defaultState);
        this.dirty = new Grid<boolean>(bounds, this._initialDirty);
        this.effectGrid = new Grid<SimulationEffect<T>[]>(bounds, () => []);
        this.asleep = new Grid<boolean>(divideRect(bounds, ASLEEP_RATIO), this._initialSleepy);

        this.effects = [];
        this.actions = [];

        this._previousCanvas = null;
        this._previousRect = null;
        this._globalDirty = this._initialDirty;

        this.currentTick = 0;

        options.onInit?.(this);
    }

    public downcast(): Simulation<CellCompatible> {
        return this as Simulation<CellCompatible>;
    }

    private resize(newBounds: Rect) {
        this.cells = new Grid(newBounds, this.cells, this._defaultState);
        this.dirty = new Grid(newBounds, this.dirty, this._initialDirty);
        this.effectGrid = new Grid(newBounds, this.effectGrid, () => []);
        this.asleep = new Grid(divideRect(newBounds, ASLEEP_RATIO), this.asleep, this._initialSleepy);
        this._globalDirty = true;
    }

    public set(x: number, y: number, state: T) {
        if (!this.cells.set(x, y, state)) {
            console.warn(`Could not set cell at (${x}, ${y}): out of (current) bounds.`);
        }
        this.dirty.set(x, y, true);
        this.asleep.set(Math.floor(x / ASLEEP_RATIO), Math.floor(y / ASLEEP_RATIO), false);
        this._globalDirty = true;
    }

    public get(x: number, y: number): T {
        return this.cells.get(x, y) ?? this.options.defaultState;
    }

    public update(x: number, y: number, callback: (prev: Readonly<T>) => T) {
        this.actions.push([x, y, callback]);
    }

    public addEffect(effect: SimulationEffect<T>) {
        if (effect.done()) return;

        this.effects.push(effect);
        for (const [x, y] of effect.affectedCells()) {
            this.effectGrid.get(x, y)?.push(effect);
            this.asleep.set(Math.floor(x / ASLEEP_RATIO), Math.floor(y / ASLEEP_RATIO), false);
        }

        this._globalDirty = true;
    }

    public clearEffects(x: number, y: number) {
        const effects = this.effectGrid.get(x, y);
        if (effects) effects.length = 0;

        this._globalDirty = true;
    }

    public getEffects(x: number, y: number): readonly SimulationEffect<T>[] {
        return this.effectGrid.get(x, y) ?? [];
    }

    public tick() {
        this._globalDirty = true;

        // Increment all effects
        for (const effect of this.effects) {
            effect.nextTick();
        }
        for (let i = 0; i < this.effects.length; i++) {
            if (this.effects[i].done()) {
                // PERF: swap_remove
                this.effects.splice(i, 1);
                i--;
            }
        }

        iterAwake(this.effectGrid, this.asleep, ASLEEP_RATIO, (effects, x, y) => {
            let stayAwake = this.effects.length > 0;
            // Mark cells with effects as dirty and remove effects that are done
            if (this.effects.length > 0) this.dirty.set(x, y, true);
            for (let i = 0; i < this.effects.length; i++) {
                if (this.effects[i].done()) {
                    // PERF: swap_remove
                    this.effects.splice(i, 1);
                    i--;
                }
            }

            // Run onTick on the existing cells
            const sleep = this._onTick(this.cells.get(x, y)!, x, y, this);
            if (sleep !== SLEEP) stayAwake = true;

            return stayAwake;
        }, this.options.performance?.wakeRadius ?? 0, true);

        // Resize the simulation area if needed
        const newBounds = getSimulationBounds(this.options.simulationBounds);
        if (!rectsEqual(newBounds, this.cells.getRect())) {
            this.resize(newBounds);
        }

        // Trigger the updates
        for (const [x, y, update] of this.actions) {
            let prev = this.cells.get(x, y);
            if (prev !== null) {
                this.cells.set(x, y, update(prev));
                this.dirty.set(x, y, true);
                this.asleep.set(Math.floor(x / ASLEEP_RATIO), Math.floor(y / ASLEEP_RATIO), false);
            }
        }

        this.actions.length = 0;
        this.currentTick += 1;
    }

    getTick(): number {
        return this.currentTick;
    }

    render(canvas: HTMLCanvasElement, font: Font, rectOpt?: Rect, _rerender?: boolean) {
        const rect = rectOpt ?? this.cells.getRect();

        if (this._previousCanvas === null) {
            // First render
            this._previousCanvas = canvas;
            this._previousRect = rect;
            this.renderDirty(canvas, font, rect);

            if (this.options.debug?.sleep) {
                this.debugSleep(canvas, font, rect);
            }
            return;
        }

        let rerender = _rerender ?? false;
        if (!rectsEqual(this._previousRect, rect)) {
            this._previousRect = rect;
            rerender = true;
        }
        if (canvas !== this._previousCanvas) {
            rerender = true;
            this._previousCanvas = canvas;
        }

        if (rerender || this.options.debug?.alwaysRender) {
            if (this.options.debug?.logPerformance) performance.mark("[ascii-cell] Rerender");
            this.renderAll(canvas, font, rect);
        } else if (this._globalDirty) {
            this.renderDirty(canvas, font, rect);
        }

        if (this.options.debug?.sleep) {
            this.debugSleep(canvas, font, rect);
        }
    }

    private debugSleep(
        canvas: HTMLCanvasElement,
        font: Font,
        rect: Rect,
    ) {
        const ctx = canvas.getContext("2d")!;
        for (let gy = this.asleep.top; gy < this.asleep.top + this.asleep.height; gy++) {
            for (let gx = this.asleep.left; gx < this.asleep.left + this.asleep.width; gx++) {
                ctx.globalCompositeOperation = "source-over";
                if (this.asleep.get(gx, gy)) {
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

    private renderDirty(
        canvas: HTMLCanvasElement,
        font: Font,
        rect: Rect,
    ) {
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get 2D context");

        let rendered = 0;

        for (let y = rect.y; y < rect.y + rect.height; y++) {
            for (let x = rect.x; x < rect.x + rect.width; x++) {
                if (!this.dirty.get(x, y)) continue;
                rendered += 1;
                const effects = this.effectGrid.get(x, y)!;
                this.dirty.set(x, y, false);

                this.renderSingle(ctx, x, y, font, rect, effects);
            }
        }

        if (this.options.debug?.logPerformance) performance.mark(`Rendered: ${rendered}`);
        this._globalDirty = false;
    }


    /// Requires that `(x, y)` be in bounds of `cells`
    private renderSingle(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        font: Font,
        rect: Rect,
        effects: SimulationEffect<T>[],
    ) {
        const state = this.cells.get(x, y)!;

        const processed: ProcessedCell<T> = {
            state,
            x,
            y,
            glyph: this.options.getChar(state, x, y),
            fg: this.options.getColor(state, x, y),
            bg: this.options.getBackground(state, x, y)
        };

        for (let i = 0; i < effects.length; i++) {
            if (effects[i].done()) {
                effects.splice(i, 1);
                i--;
                continue;
            }
            effects[i].tweakCell(processed, this);
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

    private renderAll(
        canvas: HTMLCanvasElement,
        font: Font,
        rect: Rect,
    ) {
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get 2D context");

        for (let y = rect.y; y < rect.y + rect.height; y++) {
            for (let x = rect.x; x < rect.x + rect.width; x++) {
                if (this.dirty.set(x, y, false)) {
                    const effects = this.effectGrid.get(x, y)!;
                    this.renderSingle(ctx, x, y, font, rect, effects);
                }
            }
        }
        this._globalDirty = false;
    }
}
export default Simulation;

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
