import type { Snapshot } from '../../../shared/src/types.js';
/** Keep authoritative state at full precision; quantize only the wire representation. */
export function encodeSnapshot(state: Snapshot, lastEventId = 0): string {
  return JSON.stringify({ type: 'snapshot', state: { ...state, events: state.events.filter(e => e.id > lastEventId) } },
    (_key, value: unknown) => typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 1000) / 1000 : value);
}
