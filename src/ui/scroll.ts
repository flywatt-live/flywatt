// Lenis smooth scroll + one GSAP pin: the wire scrolls horizontally. Nothing else moves.
import type { Caps } from '../caps.js';

export async function mountScroll(caps: Caps) {
  const track = document.getElementById('wire-track')!;
  const wire = document.getElementById('wire')!;
  if (caps.reducedMotion || caps.poster) {
    wire.classList.add('stacked');
    return;
  }
  const [{ default: Lenis }, gsapMod, stMod] = await Promise.all([import('lenis'), import('gsap'), import('gsap/ScrollTrigger')]);
  const gsap = gsapMod.gsap;
  const ScrollTrigger = stMod.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);

  const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  // rail links scroll through lenis
  document.querySelectorAll<HTMLAnchorElement>('.rail a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.getAttribute('href')!.slice(1);
      lenis.scrollTo(`#${id}`, { offset: 0 });
    });
  });

  const distance = () => Math.max(0, track.scrollWidth - innerWidth + 96);
  gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: {
      trigger: wire,
      pin: true,
      scrub: 0.6,
      start: 'top top',
      end: () => `+=${distance()}`,
      invalidateOnRefresh: true,
      anticipatePin: 1,
    },
  });
  addEventListener('resize', () => ScrollTrigger.refresh());
  setTimeout(() => ScrollTrigger.refresh(), 500);
}
