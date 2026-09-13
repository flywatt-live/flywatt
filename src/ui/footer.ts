// Footer: the contract plate (click to copy, the meter flicks in reply), and the links.
import type { SimBridge } from '../sim/bridge.js';
import type { Apparatus } from '../scene/apparatus.js';
import { footer, site } from '../copy/en.js';

let mounted = false;
let apparatusRef: Apparatus | null = null;

export function mountFooter(_bridge: SimBridge, apparatus?: Apparatus) {
  if (apparatus) apparatusRef = apparatus;
  if (mounted) return;
  mounted = true;
  const btn = document.getElementById('contract') as HTMLButtonElement;
  const links = document.getElementById('footer-links')!;
  const value = footer.contractValue;
  btn.innerHTML = `<span class="plate-key">${footer.contract}</span><span class="plate-value readout">${value}</span>`;
  btn.setAttribute('aria-label', `${footer.contract} ${value}, copy`);
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(footer.contractValue);
    } catch {
      /* clipboard unavailable: the value is visible anyway */
    }
    apparatusRef?.kickNeedle();
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 900);
  });

  const items: [string, string][] = [
    [footer.dex, footer.dexUrl],
    [footer.x, site.xUrl],
  ];
  if (footer.sourceUrl) items.push([footer.source, footer.sourceUrl]);
  links.replaceChildren(
    ...items.map(([name, url]) => {
      if (!url) {
        const s = document.createElement('span');
        s.className = 'footer-link soon';
        s.innerHTML = `${name} <span class="readout">${footer.soon}</span>`;
        return s;
      }
      const a = document.createElement('a');
      a.className = 'footer-link';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = name;
      return a;
    }),
  );
}
