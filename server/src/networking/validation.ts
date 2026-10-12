import type { ClientMessage, Input } from '../../../shared/src/types.js';
import { sanitizeName } from '../../../shared/src/elimination.js';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function name(v: unknown): string {
  if (typeof v !== 'string') throw new Error('Enter a nickname.');
  const clean = sanitizeName(v);
  if (!clean || clean.length > 18) throw new Error('Nickname must be 1–18 characters.');
  return clean;
}
export function parseMessage(raw: string): ClientMessage {
  let m: unknown;
  try { m = JSON.parse(raw); } catch { throw new Error('Invalid message format.'); }
  if (!object(m)) throw new Error('Invalid message.');
  switch (m.type) {
    case 'create': return { type: 'create', name: name(m.name) };
    case 'join': {
      if (typeof m.code !== 'string' || !/^[A-HJ-NP-Z2-9]{5}$/i.test(m.code.trim())) throw new Error('Enter a valid five-character room code.');
      return { type: 'join', name: name(m.name), code: m.code.trim().toUpperCase() };
    }
    case 'start': case 'leave': return { type: m.type };
    case 'ping': if (typeof m.at === 'number' && Number.isFinite(m.at)) return { type: 'ping', at: m.at }; break;
    case 'input': {
      if (!Array.isArray(m.commands) || m.commands.length < 1 || m.commands.length > 6) throw new Error('Invalid input batch.');
      const commands: Input[] = [];
      for (const c of m.commands) {
        if (!object(c) || !Number.isSafeInteger(c.seq) || (c.seq as number) < 1 || (c.seq as number) > 1e9 ||
          typeof c.throttle !== 'number' || !Number.isFinite(c.throttle) || Math.abs(c.throttle) > 1 ||
          typeof c.steer !== 'number' || !Number.isFinite(c.steer) || Math.abs(c.steer) > 1 || typeof c.fire !== 'boolean' || typeof c.drift !== 'boolean') throw new Error('Invalid player controls.');
        if (c.firePress !== undefined && (!Number.isSafeInteger(c.firePress) || (c.firePress as number) < 0 || (c.firePress as number) > 1e9)) throw new Error('Invalid fire press.');
        if (c.fireHeld !== undefined && typeof c.fireHeld !== 'boolean') throw new Error('Invalid held fire.');
        commands.push({ seq: c.seq as number, throttle: c.throttle, steer: c.steer, fire: c.fire, drift: c.drift,
          ...(c.firePress === undefined ? {} : { firePress: c.firePress as number }), ...(c.fireHeld === undefined ? {} : { fireHeld: c.fireHeld }) });
      }
      return { type: 'input', commands };
    }
  }
  throw new Error('Unsupported message type.');
}
