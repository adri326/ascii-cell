import { createEffect, createSignal, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import simulation from '../src/simulation.jsx';
import { PixelFont } from '../src/font.jsx';

const Moxie6 = await fetch("./WaraleFont-Medium.pfs").then(res => res.text());

type State = {
    alive: boolean,
    char: string
};

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
            return state.alive ? "black" : "lightgray";
        },
        getBackground(state) {
            return "white";
        }
    });

    function newCell(): State {
        let alphabet = "abcdefghijklmnopqrstuvwxyz";
        alphabet = alphabet + alphabet.toUpperCase();
        return {
            alive: true,
            char: alphabet[Math.floor(Math.random() * alphabet.length)],
        }
    }

    let canvas: HTMLCanvasElement;

    onMount(() => {
        sim.set(1, 1, newCell());
        sim.set(2, 2, newCell());
        sim.set(3, 2, newCell());
        sim.set(3, 1, newCell());
        sim.set(3, 0, newCell());

        sim.render(canvas);
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
