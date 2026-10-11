import type { ClientMessage, GameEvent, ServerMessage, Snapshot } from '../../../shared/src/types.js';
export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected'; id: string | null; snapshot: Snapshot | null;
  error: string; pending: boolean; rtt: number; feed: GameEvent[];
}
export class Connection {
  private socket: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private snapshotListeners = new Set<(s: Snapshot) => void>();
  private retry: ReturnType<typeof setTimeout> | undefined; private ping: ReturnType<typeof setInterval> | undefined;
  private stopped = false; private attempts = 0; private lastEvent = 0;
  private room: { name: string; code: string } | null = null;
  state: ConnectionState = { status: 'connecting', id: null, snapshot: null, error: '', pending: false, rtt: 0, feed: [] };
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  getState = () => this.state;
  onSnapshot(callback: (s: Snapshot) => void) { this.snapshotListeners.add(callback); return () => { this.snapshotListeners.delete(callback); }; }
  private update(patch: Partial<ConnectionState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  clearError = () => this.update({ error: '' });
  connect() {
    this.stopped = false; this.update({ status: 'connecting' });
    const override = import.meta.env.VITE_WS_URL as string | undefined;
    const ws = new WebSocket(override ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.socket = ws;
    ws.onopen = () => {
      this.attempts = 0; this.update({ status: 'connected', error: '' });
      if (this.room) this.send({ type: 'join', ...this.room });
      this.ping = setInterval(() => this.send({ type: 'ping', at: performance.now() }), 2000);
    };
    ws.onmessage = event => {
      let message: ServerMessage;
      try { message = JSON.parse(event.data as string) as ServerMessage; } catch { this.update({ error: 'The server sent an unreadable message.' }); return; }
      if (message.type === 'welcome') {
        if (this.room) this.room.code = message.code;
        this.lastEvent = 0; this.update({ id: message.id, pending: false, feed: [] });
      } else if (message.type === 'snapshot') {
        const fresh = message.state.events.filter(e => e.id > this.lastEvent);
        for (const e of fresh) this.lastEvent = Math.max(this.lastEvent, e.id);
        const previous = this.state.snapshot;
        const retained = previous?.code === message.state.code && previous.tick <= message.state.tick ? previous.events.filter(e => e.at <= message.state.time && message.state.time - e.at < 0.75) : [];
        const ids = new Set(retained.map(e => e.id));
        const snapshot = { ...message.state, events: [...retained, ...message.state.events.filter(e => !ids.has(e.id))].slice(-256) };
        this.update({ snapshot, feed: [...this.state.feed, ...fresh.filter(e => e.kind === 'elimination')].slice(-4) });
        for (const callback of this.snapshotListeners) callback(snapshot);
      } else if (message.type === 'error') {
        if (!this.state.id) this.room = null;
        this.update({ error: message.message, pending: false });
      } else if (message.type === 'left') {
        this.room = null; this.update({ id: null, snapshot: null, pending: false, feed: [] });
      } else if (message.type === 'pong') this.update({ rtt: Math.round(performance.now() - message.at) });
    };
    ws.onerror = () => this.update({ error: 'Connection failed. Check that the game server is running.' });
    ws.onclose = () => {
      clearInterval(this.ping);
      this.update({ status: 'disconnected', id: null, snapshot: null, pending: false });
      if (!this.stopped) this.retry = setTimeout(() => this.connect(), Math.min(5000, 500 * 2 ** this.attempts++));
    };
  }
  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    if (this.socket.bufferedAmount > 64000) return false;
    this.socket.send(JSON.stringify(message)); return true;
  }
  create(name: string) { this.room = { name, code: '' }; this.update({ pending: true, error: '', feed: [] }); if (!this.send({ type: 'create', name })) this.update({ pending: false, error: 'Waiting for the server connection.' }); }
  join(name: string, code: string) { this.room = { name, code }; this.update({ pending: true, error: '', feed: [] }); if (!this.send({ type: 'join', name, code })) this.update({ pending: false, error: 'Waiting for the server connection.' }); }
  leave = () => { this.room = null; this.send({ type: 'leave' }); this.update({ id: null, snapshot: null, error: '', feed: [], pending: false }); };
  start = () => { this.update({ error: '', feed: [] }); this.send({ type: 'start' }); };
  close() { this.stopped = true; clearTimeout(this.retry); clearInterval(this.ping); this.socket?.close(); }
}
export const connection = new Connection();
