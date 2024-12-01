import { FadeEffect } from "../src/effect.js";
import { SLEEP, type SimulationOptions } from "../src/simulation.js";

type State = {
    alive: boolean,
    char: string
};

const NEIGHBORHOOD = [-1, 0, 1].flatMap(
    (dy): [dx: number, dy: number][] => [[dy, -1], [dy, 0], [dy, 1]]
).filter(([dx, dy]) => dx !== 0 || dy !== 0);

export const GOLSimulation: SimulationOptions<State> = {
    defaultState: {
        alive: false,
        char: " ",
    },
    wakeRadius: 1,
    getChar(state) {
        return state.char;
    },
    getColor(state) {
        return state.alive ? [0.008, 0.008, 0.008] : [0.02, 0.02, 0.02];
    },
    getBackground(state) {
        return state.alive ? [0.8, 0.8, 0.8] : [0.0, 0.0, 0.0, 0.0];
    },
    onInit(handle) {
        const sx = 10;
        const sy = 10;
        handle.set(0 + sx, 3 + sy, newCell());
        handle.set(1 + sx, 3 + sy, newCell());
        handle.set(1 + sx, 4 + sy, newCell());
        handle.set(2 + sx, 3 + sy, newCell());
        handle.set(2 + sx, 2 + sy, newCell());
        handle.set(2 + sx, 1 + sy, newCell());
        handle.set(3 + sx, 2 + sy, newCell());
        handle.set(3 + sx, 1 + sy, newCell());
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
            handle.addEffect(new FadeEffect(x, y, {
                fg: [0.5, 0.5, 0.5],
                bg: [0.01, 0.01, 0.01],
                length: 8,
            }, FadeEffect.QUADRATIC));
        } else if (!state.alive && neighbors === 3) {
            handle.update(x, y, (s) => {
                if (s.char === ' ') return newCell();
                else return {
                    ...s,
                    alive: true
                };
            });
            handle.clearEffects(x, y);
        }

        if (!state.alive && neighbors === 0) return SLEEP;
    },
};

function newCell(): State {
    let alphabet = "0123456789+-/=*?!≠±$£≤≥";
    return {
        alive: true,
        char: alphabet[Math.floor(Math.random() * alphabet.length)],
    }
}
