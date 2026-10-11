import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { connection } from '../networking/connection.js';
import { GameView } from '../components/GameView.js';
import type { ArenaGame } from '../game/scene.js';
import { Hud, ranked } from './Hud.js';
import { CONFIG } from '../../../shared/src/config.js';
import { WEAPON_IDS } from '../../../shared/src/weapons.js';
import { MAP_LABEL, MODE_LABEL, matchWinners } from '../../../shared/src/match.js';
export function App() {
  const network = useSyncExternalStore(connection.subscribe, connection.getState);
  const [name, setName] = useState(() => { try { return localStorage.getItem('crossfire-nickname') ?? ''; } catch { return ''; } });
  const [code, setCode] = useState(new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [game, setGame] = useState<ArenaGame | null>(null); const [graphicsError, setGraphicsError] = useState('');
  const [muted, setMuted] = useState(false); const [copied, setCopied] = useState(false);
  const onReady = useCallback((ready: ArenaGame | null) => setGame(ready), []);
  const onError = useCallback((error: string) => setGraphicsError(error), []);
  useEffect(() => { connection.connect(); return () => connection.close(); }, []);
  const remember = () => { try { localStorage.setItem('crossfire-nickname', name.trim()); } catch { /* Nickname persistence is optional. */ } };
  const state = network.snapshot, id = network.id;
  const disabled = network.status !== 'connected' || network.pending || !name.trim() || !!graphicsError;
  const mute = () => { if (game) setMuted(game.audio.toggle()); };
  const copy = async () => {
    if (!state) return;
    try { await navigator.clipboard.writeText(`${location.origin}/?room=${state.code}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { connection.clearError(); setCopied(false); window.prompt('Copy this invite link:', `${location.origin}/?room=${state.code}`); }
  };
  const host = state?.host === id; const winners = state?.winnerIds ?? (state ? matchWinners(state.players) : []);
  return <>
    <GameView onReady={onReady} onError={onError}/>
    {(!state || state.phase !== 'playing') && <div className="menu-shade"/>}
    {(network.error || graphicsError) && <div role="alert" className="error-banner"><span>{graphicsError || network.error}</span>{!graphicsError && <button onClick={connection.clearError} aria-label="Dismiss error">×</button>}</div>}
    {!state && <main className="menu"><div className="brand-mark" aria-hidden="true">✦</div><p className="eyebrow">DRIVE. ARM UP. MAKE AN IMPACT.</p><h1>CROSSFIRE<br/><em>KARTS</em></h1><p className="menu-intro">One arena. Three minutes.<br/>A little chaos between friends.</p><div className="menu-form"><label htmlFor="nickname">YOUR NICKNAME</label><input id="nickname" placeholder="Enter nickname" maxLength={18} value={name} onChange={e => setName(e.target.value)} autoComplete="off"/><button className="primary" disabled={disabled} onClick={() => { remember(); connection.create(name); }}>Create room <span>→</span></button><div className="divider"><span>OR JOIN YOUR FRIENDS</span></div><div className="join-row"><input aria-label="Room code" placeholder="ROOM CODE" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={5} autoComplete="off"/><button disabled={disabled || code.length !== 5} onClick={() => { remember(); connection.join(name, code); }}>Join <span>↗</span></button></div><span className={`connection-status ${network.status}`}><i/>{network.status === 'connected' ? 'Server connected · no account needed' : network.status === 'connecting' ? 'Connecting to game server…' : 'Disconnected · retrying…'}</span></div><div className="menu-controls"><kbd>W A S D</kbd><span>Drive</span><kbd>SPACE</kbd><span>Fire</span><kbd>SHIFT</kbd><span>Drift</span></div></main>}
    {state && id && state.phase === 'lobby' && <main className="room-panel"><span className="eyebrow">PRIVATE ROOM · {MAP_LABEL.toUpperCase()} · {MODE_LABEL.toUpperCase()}</span><h2>Bring your crew.</h2><p>Share the code, then start the battle.</p><div className="invite-code"><span>ROOM CODE</span><strong data-testid="room-code">{state.code}</strong><button onClick={() => void copy()}>{copied ? 'Copied!' : 'Copy invite'}</button></div><div className="lobby-heading"><span>PLAYERS</span><span>{state.players.length} / {state.capacity}</span></div><div className="lobby-players">{state.players.map(p => <div key={p.id}><i style={{ background: `#${p.color.toString(16)}` }}/><strong>{p.name}</strong>{p.id === state.host && <span className="host-badge">HOST</span>}{p.id === id && <span className="you-badge">YOU</span>}</div>)}</div><div className="match-info"><span>{Math.round(state.duration / 60 * 10) / 10} minute battle</span><span>{WEAPON_IDS.length} weapons & power-ups</span><span>Most eliminations wins</span></div>{host ? <button className="primary" onClick={e => { e.currentTarget.blur(); connection.start(); }}>Start match <span>→</span></button> : <div className="waiting">Waiting for the host to start…</div>}<button className="text-button" onClick={connection.leave}>Leave room</button><small className="practice-note">{state.players.length === 1 ? 'You can start solo to practice driving and weapons.' : 'Everyone is ready. Let the chaos begin.'}</small></main>}
    {state && id && state.phase === 'playing' && <Hud state={state} id={id} rtt={network.rtt} feed={network.feed} muted={muted} onMute={mute} onLeave={connection.leave}/>}
    {state && id && state.phase === 'finished' && <main className="room-panel results"><span className="eyebrow">BATTLE COMPLETE</span><div className="result-star">✦</div><h2>{winners.length > 1 ? 'A shared victory.' : `${state.players.find(p => p.id === winners[0])?.name ?? 'Departed player'} wins!`}</h2><p>{winners.length > 1 ? 'Tied on eliminations. Victory shared.' : 'Most eliminations wins.'}</p><div className="score-header"><span>FINAL STANDINGS</span><span>ELIMS / DEATHS</span></div>{ranked(state).map((p, i) => <div className={`result-row ${p.id === id ? 'you' : ''}`} key={p.id}><b>{String(i + 1).padStart(2, '0')}</b><i style={{ background: `#${p.color.toString(16)}` }}/><strong>{p.name}{p.id === id ? ' · you' : ''}</strong><span>{p.score} <small>/ {p.deaths}</small></span></div>)}{host ? <button className="primary" onClick={e => { e.currentTarget.blur(); connection.start(); }}>Play again <span>↻</span></button> : <div className="waiting">Waiting for the host to play again…</div>}<button className="text-button" onClick={connection.leave}>Exit room</button></main>}
    {!state && <footer className="menu-footer"><span>ORIGINAL MULTIPLAYER ARENA COMBAT</span><span>{CONFIG.capacity} PLAYERS / ROOM</span></footer>}
  </>;
}
