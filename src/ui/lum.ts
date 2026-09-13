// Page luminance follows the bulb: the CSS --lum variable is the simulation's gain.
import type { SimBridge } from '../sim/bridge.js';

export function mountLum(bridge: SimBridge) {
  const root = document.documentElement;
  let last = -1;
  bridge.on('frame', (f) => {
    if (Math.abs(f.gain - last) < 0.004) return;
    last = f.gain;
    root.style.setProperty('--lum', f.gain.toFixed(3));
  });
}
