interface PageAddress { protocol: string; host: string }

/** Render terminates TLS; browsers must still use wss on an HTTPS page. */
export function websocketUrl(page: PageAddress, serverUrl?: string, explicitWsUrl?: string): string {
  const configured = explicitWsUrl?.trim() || serverUrl?.trim();
  let url: URL;
  try { url = new URL(configured || `${page.protocol === 'https:' ? 'wss:' : 'ws:'}//${page.host}/ws`); }
  catch { throw new Error('VITE_SERVER_URL must be an absolute backend URL.'); }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('VITE_SERVER_URL must be an HTTP(S) or WebSocket URL without credentials, queries, or fragments.');
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (page.protocol === 'https:' && url.protocol !== 'wss:') throw new Error('An HTTPS game requires a secure HTTPS or WSS backend URL.');
  if (url.pathname === '/') url.pathname = '/ws';
  if (url.pathname !== '/ws') throw new Error('VITE_SERVER_URL must point to the backend root or /ws.');
  return url.href;
}
