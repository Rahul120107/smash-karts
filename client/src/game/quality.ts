export type GraphicsMode = 'auto' | 'low';
let mode:GraphicsMode='auto';
const listeners=new Set<()=>void>();
export const graphicsMode=()=>mode;
export function setGraphicsMode(value:GraphicsMode){mode=value;for(const listener of listeners)listener();}
export function onGraphicsMode(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
