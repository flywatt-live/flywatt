// Capability checks decided once at boot.
export interface Caps {
  webgl2: boolean;
  coarse: boolean;
  narrow: boolean;
  reducedMotion: boolean;
  /** show the static poster instead of the live scene */
  poster: boolean;
}

export function detect(): Caps {
  let webgl2 = false;
  try {
    const c = document.createElement('canvas');
    webgl2 = !!c.getContext('webgl2');
  } catch {
    webgl2 = false;
  }
  const coarse = matchMedia('(pointer: coarse)').matches;
  const narrow = innerWidth < 900;
  const q = new URLSearchParams(location.search);
  // ?motion=1 / ?poster=1 override the detection while testing
  const reducedMotion = q.get('motion') === '1' ? false : matchMedia('(prefers-reduced-motion: reduce)').matches;
  const poster = q.get('poster') === '1' ? true : !webgl2 || (coarse && narrow);
  return { webgl2, coarse, narrow, reducedMotion, poster };
}
