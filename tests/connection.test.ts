import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection } from '../client/src/networking/connection.js';
import { Simulation } from '../server/src/simulation/simulation.js';

class Socket {
  static OPEN = 1; static CONNECTING = 0; static sockets: Socket[] = [];
  readyState = 0; bufferedAmount = 0; sent: { type: string; code?: string }[] = [];
  onopen?: () => void; onmessage?: (event: { data: string }) => void; onclose?: (event: { code: number }) => void; onerror?: () => void;
  constructor(public url: string) { Socket.sockets.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: object) { this.onmessage?.({ data: JSON.stringify(value) }); }
  disconnect(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}
let connection: Connection;
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('WebSocket', Socket); Socket.sockets = []; connection = new Connection(() => 'wss://server.example/ws'); connection.connect(); });
afterEach(() => { connection.close(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const socket = () => Socket.sockets.at(-1)!;
function enter() { socket().open(); connection.create('Tester'); socket().message({ type: 'welcome', id: 'one', code: 'AAAAA' }); }

describe('connection recovery', () => {
  it('avoids duplicate connections and duplicate pending room requests', () => {
    connection.connect(); expect(Socket.sockets).toHaveLength(1); socket().open(); connection.create('Tester'); connection.create('Again');
    expect(socket().sent.filter(m => m.type === 'create')).toHaveLength(1);
  });
  it('does not save a failed create as an empty-code rejoin', () => {
    connection.create('Offline'); socket().open(); expect(socket().sent).toEqual([]); expect(connection.state.pending).toBe(false);
  });
  it('rejoins a surviving room with a fresh identity after transport loss', () => {
    enter(); socket().disconnect(); expect(connection.state.id).toBeNull(); vi.advanceTimersByTime(500); socket().open();
    expect(socket().sent).toEqual([{ type: 'join', name: 'Tester', code: 'AAAAA' }]); expect(connection.state.pending).toBe(true);
    socket().message({ type: 'welcome', id: 'two', code: 'AAAAA' }); expect(connection.state.id).toBe('two'); expect(connection.state.error).toBe('');
  });
  it('ignores stale callbacks from an old transport', () => {
    enter(); const old = socket(); old.disconnect(); vi.advanceTimersByTime(500); socket().open(); socket().message({ type: 'welcome', id: 'two', code: 'AAAAA' });
    old.disconnect(); old.onerror?.(); old.message({ type: 'left' }); old.open(); expect(connection.state.id).toBe('two'); expect(connection.state.status).toBe('connected');
  });
  it('returns to room entry after a restart instead of silently joining a lost room', () => {
    enter(); socket().disconnect(1012); expect(connection.state.error).toContain('server restarted'); vi.advanceTimersByTime(500); socket().open();
    expect(socket().sent).toEqual([]); expect(connection.state.id).toBeNull(); connection.create('Again'); expect(socket().sent[0]?.type).toBe('create');
  });
  it('stops prediction and retries a transport that is open but receives no messages', () => {
    enter(); vi.advanceTimersByTime(14000); expect(connection.state.status).toBe('disconnected'); expect(connection.state.snapshot).toBeNull();
    vi.advanceTimersByTime(500); expect(Socket.sockets).toHaveLength(2);
  });
  it('retains a live connection with heartbeat replies', () => {
    enter(); for (let i = 0; i < 10; i++) { vi.advanceTimersByTime(2000); socket().message({ type: 'pong', at: performance.now() }); }
    expect(Socket.sockets).toHaveLength(1); expect(connection.state.status).toBe('connected');
  });
  it('ignores welcome and snapshots arriving after leaving', () => {
    enter(); connection.leave(); const world = new Simulation(); world.addPlayer('one', 'Tester');
    socket().message({ type: 'welcome', id: 'one', code: 'AAAAA' }); socket().message({ type: 'snapshot', state: world.snapshot('AAAAA', 'one', 8) });
    expect(connection.state.id).toBeNull(); expect(connection.state.snapshot).toBeNull();
  });
  it('waits for leave acknowledgement before creating another room', () => {
    enter(); connection.leave(); connection.create('Too soon'); expect(socket().sent.filter(m => m.type === 'create')).toHaveLength(1);
    socket().message({ type: 'left' }); connection.create('New'); expect(socket().sent.filter(m => m.type === 'create')).toHaveLength(2);
  });
  it('allows room entry after a failed automatic rejoin', () => {
    enter(); socket().disconnect(); vi.advanceTimersByTime(500); socket().open(); socket().message({ type: 'error', message: 'Room not found.' });
    expect(connection.state.pending).toBe(false); expect(connection.state.error).toContain('Room not found'); connection.create('New'); expect(socket().sent.at(-1)?.type).toBe('create');
  });
  it('cancels reconnect timers on close and handles invalid URL configuration', () => {
    enter(); socket().disconnect(); connection.close(); vi.advanceTimersByTime(10000); expect(Socket.sockets).toHaveLength(1);
    const invalid = new Connection(() => { throw new Error('Invalid backend URL'); }); invalid.connect(); expect(invalid.state.error).toBe('Invalid backend URL'); invalid.close();
  });
});
