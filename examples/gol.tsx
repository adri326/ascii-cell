import { render } from 'solid-js/web';
import simulation from '../src/simulation.js';
import { PixelFont } from '../src/font.js';
import { PixelPerfectCanvas } from "@shadryx/pptk/solid";
import classes from "./gol.module.css";
import { GOLSimulation } from './gol-simulation.js';

const Moxie6 = await fetch("./WaraleFont-Medium.pfs").then(res => res.text());

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

    const sim = simulation({
        ...GOLSimulation,
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
