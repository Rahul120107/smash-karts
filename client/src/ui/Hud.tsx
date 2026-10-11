import { CONFIG } from '../../../shared/src/config.js';
import { WALLS } from '../../../shared/src/arena.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
import type { GameEvent, Snapshot } from '../../../shared/src/types.js';
import { WeaponIcon } from './WeaponIcon.js';
export function clock(seconds: number) { const n = Math.ceil(seconds); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
export function ranked(state: Snapshot) { return [...state.players].sort((a, b) => b.score - a.score || a.deaths - b.deaths || a.name.localeCompare(b.name)); }
function MiniMap({ state, id }: { state: Snapshot; id: string }) {
  return <svg className="minimap" viewBox="-38 -38 76 76" aria-label="Arena minimap">
    <rect x="-36" y="-36" width="72" height="72" rx="3" fill="#1a3040e6"/>
    {WALLS.map((w, i) => <rect key={i} x={w.x - w.width / 2} y={w.z - w.depth / 2} width={w.width} height={w.depth} fill="#6c8792"/>)}
    {state.pickups.filter(p => p.availableAt <= state.time).map(p => <rect key={p.id} x={p.x - 0.7} y={p.z - 0.7} width="1.4" height="1.4" fill="#ffcf69"/>)}
    {state.players.filter(p => p.health > 0).map(p => p.id === id ? <path key={p.id} d="M0 2.3 -1.8 -1.7 0 -1 1.8 -1.7Z" fill="white" transform={`translate(${p.x} ${p.z}) rotate(${-p.yaw * 180 / Math.PI})`}/> : <circle key={p.id} cx={p.x} cy={p.z} r="1.4" fill={`#${p.color.toString(16).padStart(6, '0')}`}/>)}
  </svg>;
}
export function Hud({ state, id, rtt, feed, muted, onMute, onLeave }: { state: Snapshot; id: string; rtt: number; feed: GameEvent[]; muted: boolean; onMute: () => void; onLeave: () => void }) {
  const self = state.players.find(p => p.id === id); if (!self) return null;
  const weapon = self.weapon ? WEAPONS[self.weapon] : null;
  const scores = ranked(state);
  const hurt = state.events.some(e => e.kind === 'hit' && e.target === id && state.time - e.at < 0.25);
  return <div className={`hud ${hurt ? 'hurt' : ''}`}>
    <div className="hud-top"><div className="match-title"><span className="eyebrow">CROSSFIRE KARTS</span><strong>Depot arena <span className="room-tag">{state.code}</span></strong></div><div className={`timer ${state.remaining < 30 ? 'urgent' : ''}`}><span>TIME LEFT</span><strong data-testid="match-timer">{clock(state.remaining)}</strong></div><div className="hud-actions"><span className="latency">{rtt} ms</span><button onClick={onMute} aria-label={muted ? 'Unmute audio' : 'Mute audio'}>{muted ? 'Sound off' : 'Sound on'}</button><button onClick={onLeave}>Leave</button></div></div>
    <aside className="leaderboard"><span className="eyebrow">LEADERBOARD</span>{scores.map((p, index) => <div className={p.id === id ? 'you' : ''} key={p.id}><span className="rank">{index + 1}</span><i style={{ background: `#${p.color.toString(16)}` }}/><span className="player-name">{p.name}{p.id === id ? ' · you' : ''}</span><b>{p.score}</b></div>)}</aside>
    <div className="kill-feed">{feed.filter(e => state.time - e.at < 4 && state.time >= e.at).map(e => <div key={e.id}>{state.players.find(p => p.id === e.player)?.name ?? 'Player'} <span>✦</span> {state.players.find(p => p.id === e.target)?.name ?? 'Player'}</div>)}</div>
    <div className="aim-indicator" aria-hidden="true">⌃</div>
    {self.health <= 0 && <div className="respawn"><span className="eyebrow">KART ELIMINATED</span><strong>Back in {Math.max(1, Math.ceil(self.respawnAt - state.time))}</strong><span>Find a pickup. Return the favor.</span></div>}
    <div className="hud-bottom"><div className="vitals"><div><span className="eyebrow">HULL INTEGRITY</span><b data-testid="health">{self.health}<small> / {CONFIG.maxHealth}</small></b></div><div className="health-track"><i style={{ width: `${self.health}%`, background: self.health <= 30 ? '#f37c60' : '#71d9b1' }}/></div><div className="status-chips">{self.invulnerableUntil > state.time && <span>RESPAWN PROTECTION</span>}{self.shieldUntil > state.time && <span>SHIELD {Math.ceil(self.shieldUntil - state.time)}s</span>}{self.boostUntil > state.time && <span>BOOST {Math.ceil(self.boostUntil - state.time)}s</span>}<span className="score-chip">{self.score} eliminations</span></div></div>
      <div className={`weapon-panel ${weapon ? 'equipped' : ''}`} style={weapon ? { '--weapon-color': `#${weapon.color.toString(16)}` } as React.CSSProperties : undefined}><div className="weapon-icon"><WeaponIcon weapon={self.weapon}/></div><div><span className="eyebrow">{weapon ? 'EQUIPPED' : 'LOOK FOR THE GOLD BOXES'}</span><strong data-testid="equipped-weapon">{weapon?.label ?? 'Find a weapon'}</strong><span>{weapon?.hint ?? 'Drive through a box to collect'}</span></div>{weapon && <div className="ammo" data-testid="ammo">{self.ammo}<small>{self.weapon === 'shield' || self.weapon === 'boost' ? 'USES' : 'AMMO'}</small></div>}</div>
      <MiniMap state={state} id={id}/></div>
    <div className="control-hint"><kbd>W A S D</kbd> drive <span>·</span> <kbd>SPACE</kbd> fire <span>·</span> <kbd>SHIFT</kbd> drift</div>
  </div>;
}
