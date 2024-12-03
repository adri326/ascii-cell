
// Taken from `merge-char` (MIT, https://www.npmjs.com/package/merge-char, copyright Sam Vervaeck).
// Fixed and extended.
//
// Format: [top, left, bottom, right]
// 0 -> absent
// 1 -> light
// 2 -> bold
// 3 -> double
const BOX_DRAWINGS: [number, number, number, number, string][] = [
    [1, 0, 0, 0, '╵'],
    [0, 1, 0, 0, '╴'],
    [0, 0, 1, 0, '╷'],
    [0, 0, 0, 1, '╶'],
    [1, 0, 1, 0, '│'],
    [2, 0, 2, 0, '┃'],
    [0, 2, 0, 2, '━'],
    [0, 1, 0, 1, '─'],
    [2, 0, 0, 0, '╹'],
    [0, 2, 0, 0, '╸'],
    [0, 0, 2, 0, '╻'],
    [0, 0, 0, 2, '╺'],
    [0, 0, 1, 1, '┌'],
    [0, 0, 1, 2, '┍'],
    [0, 0, 2, 1, '┎'],
    [0, 0, 2, 2, '┏'],
    [0, 1, 1, 0, '┐'],
    [0, 2, 1, 0, '┑'],
    [0, 1, 2, 0, '┒'],
    [0, 2, 2, 0, '┓'],
    [1, 0, 0, 1, '└'],
    [1, 0, 0, 2, '┕'],
    [2, 0, 0, 1, '┖'],
    [2, 0, 0, 2, '┗'],
    [1, 1, 0, 0, '┘'],
    [1, 2, 0, 0, '┙'],
    [2, 1, 0, 0, '┚'],
    [2, 2, 0, 0, '┛'],
    [1, 0, 1, 1, '├'],
    [1, 0, 1, 2, '┝'],
    [2, 0, 1, 1, '┞'],
    [1, 0, 2, 1, '┟'],
    [2, 0, 2, 1, '┠'],
    [2, 0, 1, 2, '┡'],
    [1, 0, 2, 2, '┢'],
    [2, 0, 2, 2, '┣'],
    [1, 1, 1, 0, '┤'],
    [1, 2, 1, 0, '┥'],
    [2, 1, 1, 0, '┦'],
    [1, 1, 2, 0, '┧'],
    [2, 1, 2, 0, '┨'],
    [2, 2, 1, 0, '┩'],
    [1, 2, 2, 0, '┪'],
    [2, 2, 2, 0, '┫'],
    [0, 1, 1, 1, '┬'],
    [0, 2, 1, 1, '┭'],
    [0, 1, 1, 2, '┮'],
    [0, 2, 1, 2, '┯'],
    [0, 1, 2, 1, '┰'],
    [0, 2, 2, 1, '┱'],
    [0, 1, 2, 2, '┲'],
    [0, 2, 2, 2, '┳'],
    [1, 1, 0, 1, '┴'],
    [1, 2, 0, 1, '┵'],
    [1, 1, 0, 2, '┶'],
    [1, 2, 0, 2, '┷'],
    [2, 1, 0, 1, '┸'],
    [2, 2, 0, 1, '┹'],
    [1, 2, 0, 2, '┺'],
    [2, 2, 0, 2, '┻'],
    [1, 1, 1, 1, '┼'],
    [1, 2, 1, 1, '┽'],
    [1, 1, 1, 2, '┾'],
    [1, 2, 1, 2, '┿'],
    [2, 1, 1, 1, '╀'],
    [1, 1, 2, 1, '╁'],
    [2, 1, 2, 1, '╂'],
    [2, 2, 1, 1, '╃'],
    [2, 1, 1, 2, '╄'],
    [1, 2, 2, 1, '╅'],
    [1, 1, 2, 2, '╆'],
    [2, 2, 1, 2, '╇'],
    [1, 2, 2, 2, '╈'],
    [2, 2, 2, 1, '╉'],
    [2, 1, 2, 2, '╊'],
    [2, 2, 2, 2, '╋'],
    [0, 3, 0, 3, '═'],
    [3, 0, 3, 0, '║'],
    [0, 0, 1, 3, '╒'],
    [0, 0, 3, 1, '╓'],
    [0, 0, 3, 3, '╔'],
    [0, 3, 1, 0, '╕'],
    [0, 1, 3, 0, '╖'],
    [0, 3, 3, 0, '╗'],
    [1, 0, 0, 3, '╘'],
    [3, 0, 0, 1, '╙'],
    [3, 0, 0, 3, '╚'],
    [1, 3, 0, 0, '╛'],
    [3, 1, 0, 0, '╜'],
    [3, 3, 0, 0, '╝'],
    [1, 0, 1, 3, '╞'],
    [3, 0, 3, 1, '╟'],
    [3, 0, 3, 3, '╠'],
    [1, 3, 1, 0, '╡'],
    [3, 1, 3, 0, '╢'],
    [3, 3, 3, 0, '╣'],
    [0, 3, 1, 3, '╤'],
    [0, 1, 3, 1, '╥'],
    [0, 3, 3, 3, '╦'],
    [1, 3, 0, 3, '╧'],
    [3, 1, 0, 1, '╨'],
    [3, 3, 0, 3, '╩'],
    [1, 3, 1, 3, '╪'],
    [3, 1, 3, 1, '╫'],
    [3, 3, 3, 3, '╬'],
    [0, 2, 0, 0, "╸"],
    [2, 0, 0, 0, "╹"],
    [0, 0, 0, 2, "╺"],
    [0, 0, 2, 0, "╻"],
    [0, 1, 0, 2, "╼"],
    [1, 0, 2, 0, "╽"],
    [0, 2, 0, 1, "╾"],
    [2, 0, 1, 0, "╿"],
];

export type WireKind = 0 | 1 | 2 | 3;
export type WireOptions = {
    top?: WireKind | undefined,
    left?: WireKind | undefined,
    bottom?: WireKind | undefined,
    right?: WireKind | undefined,
};
export type WireArray = [top: WireKind, left: WireKind, bottom: WireKind, right: WireKind];

export const NO_WIRE: WireKind = 0;
export const LIGHT_WIRE: WireKind = 1;
export const HEAVY_WIRE: WireKind = 2;
export const DOUBLE_WIRE: WireKind = 3;

/**
 * A helper function for rendering wire-like cells.
 */
export function wire(options: WireOptions | WireArray): string | null {
    let definition: WireKind[];
    if (Array.isArray(options)) {
        definition = options;
    } else {
        definition = [
            options.top ?? 0,
            options.left ?? 0,
            options.bottom ?? 0,
            options.right ?? 0,
        ];
    }

    return BOX_DRAWINGS.find((tuple) => {
        for (let i = 0; i < 4; i++) {
            if (tuple[i] !== definition[i]) return false;
        }
        return true;
    })?.[4] ?? null;
}
