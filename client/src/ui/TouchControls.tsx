import { useEffect } from 'react';
import { touchControl, type TouchAction } from '../game/input.js';

const active = new Map<number, TouchAction>();
export function TouchControls() {
  useEffect(() => () => { for (const [id, action] of active) touchControl(action, false, id); active.clear(); }, []);
  const button = (action: TouchAction, label: string, glyph: string) => <button aria-label={label} data-control={action}
    onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); active.set(e.pointerId, action); touchControl(action, true, e.pointerId); }}
    onPointerUp={e => { touchControl(action, false, e.pointerId); active.delete(e.pointerId); }}
    onPointerCancel={e => { touchControl(action, false, e.pointerId); active.delete(e.pointerId); }}
    onLostPointerCapture={e => { touchControl(action, false, e.pointerId); active.delete(e.pointerId); }}>{glyph}</button>;
  return <div className="touch-controls" aria-label="Touch driving controls"><div className="touch-drive">
    {button('forward','Accelerate','▲')}{button('left','Steer left','◀')}{button('reverse','Brake and reverse','▼')}{button('right','Steer right','▶')}
    </div><div className="touch-combat">{button('drift','Drift','DRIFT')}{button('fire','Use weapon','FIRE')}</div></div>;
}
