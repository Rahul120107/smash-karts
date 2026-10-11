import { useEffect, useRef } from 'react';
import { ArenaGame } from '../game/scene.js';
export function GameView({ onReady, onError }: { onReady: (game: ArenaGame | null) => void; onError: (error: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    let game: ArenaGame;
    try { game = new ArenaGame(container.current); onReady(game); }
    catch (error) { console.error('Renderer initialization failed', error); onError('3D graphics could not start. Enable WebGL or try a current desktop browser.'); return; }
    return () => { onReady(null); game.dispose(); };
  }, [onReady, onError]);
  return <div className="game-canvas" ref={container} />;
}
