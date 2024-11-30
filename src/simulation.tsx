import type { Font } from "./font.js";

export type CellCompatible = number | boolean | object;

export type Options<T extends CellCompatible> = {
    defaultState: T,
    font: Font,
    getChar(state: T, x: number, y: number): string,
    getColor(state: T, x: number, y: number): string,
    getBackground(state: T, x: number, y: number): string,
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
    const actions: [x: number, y: number, callback: (prev: Readonly<T>) => T][] = [];

    let previousCanvas: HTMLCanvasElement | null = null;
    let previousRect: Rect | null = null;

    function resize(newBounds: Rect) {
        cells = new Grid(newBounds, cells, options.defaultState);
        dirty = new Grid(newBounds, dirty, true);
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
        tick() {
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
                renderAll(cells, dirty, canvas, options, rect);
            } else {
                renderDirty(cells, dirty, canvas, options, rect);
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
        blitFrom: Grid<T>, fillDefault: T
    );
    constructor(
        rect: Rect,
        fill: T | ((x: number, y: number) => T) | Grid<T>,
        fillDefault?: T
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
                return fill.get(
                    i % rect.width + rect.x,
                    Math.floor(i / rect.width) + rect.y
                ) ?? fillDefault!;
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
    rect: Rect
) {
    const state = cells.get(x, y)!;

    options.font.drawChar(
        ctx,
        options.getChar(state, x, y),
        x - rect.x,
        y - rect.y,
        options.getColor(state, x, y),
        options.getBackground(state, x, y),
    );
}

function renderAll<T extends CellCompatible>(
    cells: Grid<T>,
    dirty: Grid<boolean>,
    canvas: HTMLCanvasElement,
    options: Options<T>,
    rect: Rect
) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");

    for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) {
            if (dirty.set(x, y, false)) {
                renderSingle(ctx, cells, x, y, options, rect);
            }
        }
    }
}

function renderDirty<T extends CellCompatible>(
    cells: Grid<T>,
    dirty: Grid<boolean>,
    canvas: HTMLCanvasElement,
    options: Options<T>,
    rect: Rect
) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");

    for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) {
            if (!dirty.get(x, y)) continue;
            dirty.set(x, y, false);

            renderSingle(ctx, cells, x, y, options, rect);
        }
    }
}
