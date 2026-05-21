// Vercel Edge Function — WebSocket proxy for Gemini Live API
// The API key lives here as an env var, never in the frontend.
export const config = { runtime: 'edge' };

const GEMINI_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

export default function handler(req) {
  const upgrade = (req.headers.get('upgrade') || '').toLowerCase();
  if (upgrade !== 'websocket') {
    return new Response('This endpoint requires a WebSocket connection.', { status: 426 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response('GEMINI_API_KEY environment variable is not set.', { status: 500 });
  }

  const [client, server] = Object.values(new WebSocketPair());
  server.accept();

  const upstream = new WebSocket(`${GEMINI_WS}?key=${apiKey}`);

  // Buffer client messages until upstream is ready
  const buffer = [];

  server.addEventListener('message', ({ data }) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data);
    } else {
      buffer.push(data);
    }
  });

  upstream.addEventListener('open', () => {
    buffer.forEach(msg => upstream.send(msg));
    buffer.length = 0;
  });

  upstream.addEventListener('message', ({ data }) => {
    try { server.send(data); } catch {}
  });

  server.addEventListener('close', ({ code, reason }) => {
    try { upstream.close(code, reason); } catch {}
  });

  upstream.addEventListener('close', ({ code, reason }) => {
    try { server.close(code, reason); } catch {}
  });

  upstream.addEventListener('error', () => {
    try { server.close(1011, 'Gemini connection error'); } catch {}
  });

  return new Response(null, { status: 101, webSocket: client });
}
