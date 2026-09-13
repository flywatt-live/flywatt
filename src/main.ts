// Boot: capabilities, copy, simulation bridge, then the scene, panels and page.
import { detect } from './caps.js';
import { SimBridge } from './sim/bridge.js';
import { mountHud } from './ui/hud.js';
import { mountLum } from './ui/lum.js';
import { mountWire } from './panels/wire.js';
import { mountCircuit } from './ui/circuit.js';
import { mountArithmetic } from './ui/arithmetic.js';
import { mountRecord } from './panels/record.js';
import { mountProvenance } from './ui/provenance.js';
import { mountFooter } from './ui/footer.js';
import { mountRail } from './ui/rail.js';
import { mountScroll } from './ui/scroll.js';
import { mountFallback } from './ui/fallback.js';
import { mountHotspots } from './ui/hotspots.js';
import { mountMinis } from './panels/mini.js';
import { hero } from './copy/en.js';
import type { Apparatus } from './scene/apparatus.js';

const params = new URLSearchParams(location.search);

if (params.get('og') === '1') {
  // dev-only capture page for the OG image and the poster
  import('./tools/og.js').then((mod) => mod.mountOg());
} else {
  boot();
}

function boot() {
  const caps = detect();
  document.documentElement.dataset.poster = String(caps.poster);
  document.documentElement.dataset.reduced = String(caps.reducedMotion);

  document.getElementById('tagline')!.textContent = hero.tagline;
  document.getElementById('tagline-sub')!.textContent = hero.sub;
  document.getElementById('hero-hint')!.textContent = hero.hint;
  const bridge = new SimBridge();
  const hud = mountHud(bridge);
  mountLum(bridge);
  mountFooter(bridge);
  mountRail();

  let apparatus: Apparatus | null = null;
  if (!caps.poster) {
    import('./scene/apparatus.js').then(async ({ createApparatus }) => {
      apparatus = await createApparatus(document.getElementById('scene') as HTMLCanvasElement, bridge);
      hud.attachApparatus(apparatus);
      mountFooter(bridge, apparatus);
      mountHotspots(bridge, apparatus);
    });
  } else {
    mountFallback();
  }

  bridge.load('/data/').then(() => {
    mountWire(bridge);
    mountMinis(bridge);
    mountCircuit(bridge);
    mountArithmetic(bridge);
    mountRecord(bridge);
    mountProvenance(bridge);
    mountScroll(caps);
  });

  bridge.on('ready', () => {
    bridge.start();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) bridge.pause();
    else bridge.resume();
  });

  // exposed for inspection in the console; the page never reads from here
  (window as unknown as { flywatt: unknown }).flywatt = { bridge, caps, get apparatus() { return apparatus; } };
}
