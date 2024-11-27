import { createEffect, createSignal, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import simulation from '../src/simulation.jsx';

const KIND_DEAD = 0;
const KIND_ALIVE = 1;

function App() {
    const sim = simulation<0 | 1>({
        defaultState: KIND_DEAD,
        getChar(state) {
            if (state === 0) return " ";
            else return "\u{2588}";
        },
        getColor(state) {
            return "black";
        },
        getBackground(state) {
            return "white";
        }
    });

    let canvas: HTMLCanvasElement;

    onMount(() => {
        sim.render(canvas);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "green";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        sim.set(1, 1, KIND_ALIVE);
        sim.set(2, 2, KIND_ALIVE);
        sim.set(3, 2, KIND_ALIVE);
        sim.set(3, 1, KIND_ALIVE);
        sim.set(3, 0, KIND_ALIVE);

        sim.render(canvas);
    });

    return <div>
        <canvas width={20 * 8} height={20 * 8} ref={(c) => canvas = c}></canvas>

    </div>;
}

render(App, document.body);
