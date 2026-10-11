import type { WeaponId } from '../../../shared/src/types.js';
export function WeaponIcon({ weapon }: { weapon: WeaponId | null }) {
  const paths: Record<WeaponId, React.ReactNode> = {
    machineGun: <><path d="M6 12h21v8H6zM15 20l-3 9h6l3-9M27 14h8v4h-8M8 9v3M13 9v3"/><path d="M4 14v4"/></>,
    rocket: <><path d="m9 29 5-12L27 4l9 9-13 13-12 5Z"/><path d="m14 17 9 9M26 5l9 9M10 26l-6 9 9-6"/></>,
    homing: <><path d="m11 29 5-12L29 4l7 7-13 13-12 5Z"/><path d="M5 10a9 9 0 0 0 9 9M5 5v5h5M8 30l-4 6"/></>,
    mine: <><ellipse cx="20" cy="23" rx="14" ry="7"/><path d="M6 23v5c0 8 28 8 28 0v-5M14 18v-5h12v5M20 5v3M8 10l3 3M32 10l-3 3"/></>,
    bomb: <><circle cx="19" cy="25" r="12"/><path d="m23 14 2-6c2-5 7 3 10-2M30 2l4 2M36 7l2 3M8 21l4-3"/></>,
    shield: <><path d="M20 3 34 8v12c0 8-14 16-14 16S6 28 6 20V8Z"/><path d="m13 20 5 5 10-12"/></>,
    boost: <><path d="m24 3-16 20h11l-3 14 17-22H22Z"/></>,
    scatter: <><path d="M4 16h15v9H4zM19 19h6M11 25l-2 10h6l3-10M28 19h8M26 11l7-5M26 27l7 5"/></>,
  };
  return <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{weapon ? paths[weapon] : <><path d="M13 13a7 7 0 1 1 12 5c-4 2-5 3-5 7"/><circle cx="20" cy="32" r="1"/></>}</svg>;
}
