// Launch-day values that must be editable on the server without a rebuild: the contract
// address, the dexscreener link and the switch-on time. They live in /launch.json next to
// index.html (served with no-cache) and override the defaults in copy/en.ts when present.
import { footer, launch } from './copy/en.js';

interface LaunchFile {
  contract?: string;
  dexUrl?: string;
  launchAt?: string;
}

export async function applyLaunchFile(): Promise<void> {
  try {
    const r = await fetch('/launch.json', { cache: 'no-store' });
    if (!r.ok) return;
    const j = (await r.json()) as LaunchFile;
    if (typeof j.contract === 'string' && j.contract.trim()) footer.contractValue = j.contract.trim();
    if (typeof j.dexUrl === 'string') footer.dexUrl = j.dexUrl.trim();
    if (typeof j.launchAt === 'string' && !Number.isNaN(Date.parse(j.launchAt))) launch.at = j.launchAt;
  } catch {
    // no file or bad JSON: the defaults in copy/en.ts stand
  }
}
