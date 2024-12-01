import Base64 from "base64-js";
import { type Color, colorToString } from "./color.js";

/**
 * An interface used to dictate how glyphs should be rendered on screen.
 *
 * This is notably implemented by `PixelFont`.
 */
export interface Font {
    charWidth(): number;
    charHeight(): number;

    drawChar(
        ctx: CanvasRenderingContext2D,
        glyph: string,
        x: number,
        y: number,
        fg: Color,
        bg: Color,
    ): void;
};

export type PixelFontHeightMode = "descender" | "height";

/**
 * A glyph renderer designed for pixel fonts.
 *
 * This uses the format of [Online Pixel Font Creator](https://github.com/adri326/online-pixel-font-creator).
 */
export class PixelFont implements Font {
    private canvases: Map<string, HTMLCanvasElement>;
    /// Base64-encoded values for the different glyphs
    private pixels: Map<string, string>;
    private width: number;
    private height: number;
    private yOffset: number;

    constructor(pfs: string, heightMode: PixelFontHeightMode = "height") {
        const lines = pfs.split("\n");
        const metrics = lines[3]?.split?.(":") ?? [];
        if (metrics.length != 8 || !metrics.every(x => !Number.isNaN(+x))) {
            throw new Error("Invalid .pfs file: invalid metrics ('" + lines[3] + "')");
        }
        const [width, height, baseline, ascend, descend, _spacing, _emSize] = metrics.map(x => +x);
        this.width = width;
        if (heightMode === "descender") {
            this.height = ascend - descend;
            this.yOffset = baseline - ascend;
        } else {
            this.height = height;
            this.yOffset = 0;
        }

        const spaceGlyph = document.createElement("canvas");
        spaceGlyph.width = this.width;
        spaceGlyph.height = this.height;

        this.pixels = new Map(lines.slice(4).map(line => {
            const [lhs, rhs] = line.split(":");
            if (Number.isNaN(lhs)) {
                throw new Error(`Invalid glyph codepoint: ${lhs}`);
            }
            const codepoint = Number.parseInt(lhs);

            return [to_utf16(codepoint), rhs];
        }));

        this.canvases = new Map([[" ", spaceGlyph]]);
    }

    charWidth(): number {
        return this.width;
    }

    charHeight(): number {
        return this.height;
    }

    drawChar(
        ctx: CanvasRenderingContext2D,
        glyph: string,
        x: number,
        y: number,
        fg: Color,
        bg: Color,
    ): void {
        let glyphCanvas = this.canvases.get(glyph);
        if (!glyphCanvas) {
            const pixels = this.pixels.get(glyph);
            if (!pixels) {
                console.error(`Undefined glyph: '${glyph}'`);
                return;
            }

            glyphCanvas = document.createElement("canvas");
            const glyphCtx = glyphCanvas.getContext("2d");
            if (!glyphCtx) throw new Error("Could not get 2D context for glyph");
            glyphCtx.fillStyle = "white";
            glyphCanvas.width = this.width;
            glyphCanvas.height = this.height;

            const buffer = Base64.toByteArray(pixels);
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    let index = x + (y + this.yOffset) * this.width;
                    let pixel = (buffer[Math.floor(index / 8)] >> (7 - index % 8)) & 0b1;

                    if (!pixel) continue;

                    glyphCtx.fillRect(x, y, 1, 1);
                }
            }

            this.canvases.set(glyph, glyphCanvas);
        }

        const sx = x * this.width;
        const sy = y * this.height;

        if (glyph === " ") {
            if (bg[3] ?? 1.0) {
                ctx.globalCompositeOperation = "source-over";
                ctx.fillStyle = colorToString(bg);
                ctx.fillRect(sx, sy, this.width, this.height);
            }
        } else if (glyph === "\u{2588}") {
            ctx.globalCompositeOperation = "source-over";
            ctx.fillStyle = colorToString(fg);
            ctx.fillRect(sx, sy, this.width, this.height);
        } else {
            ctx.clearRect(sx, sy, this.width, this.height);
            ctx.imageSmoothingEnabled = false;
            if (bg[3] ?? 1.0) {
                // Fill in the background
                ctx.globalCompositeOperation = "source-over";
                ctx.fillStyle = colorToString(bg);
                ctx.fillRect(sx, sy, this.width, this.height);
                // Poke the glyph out
                ctx.globalCompositeOperation = "destination-out";
                ctx.drawImage(glyphCanvas, sx, sy);
                // Put the foreground behind the glyph
                ctx.globalCompositeOperation = "destination-over";
                ctx.fillStyle = colorToString(fg);
                ctx.fillRect(sx, sy, this.width, this.height);
            } else {
                // No background, so we directly draw the glyph
                ctx.globalCompositeOperation = "source-over";
                ctx.drawImage(glyphCanvas, sx, sy);
                // Multiply it with the foreground color
                ctx.globalCompositeOperation = "source-atop";
                ctx.fillStyle = colorToString(fg);
                ctx.fillRect(sx, sy, this.width, this.height);
            }
        }
    }
}

function to_utf16(codepoint: number): string {
    if (codepoint > 0xFFFF) {
        let high = Math.floor((codepoint - 0x10000) / 0x400) + 0xD800;
        let low = (codepoint - 0x10000) % 0x400 + 0xDC00;
        return String.fromCharCode(high, low);
    } else {
        return String.fromCharCode(codepoint);
    }
}
