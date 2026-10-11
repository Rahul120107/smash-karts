import type { ClientMessage, GameEvent, ServerMessage, Snapshot } from '../../../shared/src/types.js';
import { websocketUrl } from './url.js';
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
  private awaitingLeave = false;
  constructor(private getUrl = () => websocketUrl(location, import.meta.env.VITE_SERVER_URL, import.meta.env.VITE_WS_URL)) {}
  state: ConnectionState = { status: 'connecting', id: null, snapshot: null, error: '', pending: false, rtt: 0, feed: [] };
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  getState = () => this.state;
  onSnapshot(callback: (s: Snapshot) => void) { this.snapshotListeners.add(callback); return () => { this.snapshotListeners.delete(callback); }; }
  private update(patch: Partial<ConnectionState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  clearError = () => this.update({ error: '' });
  connect() {
    if (this.socket) return;
    this.stopped = false; clearTimeout(this.retry); this.update({ status: 'connecting' });
    let ws: WebSocket;
    try { ws = new WebSocket(this.getUrl()); }
    catch (error) { this.update({ status: 'disconnected', pending: false, error: error instanceof Error ? error.message : 'Invalid server URL.' }); return; }
    this.socket = ws;
    let lastMessage = Date.now();
    const current = () => this.socket === ws && !this.stopped;
    const lost = (code = 0) => {
      if (!current()) return;
      this.socket = null; clearInterval(this.ping);
      this.awaitingLeave = false;
      let error = this.state.error || 'Connection lost. Reconnecting to the game server…';
      if (code === 1012 || code === 1008) {
        this.room = null;
        error = code === 1012 ? 'The server restarted. Create or join a new room.' : 'The connection was closed by the server. Create or join a room again.';
      }
      this.update({ status: 'disconnected', id: null, snapshot: null, pending: false, feed: [], error });
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(4000, 'Reconnecting');
      this.retry = setTimeout(() => this.connect(), Math.min(5000, 500 * 2 ** this.attempts++));
    };
    ws.onopen = () => {
      if (!current()) return;
      lastMessage = Date.now(); this.attempts = 0; this.update({ status: 'connected' });
      if (this.room?.code) { this.update({ pending: true }); this.send({ type: 'join', ...this.room }); }
      else this.room = null;
      this.ping = setInterval(() => {
        if (!current()) return;
        if (Date.now() - lastMessage > 12000) lost();
        else this.send({ type: 'ping', at: performance.now() });
      }, 2000);
    };
    ws.onmessage = event => {
      if (!current()) return;
      lastMessage = Date.now();
      let message: ServerMessage;
      try { message = JSON.parse(event.data as string) as ServerMessage; } catch { this.update({ error: 'The server sent an unreadable message.' }); return; }
      if (message.type === 'welcome') {
        if (!this.room || this.awaitingLeave) return;
        if (this.room) this.room.code = message.code;
        this.lastEvent = 0; this.update({ id: message.id, pending: false, feed: [], error: '' });
      } else if (message.type === 'snapshot') {
        if (!this.room || !this.state.id || message.state.code !== this.room.code) return;
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
        this.awaitingLeave = false;
        this.room = null; this.update({ id: null, snapshot: null, pending: false, feed: [] });
      } else if (message.type === 'pong') this.update({ rtt: Math.round(performance.now() - message.at) });
    };
    ws.onerror = () => { if (current()) this.update({ error: 'Connection failed. Check the server URL and your network connection.' }); };
    ws.onclose = event => lost(event.code);
  }
  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    if (this.socket.bufferedAmount > 64000) return false;
    this.socket.send(JSON.stringify(message)); return true;
  }
  create(name: string) { this.enter(name, ''); }
  join(name: string, code: string) { this.enter(name, code.toUpperCase()); }
  private enter(name: string, code: string) {
    if (this.state.pending || this.state.id) return;
    if (!this.send(code ? { type: 'join', name, code } : { type: 'create', name })) { this.update({ error: 'Waiting for the server connection.' }); return; }
    this.room = { name, code }; this.update({ pending: true, error: '', feed: [] });
  }
  leave = () => { this.room = null; this.awaitingLeave = this.send({ type: 'leave' }); this.update({ id: null, snapshot: null, error: '', feed: [], pending: this.awaitingLeave }); };
  start = () => { this.update({ error: '', feed: [] }); this.send({ type: 'start' }); };
  close() {
    this.stopped = true; clearTimeout(this.retry); clearInterval(this.ping);
    const ws = this.socket; this.socket = null; this.room = null; this.awaitingLeave = false; ws?.close();
    this.update({ status: 'disconnected', id: null, snapshot: null, pending: false, feed: [] });
  }
}
export const connection = new Connection();
