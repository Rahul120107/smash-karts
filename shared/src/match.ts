import type { PlayerState } from './types.js';

// One original island and one mode; these are labels, never client-selectable rules.
export const MAP_LABEL = 'Sunbreak Island';
export const MODE_LABEL = 'Free For All';
export function standings(players: Iterable<PlayerState>): PlayerState[] {
  return [...players].sort((a, b) => b.score - a.score || a.deaths - b.deaths || a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id, 'en'));
}
/** Elimination score alone determines victory. Deaths only order tied display rows. */
export function matchWinners(players: Iterable<PlayerState>): string[] {
  const ranked = standings(players), highest = ranked[0]?.score;
  return ranked.filter(p => p.score === highest).map(p => p.id);
}
