/**
 * Buffering proxy in front of Metro for Android emulator.
 *
 * Emulators often truncate Metro's chunked ~20MB JS responses, which Hermes
 * then reports as random syntax errors (';' expected, ':' expected, ')' expected).
 * This proxy waits for the full upstream body and re-sends with Content-Length.
 *
 * Usage: node scripts/metro-buffer-proxy.js
 *   Metro must already be listening on METRO_UPSTREAM_PORT (default 8082).
 *   Emulator / adb reverse should target PROXY_PORT (default 8081).
 */
const http = require('http');

const PROXY_PORT = Number(process.env.PROXY_PORT || 8081);
const UPSTREAM_PORT = Number(process.env.METRO_UPSTREAM_PORT || 8082);
const UPSTREAM_HOST = process.env.METRO_UPSTREAM_HOST || '127.0.0.1';

function shouldBuffer(url = '') {
  return (
    url.includes('.bundle') ||
    url.includes('index.bundle') ||
    url.includes('virtual-metro-entry')
  );
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const headers = { ...req.headers, host: `${UPSTREAM_HOST}:${UPSTREAM_PORT}` };
    delete headers['accept-encoding'];

    const upstream = http.request(
      {
        hostname: UPSTREAM_HOST,
        port: UPSTREAM_PORT,
        path: req.url,
        method: req.method,
        headers,
      },
      (upRes) => {
        const data = [];
        upRes.on('data', (c) => data.push(c));
        upRes.on('end', () => {
          const buf = Buffer.concat(data);
          const outHeaders = { ...upRes.headers };
          delete outHeaders['transfer-encoding'];
          delete outHeaders['content-length'];
          outHeaders['content-length'] = String(buf.length);
          outHeaders['connection'] = 'close';

          if (shouldBuffer(req.url || '')) {
            console.log(
              `[proxy] ${req.method} ${req.url?.slice(0, 80)}… → ${buf.length} bytes`
            );
          }

          res.writeHead(upRes.statusCode || 502, outHeaders);
          res.end(buf);
        });
      }
    );

    upstream.on('error', (err) => {
      console.error('[proxy] upstream error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain' });
      }
      res.end(`Metro upstream error: ${err.message}`);
    });

    upstream.end(body);
  });
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(
    `[proxy] buffering Metro ${UPSTREAM_HOST}:${UPSTREAM_PORT} → 0.0.0.0:${PROXY_PORT}`
  );
});
