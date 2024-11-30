import { createEffect, createSignal, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import simulation from '../src/simulation.js';
import { PixelFont } from '../src/font.js';
import { PixelPerfectCanvas } from "@shadryx/pptk/solid";
import classes from "./test.module.css";

const Moxie6 = await fetch("./WaraleFont-Medium.pfs").then(res => res.text());

type State = {
    alive: boolean,
    char: string
};

const NEIGHBORHOOD = [-1, 0, 1].flatMap(
    (dy): [dx: number, dy: number][] => [[dy, -1], [dy, 0], [dy, 1]]
).filter(([dx, dy]) => dx !== 0 || dy !== 0);

function App() {
    const font = new PixelFont(Moxie6);
    let canvas: HTMLCanvasElement | null = null;

    function getBounds() {
        return {
            x: 0,
            y: 0,
            width: Math.ceil((canvas?.width ?? 0) / font.charWidth()),
            height: Math.ceil((canvas?.height ?? 0) / font.charHeight()),
        }
    }

    const sim = simulation<State>({
        defaultState: {
            alive: false,
            char: " ",
        },
        font,
        getChar(state) {
            return state.char;
        },
        getColor(state) {
            return state.alive ? "white" : "lightgray";
        },
        getBackground(state) {
            return state.alive ? "black" : "white";
        },
        onTick(state, x, y, handle) {
            let neighbors = 0;
            for (const [dx, dy] of NEIGHBORHOOD) {
                neighbors += Number(handle.get(x + dx, y + dy)?.alive || false);
            }

            if (state.alive && (neighbors < 2 || neighbors > 3)) {
                handle.update(x, y, (s) => {
                    return {
                        ...s,
                        alive: false,
                    };
                });
            } else if (!state.alive && neighbors === 3) {
                handle.update(x, y, (s) => {
                    if (s.char === ' ') return newCell();
                    else return {
                        ...s,
                        alive: true
                    };
                });
            }
        },
        simulationBounds: () => {
            let bounds = getBounds();
            return {
                x: bounds.x - 20,
                y: bounds.y - 20,
                width: bounds.width + 40,
                height: bounds.height + 40,
            };
        }
    });

    function newCell(): State {
        let alphabet = "0123456789+-/=*?!≠±$£≤≥";
        return {
            alive: true,
            char: alphabet[Math.floor(Math.random() * alphabet.length)],
        }
    }

    let attached = false;

    let prevTick = performance.now();
    function render(rerender: boolean = false) {
        if (!canvas) return;
        sim.render(canvas, getBounds(), rerender);
    }

    function onFrame() {
        if (!canvas) return;
        const now = performance.now();
        if (now - prevTick > 100) {
            sim.tick();
            prevTick = now;
        }

        render();

        if (attached) {
            window.requestAnimationFrame(onFrame);
        }
    }

    const sx = 10;
    const sy = 10;
    sim.set(0 + sx, 3 + sy, newCell());
    sim.set(1 + sx, 3 + sy, newCell());
    sim.set(1 + sx, 4 + sy, newCell());
    sim.set(2 + sx, 3 + sy, newCell());
    sim.set(2 + sx, 2 + sy, newCell());
    sim.set(2 + sx, 1 + sy, newCell());
    sim.set(3 + sx, 2 + sy, newCell());
    sim.set(3 + sx, 1 + sy, newCell());

    return <PixelPerfectCanvas
            onAttach={(c) => {
                attached = true;
                canvas = c;
                onFrame();
            }}
            onDetach={() => {
                attached = false;
            }}
            onResize={(canvas) => {
                render(true);
            }}
            downscale={Math.round(window.devicePixelRatio)}
            class={classes["canvas"]}
        />;
}

render(App, document.body);
