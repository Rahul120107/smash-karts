import type { CSSProperties } from 'react';
import { CONFIG } from '../../../shared/src/config.js';
import { WALLS, LAKE, CORNER_RADIUS, ROADS, BOOST_PADS } from '../../../shared/src/arena.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
import { drivingTelemetry } from '../../../shared/src/movement.js';
import { ARENA_SIZE } from '../../../shared/src/arena.js';
import type { GameEvent, Snapshot } from '../../../shared/src/types.js';
import { WeaponIcon } from './WeaponIcon.js';
import { TouchControls } from './TouchControls.js';
import { QualityButton } from './QualityButton.js';
import { eliminationNotice, NOTIFICATIONS, sanitizeName } from '../../../shared/src/elimination.js';
import { MAP_LABEL, MODE_LABEL, standings } from '../../../shared/src/match.js';
export function clock(seconds: number) { const n = Math.max(0, Math.ceil(seconds)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); }
export function ranked(state: Snapshot) { return standings(state.players); }
function MiniMap({ state, id }: { state: Snapshot; id: string }) {
  return <svg className="minimap" viewBox={`${-ARENA_SIZE / 2 - 2} ${-ARENA_SIZE / 2 - 2} ${ARENA_SIZE + 4} ${ARENA_SIZE + 4}`} aria-label="Arena minimap">
    <rect x={-ARENA_SIZE / 2} y={-ARENA_SIZE / 2} width={ARENA_SIZE} height={ARENA_SIZE} rx={CORNER_RADIUS} fill="#485b38ee"/>
    <ellipse cx={LAKE.x} cy={LAKE.z} rx={LAKE.width/2} ry={LAKE.depth/2} fill="#369499"/>
    {ROADS.map(road=><polyline key={road.id} points={road.samples.map(p=>p.x+','+p.z).join(' ')} fill="none" stroke="#c1b8a2" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round"/>)}
    {WALLS.filter(w=>w.style==='rail'||w.style==='boundary'||w.style==='tunnel').map((w, i) => <rect key={i} x={w.x - w.width / 2} y={w.z - w.depth / 2} width={w.width} height={w.depth} fill={w.style==='tunnel'?'#6c6862':'#815935'} opacity={w.base&&w.base>3?.45:1} transform={`rotate(${-(w.yaw??0)*180/Math.PI} ${w.x} ${w.z})`}/>)}
    {BOOST_PADS.map(pad=><rect key={pad.id} x={pad.x-pad.width/2} y={pad.z-pad.depth/2} width={pad.width} height={pad.depth} fill="#ffcb51" transform={`rotate(${-pad.yaw*180/Math.PI} ${pad.x} ${pad.z})`}/>)}
    {state.pickups.filter(p => p.active).map(p => <rect key={p.id} data-pickup-id={p.id} x={p.x - 0.7} y={p.z - 0.7} width="1.4" height="1.4" fill="#ffd365"/>)}
    {state.players.filter(p => p.health > 0).map(p => p.id === id ? <path key={p.id} d="M0 2.3 -1.8 -1.7 0 -1 1.8 -1.7Z" fill="white" transform={'translate(' + p.x + ' ' + p.z + ') rotate(' + -p.yaw * 180 / Math.PI + ')'}/> : <circle key={p.id} cx={p.x} cy={p.z} r="1.4" fill={'#' + p.color.toString(16).padStart(6, '0')}/>)}
  </svg>;
}
export function Hud({ state, id, rtt, feed, muted, onMute, onLeave }: { state: Snapshot; id: string; rtt: number; feed: GameEvent[]; muted: boolean; onMute: () => void; onLeave: () => void }) {
  const self = state.players.find(p => p.id === id); if (!self) return null;
  const weapon = self.weapon ? WEAPONS[self.weapon] : null, scores = ranked(state);
  const telemetry = drivingTelemetry(self), target = state.players.find(p => p.id === self.aimTarget && p.health > 0);
  const assisted = !!weapon?.aimAssist && !!target && self.health > 0;
  const hurt = state.events.some(e => e.kind === 'hit' && e.target === id && state.time - e.at < 0.25);
  const notices = feed.filter(e => state.time >= e.at && state.time - e.at < NOTIFICATIONS.duration).map(event => ({event,notice:eliminationNotice(event,id)})).filter(item=>item.notice).slice(-2);
  return <div className={'hud ' + (hurt ? 'hurt' : '')}>
    {self.health > 0 && <TouchControls/>}
    <div className="elimination-notices" aria-live="polite">{notices.map(({event,notice})=><div key={event.matchEventId??event.id} className={'elimination-notice '+(notice!.death?'death':'smash')} data-testid={notice!.death?'death-notification':'kill-notification'}><span>{notice!.death?'KART SMASHED':'SMASH CONFIRMED'}</span><strong>{notice!.message}</strong>{event.weapon && <WeaponIcon weapon={event.weapon}/>}</div>)}</div>
    <div className="hud-top">
      <div className="match-title"><span className="eyebrow">{MODE_LABEL.toUpperCase()}</span><strong>{MAP_LABEL} <span className="room-tag">{state.code}</span></strong></div>
      <div className={'timer ' + (state.remaining < 30 ? 'urgent' : '') + (state.remaining <= 10 ? ' final-seconds' : '')}><span>TIME LEFT</span><strong data-testid="match-timer">{clock(state.remaining)}</strong><div className="timer-track"><i style={{ width: state.remaining / state.duration * 100 + '%' }}/></div></div>
      <div className="hud-actions"><span className={'latency ' + (rtt > 180 ? 'slow' : '')}>{rtt} ms</span><button onClick={event => { event.currentTarget.blur(); onMute(); }} aria-label={muted ? 'Unmute audio' : 'Mute audio'}>{muted ? 'Sound off' : 'Sound on'}</button><QualityButton/><button onClick={onLeave}>Leave</button></div>
    </div>
    <aside className="leaderboard"><span className="eyebrow">LIVE STANDINGS <small>ELIMS</small></span>{scores.map((p, index) => <div className={p.id === id ? 'you' : ''} key={p.id}><span className="rank">{String(index + 1).padStart(2, '0')}</span><i style={{ background: '#' + p.color.toString(16).padStart(6, '0') }}/><span className="player-name">{p.name}{p.id === id ? ' · you' : ''}</span><b>{p.score}</b></div>)}</aside>
    <div className="kill-feed" aria-live="polite">{feed.filter(e => state.time - e.at < NOTIFICATIONS.feedDuration && state.time >= e.at).slice(-4).map(e => <div key={e.matchEventId??e.id}><b>{sanitizeName(e.killerName ?? state.players.find(p => p.id === e.player)?.name ?? (e.player === 'environment' ? 'Water' : 'Player'))}</b><span>{e.weaponName??'✦'}</span>{sanitizeName(e.victimName ?? state.players.find(p => p.id === e.target)?.name ?? 'Player')}</div>)}</div>
    <div className={'aim-indicator ' + (assisted ? 'locked' : '')} aria-hidden="true"><i/><i/><i/><i/></div>
    {weapon?.aimAssist && self.health > 0 && <div className={'aim-feedback ' + (assisted ? 'locked' : '')} data-testid="aim-feedback">{assisted ? 'TRACKING ' + target!.name : 'ASSIST READY'}</div>}
    {state.time < 1.5 && <div className="battle-live"><span>{MAP_LABEL.toUpperCase()}</span><strong>BATTLE LIVE</strong><small>Collect. Aim. Fire.</small></div>}
    {self.health <= 0 && <div className="respawn"><span className="eyebrow">KART ELIMINATED</span><strong>Back in {Math.max(1, Math.ceil(self.respawnAt - state.time))}</strong><span>Find a pickup. Return the favor.</span></div>}
    <div className="hud-bottom">
      <div className="vitals">
        <div><span className="eyebrow">HULL INTEGRITY</span><b data-testid="health">{Math.ceil(self.health)}<small> / {CONFIG.maxHealth}</small></b></div>
        <div className="health-track" role="progressbar" aria-label="Health" aria-valuenow={self.health} aria-valuemin={0} aria-valuemax={CONFIG.maxHealth}><i style={{ width: self.health / CONFIG.maxHealth * 100 + '%', background: self.health <= 30 ? '#ff826e' : '#66e2c3' }}/></div>
        <div className="status-chips">{self.invulnerableUntil > state.time && <span>PROTECTED</span>}{self.shieldUntil > state.time && <span>INVINCIBLE {Math.ceil(self.shieldUntil - state.time)}s</span>}{(self.orbitUntil ?? 0) > state.time && <span>ORBIT RAM {Math.ceil(self.orbitUntil! - state.time)}s</span>}{self.boostUntil > state.time && <span>BOOST {Math.ceil(self.boostUntil - state.time)}s</span>}<span className="score-chip">{self.score} eliminations</span></div>
        <div className={'speed-readout ' + (telemetry.sliding ? 'sliding' : '')}><b>{Math.round(telemetry.speed * 3.6)}</b><span>KM/H</span>{telemetry.sliding && <strong>DRIFT</strong>}<div><i style={{ width: Math.min(100, telemetry.speed / (CONFIG.maxSpeed * CONFIG.boostMultiplier) * 100) + '%' }}/></div></div>
      </div>
      <div className={'weapon-panel ' + (weapon ? 'equipped' : '')} style={weapon ? { '--weapon-color': '#' + weapon.color.toString(16).padStart(6, '0') } as CSSProperties : undefined}>
        <div className="weapon-icon"><WeaponIcon weapon={self.weapon}/></div><div><span className="eyebrow">{self.charging ? self.weapon==='cannon'?'RELEASE TO FIRE':'RELEASE TO THROW' : self.attacking ? 'ATTACK IN PROGRESS' : weapon ? state.time < self.nextFire ? 'RELOADING' : 'TAP SPACE TO ACTIVATE' : 'LOOK FOR THE GOLD BOXES'}</span><strong data-testid="equipped-weapon">{weapon?.label ?? 'Find a weapon'}</strong><span>{weapon?.hint ?? 'Drive through a box to collect'}</span></div>{weapon && <div className="ammo" data-testid="ammo">{self.ammo}<small>{weapon.duration > 0 ? 'USES' : 'AMMO'}</small></div>}
      </div>
      <MiniMap state={state} id={id}/>
    </div>
    <div className="control-hint"><kbd>W A S D</kbd> drive <span>·</span><kbd>SPACE</kbd> tap to fire <span>·</span><kbd>SHIFT</kbd> drift</div>
  </div>;
}
