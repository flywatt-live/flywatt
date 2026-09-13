// Left rail: a ruler. One long tick per section, minor ticks between, no numbers, no words.
export interface Rail {
  setActive(id: string): void;
}

export function mountRail(): Rail {
  const rail = document.getElementById('rail')!;
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'));
  const links: HTMLAnchorElement[] = [];
  rail.replaceChildren();
  sections.forEach((s, i) => {
    const a = document.createElement('a');
    a.href = `#${s.id}`;
    a.className = 'tick major';
    a.setAttribute('aria-label', s.dataset.section ?? s.id);
    a.innerHTML = `<span class="sr">${s.dataset.section ?? s.id}</span>`;
    rail.appendChild(a);
    links.push(a);
    if (i < sections.length - 1) {
      for (let k = 0; k < 3; k++) {
        const m = document.createElement('span');
        m.className = 'tick minor';
        m.setAttribute('aria-hidden', 'true');
        rail.appendChild(m);
      }
    }
  });
  const api: Rail = {
    setActive(id) {
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
    },
  };
  // fallback activity tracking when no scroll choreography is running
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) if (e.isIntersecting) api.setActive((e.target as HTMLElement).id);
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  sections.forEach((s) => io.observe(s));
  return api;
}
