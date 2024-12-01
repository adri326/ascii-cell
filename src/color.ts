/** An RGB(A) color in linear space.
 *
 * If you are used to colors in sRGB space, consider using `colorFromHex` for defining colors.
 */
export type Color = Readonly<[r: number, g: number, b: number, a?: number]>;

const EPSILON = 0.00001;

/** Converts a single channel from sRGB space to linear space */
function srgbToLinear(value: number): number {
    if (value > 0.04045) return Math.pow((value + 0.055) / 1.055, 2.4);
    else return value / 12.92;
}

/** Converts a single channel from linear space to sRGB space */
function linearToSrgb(value: number): number {
    if (value > 1.0) value = 1.0;
    if (value < 0.0) value = 0.0;

    if (value > 0.0031308) return (1 + 0.055) * Math.pow(value, 1 / 2.4) - 0.055;
    else return value * 12.92;
}

/** Parses a hexadecimal color down into a `Color`. */
export function colorFromHex(hex: string): Color {
    hex = hex.toLowerCase();
    if (!hex.startsWith("#")) return [0, 0, 0];
    for (let i = 1; i < hex.length; i++) {
        if ((hex[i] < '0' || hex[i] > '9') && (hex[i] < 'a' || hex[i] > 'f')) {
            return [0, 0, 0];
        }
    }

    if (hex.length === 4 || hex.length === 5) {
        // SAFETY: the string only contains 3 or 4 hex digits
        return hex.slice(1)
            .split("")
            .map(
                digit => srgbToLinear(Number.parseInt(digit, 16) / 15)
            ) as readonly number[] as Color;
    } else if (hex.length === 7 || hex.length === 9) {
        let r = srgbToLinear(Number.parseInt(hex.slice(1, 3)) / 255);
        let g = srgbToLinear(Number.parseInt(hex.slice(3, 5)) / 255);
        let b = srgbToLinear(Number.parseInt(hex.slice(5, 7)) / 255);
        if (hex.length === 7) return [r, g, b];

        let a = Number.parseInt(hex.slice(7, 9)) / 255;
        return [r, g, b, a];
    } else {
        return [0, 0, 0];
    }
}

/** Converts a color into a string to be passed to the canvas API. */
export function colorToString(color: Color): string {
    const r = linearToSrgb(color[0]) * 255;
    const g = linearToSrgb(color[1]) * 255;
    const b = linearToSrgb(color[2]) * 255;

    if (color.length === 3) {
        return `rgb(${r}, ${g}, ${b})`;
    } else if (color.length === 4) {
        return `rgba(${r}, ${g}, ${b}, ${linearToSrgb(color[3]!) * 255})`;
    } else {
        return "black";
    }
}

/** Mixes between `left` and `right` by `amount`. If `amount == 0.0`, then `left` is returned,
 * and vice-versa.
 */
export function mixColor(left: Color, right: Color, amount: number): Color {
    const r = left[0] * (1.0 - amount) + right[0] * amount;
    const g = left[1] * (1.0 - amount) + right[1] * amount;
    const b = left[2] * (1.0 - amount) + right[2] * amount;
    const a = (left[3] ?? 1.0) * (1.0 - amount) + (right[3] ?? 1.0) * amount;

    if (left[3] ?? 1.0 <= EPSILON) {
        return [right[0], right[1], right[2], a];
    } else if (right[3] ?? 1.0 <= EPSILON) {
        return [left[0], left[1], left[2], a];
    }

    return [r, g, b, a];
}
