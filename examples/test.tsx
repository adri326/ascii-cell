import { createEffect, createSignal, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import simulation from '../src/simulation.jsx';
import { PixelFont } from '../src/font.jsx';

const Moxie6 = await fetch("./WaraleFont-Medium.pfs").then(res => res.text());

type State = {
    alive: boolean,
    char: string
};

const NEIGHBORHOOD = [-1, 0, 1].flatMap(
    (dy): [dx: number, dy: number][] => [[dy, -1], [dy, 0], [dy, 1]]
).filter(([dx, dy]) => dx !== 0 || dy !== 0);

function App() {
    const sim = simulation<State>({
        defaultState: {
            alive: false,
            char: " ",
        },
        font: new PixelFont(Moxie6),
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
            let neighbors = NEIGHBORHOOD.map(
                ([dx, dy]) => handle.get(x + dx, y + dy)?.alive || false
            ).reduce((acc, curr) => acc + Number(curr), 0);

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
        }
    });

    function newCell(): State {
        let alphabet = "0123456789+-/=*?!≠±$£≤≥";
        return {
            alive: true,
            char: alphabet[Math.floor(Math.random() * alphabet.length)],
        }
    }

    let canvas: HTMLCanvasElement;

    function onFrame(_elapsed: number) {
        sim.tick();
        sim.render(canvas);
        setTimeout(() => {
            window.requestAnimationFrame(onFrame);
        }, 1000);
    }

    onMount(() => {
        sim.set(0, 3, newCell());
        sim.set(1, 3, newCell());
        sim.set(1, 4, newCell());
        sim.set(2, 3, newCell());
        sim.set(2, 2, newCell());
        sim.set(2, 1, newCell());
        sim.set(3, 2, newCell());
        sim.set(3, 1, newCell());

        sim.render(canvas);

        window.requestAnimationFrame(onFrame);
    });

    return <div>
        <canvas
            style={{
                "image-rendering": "pixelated"
            }}
            width={20 * 6}
            height={20 * 6}
            ref={(c) => canvas = c}
        ></canvas>
    </div>;
}

render(App, document.body);
