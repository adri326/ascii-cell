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

export type Options<T> = {
    defaultState: T,
    getChar: (state: T) => string,
    getColor: (state: T) => string,
    getBackground: (state: T) => string,
};

function renderChar(ctx: CanvasRenderingContext2D, char: string, color: string, background: string, x: number, y: number) {
    const sx = x * 8;
    const sy = y * 8;
    const char_width = 8;
    const char_height = 8;

    ctx.clearRect(sx, sy, char_width, char_height);
    if (char !== " ") {
        ctx.fillStyle = color;
        ctx.fillRect(sx + 1, sy + 1, char_width - 2, char_height - 2);
    }
}

export default function simulation<T extends CellCompatible>(options: Options<T>) {
    const cells = new Grid(0, 0, 20, 20, options.defaultState);
    const dirty = new Grid<boolean>(0, 0, 20, 20, true);

    return {
        set(x: number, y: number, state: T) {
            if (!cells.set(x, y, state)) {
                throw new Error("resizing not yet implemented");
            }
            dirty.set(x, y, true);
        },
        render(canvas: HTMLCanvasElement) {
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Could not get 2D context");


            for (let y = cells.top; y < cells.top + cells.height; y++) {
                for (let x = cells.left; x < cells.left + cells.width; x++) {
                    if (dirty.get(x, y)) {
                        dirty.set(x, y, false);
                        const state = cells.get(x, y)!;
                        renderChar(ctx, options.getChar(state), options.getColor(state), options.getBackground(state), x, y);
                    }
                }
            }
        }
    };
}
