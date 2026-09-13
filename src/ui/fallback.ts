// Poster mode: no WebGL or a small touch screen. The still render replaces the scene;
// the simulation and every panel stay live.
import { fallback } from '../copy/en.js';

export function mountFallback() {
  const poster = document.getElementById('poster') as HTMLImageElement;
  const scene = document.getElementById('scene')!;
  scene.hidden = true;
  poster.src = '/poster.jpg';
  poster.hidden = false;
  const note = document.createElement('p');
  note.className = 'label poster-note';
  note.textContent = fallback.poster;
  document.getElementById('apparatus')!.appendChild(note);
}
