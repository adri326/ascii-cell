import type { Font } from "./font.js";

class Grid<T extends CellCompatible> {
    private _width: number;
    private _height: number;
    private _left: number;
    private _top: number;
    private data: T[];

    constructor(
        left: number, top: number, width: number, height: number,
        fill: T | ((x: number, y: number) => T)
    );
    constructor(
        left: number, top: number, width: number, height: number,
        blitFrom: Grid<T>, fillDefault: T
    );
    constructor(
        left: number,
        top: number,
        width: number,
        height: number,
        fill: T | ((x: number, y: number) => T) | Grid<T>,
        fillDefault?: T
    ) {
        this._left = left;
        this._top = top;
        this._width = width;
        this._height = height;

        if (typeof fill == "function") {
            this.data = new Array(width * height).fill(null).map((_, i) => {
                return fill(i % width + left, Math.floor(i / width) + top);
            });
        } else if (fill instanceof Grid) {
            this.data = new Array(width * height).fill(null).map((_, i) => {
                return fill.get(i % width + left, Math.floor(i / width) + top) ?? fillDefault!;
            });
        } else {
            let x = fill;
            this.data = new Array(width * height).fill(fill);
        }
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

// export default class AsciiCell {
//     constructor() {

//     }

//     render(): JSXElement {
//         return <div>AsciiCell</div>;
//     }
// }

export type CellCompatible = number | boolean | object;

export type Options<T extends CellCompatible> = {
    defaultState: T,
    font: Font,
    getChar(state: T): string,
    getColor(state: T): string,
    getBackground(state: T): string,
    onTick?(state: T, x: number, y: number, handle: SimulationHandle<T>): void,
};

export type SimulationHandle<T extends CellCompatible> = {
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
    render(canvas: HTMLCanvasElement): void;
};

export default function simulation<T extends CellCompatible>(options: Options<T>) {
    const cells = new Grid(0, 0, 20, 20, options.defaultState);
    const dirty = new Grid<boolean>(0, 0, 20, 20, true);
    const actions: [x: number, y: number, callback: (prev: Readonly<T>) => T][] = [];

    const res = {
        set(x: number, y: number, state: T) {
            if (!cells.set(x, y, state)) {
                throw new Error("resizing not yet implemented");
            }
            dirty.set(x, y, true);
        },
        get(x: number, y: number): T | null {
            return cells.get(x, y);
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

            for (const [x, y, update] of actions) {
                let prev = cells.get(x, y);
                if (prev !== null) {
                    cells.set(x, y, update(prev));
                    dirty.set(x, y, true);
                }
            }

            actions.length = 0;
        },
        render(canvas: HTMLCanvasElement) {
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Could not get 2D context");

            for (let y = cells.top; y < cells.top + cells.height; y++) {
                for (let x = cells.left; x < cells.left + cells.width; x++) {
                    if (!dirty.get(x, y)) continue;
                    dirty.set(x, y, false);
                    const state = cells.get(x, y)!;

                    options.font.drawChar(
                        ctx,
                        options.getChar(state),
                        x,
                        y,
                        options.getColor(state),
                        options.getBackground(state),
                    );
                }
            }
        }
    };

    return res;
}
