import http from 'http';
import https from 'https';
import { analyzePromptCache } from './engine.js';
import { formatReport } from './visualizer.js';

export function startCacheProxy({ port = 8080, target = 'https://api.anthropic.com', quiet = false } = {}) {
  const targetUrl = new URL(target);
  const isHttps = targetUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  const sessionStore = new Map();

  const server = http.createServer((clientReq, clientRes) => {
    // CORS headers
    clientRes.setHeader('Access-Control-Allow-Origin', '*');
    clientRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    clientRes.setHeader('Access-Control-Allow-Headers', '*');

    if (clientReq.method === 'OPTIONS') {
      clientRes.writeHead(200);
      clientRes.end();
      return;
    }

    const chunks = [];
    clientReq.on('data', chunk => chunks.push(chunk));

    clientReq.on('end', () => {
      const bodyBuffer = Buffer.concat(chunks);
      let parsedBody = null;
      try {
        if (bodyBuffer.length > 0) {
          parsedBody = JSON.parse(bodyBuffer.toString('utf8'));
        }
      } catch {
        // Non-JSON request, pass through
      }

      // Check session
      const sessionKey = clientReq.headers['x-session-id'] || clientReq.headers['authorization'] || clientReq.socket.remoteAddress;

      if (parsedBody && (clientReq.url.includes('/messages') || clientReq.url.includes('/chat/completions'))) {
        const previousPayload = sessionStore.get(sessionKey);
        if (previousPayload) {
          const analysis = analyzePromptCache(previousPayload, parsedBody, {
            model: parsedBody.model
          });

          if (!quiet) {
            console.log(formatReport(analysis));
          }
        } else {
          if (!quiet) {
            console.log(`\n\x1b[36m⚡ [SESSION INIT]\x1b[0m Started tracking session for ${parsedBody.model || 'model'} (First turn registered as cache baseline).`);
          }
        }

        // Update session state
        sessionStore.set(sessionKey, parsedBody);
      }

      // Forward to upstream target
      const forwardHeaders = { ...clientReq.headers };
      forwardHeaders.host = targetUrl.host;

      const forwardReq = transport.request({
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: clientReq.url,
        method: clientReq.method,
        headers: forwardHeaders
      }, forwardRes => {
        clientRes.writeHead(forwardRes.statusCode, forwardRes.headers);
        forwardRes.pipe(clientRes);
      });

      forwardReq.on('error', err => {
        console.error(`\x1b[31m[PROXY ERROR]\x1b[0m Upstream forwarding failed: ${err.message}`);
        clientRes.writeHead(502, { 'Content-Type': 'application/json' });
        clientRes.end(JSON.stringify({ error: 'Proxy upstream error', message: err.message }));
      });

      if (bodyBuffer.length > 0) {
        forwardReq.write(bodyBuffer);
      }
      forwardReq.end();
    });
  });

  server.listen(port, () => {
    console.log(`\n\x1b[32m✔ Prompt-Cache-Lens Proxy listening on http://127.0.0.1:${port}\x1b[0m`);
    console.log(`\x1b[2mForwarding requests to: ${target}\x1b[0m`);
    console.log(`\x1b[2mPoint your client baseURL to http://127.0.0.1:${port} to inspect cache invalidations live.\x1b[0m\n`);
  });

  return server;
}
