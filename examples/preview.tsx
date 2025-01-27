import { render } from 'solid-js/web';
import { PixelFont } from '../src/font.js';
import { PixelPerfectCanvas } from "@shadryx/pptk/solid";
import classes from "./preview.module.css";
import Simulation from '../src/simulation.js';

// If you wish to put your WIP simulation in a different file,
// simply change the line below so that it matches with its name.
import { GOLSimulation as SimDefinition } from './gol-simulation.js';

const Font = await fetch("./WaraleFont-Medium.pfs").then(res => res.text());

function App() {
    const font = new PixelFont(Font);
    let canvas: HTMLCanvasElement | null = null;

    function getBounds() {
        return {
            x: 0,
            y: 0,
            width: Math.ceil((canvas?.width ?? 0) / font.charWidth()),
            height: Math.ceil((canvas?.height ?? 0) / font.charHeight()),
        }
    }

    const sim = new Simulation({
        ...SimDefinition,
        simulationBounds: () => {
            let bounds = getBounds();
            return {
                x: bounds.x - 20,
                y: bounds.y - 20,
                width: bounds.width + 40,
                height: bounds.height + 40,
            };
        },
    });

    let attached = false;

    let prevTick = performance.now();
    function render(rerender: boolean = false) {
        if (!canvas) return;
        sim.render(canvas, font, getBounds(), rerender);
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
