import { useSyncExternalStore } from 'react';
import { graphicsMode, onGraphicsMode, setGraphicsMode } from '../game/quality.js';
export function QualityButton(){
  const mode=useSyncExternalStore(onGraphicsMode,graphicsMode);
  return <button aria-label="Change graphics quality" title="Lower detail for weaker devices" onClick={e=>{e.currentTarget.blur();setGraphicsMode(mode==='auto'?'low':'auto');}}>Graphics: {mode==='auto'?'Auto':'Low'}</button>;
}
