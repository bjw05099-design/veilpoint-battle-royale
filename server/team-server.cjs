'use strict';
// Local-only, zero-dependency HTTP proof of a server-owned 2-client team round.
// Do not expose this prototype directly to the public internet.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {TeamMatch, STEP} = require('../src/team-match.cjs');
function createTeamServer({host = '127.0.0.1', port = 8765, autoTick = true, now} = {}) {
  // This proof must never silently bind to a publicly reachable interface.
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new RangeError('loopback_host_required');
  const match = new TeamMatch({now});
  const send = (res, status, value) => {
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin', 'X-Frame-Options': 'DENY'});
    res.end(JSON.stringify(value));
  };
  const readJson = req => new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    let bytes = 0;
    req.on('data', chunk => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > 2048) {tooLarge = true;body = '';return;}
      body += chunk;
    });
    req.on('end', () => {
      if (tooLarge) return reject(new RangeError('body_too_large'));
      try {resolve(JSON.parse(body));} catch {reject(new RangeError('invalid_json'));}
    });
    req.on('error', reject);
  });
  const server = http.createServer(async (req, res) => {
    try {
      const origin = req.headers.origin;
      // Reject DNS-rebinding/Host-spoofing requests even when Origin matches forged Host.
      const authority = String(req.headers.host || '');
      if (!/^(?:127\.0\.0\.1|localhost|\[::1\]):[0-9]{1,5}$/.test(authority) ||
          Number(authority.slice(authority.lastIndexOf(':') + 1)) !== server.address().port)
        return send(res, 403, {error: 'invalid_host'});
      // Scheme, host and port must match; malformed/opaque origins fail closed.
      if (origin) {
        try {
          if (new URL(origin).origin !== new URL('http://' + req.headers.host).origin)
            return send(res, 403, {error: 'cross_origin'});
        } catch {
          return send(res, 403, {error: 'cross_origin'});
        }
      }
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/team-client.js')) {
        const isScript = url.pathname === '/team-client.js';
        const file = path.join(__dirname, '..', isScript ? 'src/team-client.js' : 'team.html');
        const body = await fs.readFile(file);
        res.writeHead(200, {'Content-Type': isScript ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Cross-Origin-Resource-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'"});
        return res.end(body);
      }
      if (req.method === 'GET' && url.pathname === '/health')
        return send(res, 200, {status: 'ok', protocol: 1, phase: match.phase});
      if (req.method === 'GET' && url.pathname === '/state')
        return send(res, 200, match.snapshot(req.headers['x-player-token']));
      if (req.method === 'POST' && ['/join', '/command'].includes(url.pathname)) {
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(String(req.headers['content-type'] || '')))
          return send(res, 415, {error: 'json_required'});
        const body = await readJson(req);
        if (url.pathname === '/join') {
          if (!body || Object.keys(body).length !== 1 || typeof body.name !== 'string')
            throw new RangeError('invalid_join');
          const token = crypto.randomBytes(24).toString('hex');
          const player = match.join(token, body.name);
          return send(res, 201, {token, ...player});
        }
        const result = match.command(req.headers['x-player-token'], body);
        // The server resolves hits authoritatively, but a remote client must
        // not receive an omniscient hit-confirmation bit from the API.
        if (body.type === 'fire' && result.ok) return send(res, 200, {ok: true, ammo: result.ammo});
        return send(res, 200, result);
      }
      send(res, 404, {error: 'not_found'});
    } catch (err) {
      send(res, err instanceof RangeError ? (err.message === 'body_too_large' ? 413 : 400) : 500,
        {error: err instanceof RangeError ? err.message : 'internal_error'});
    }
  });
  let timer;
  return {
    match,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      if (autoTick) {timer = setInterval(() => match.step(), STEP * 1000);timer.unref();}
      return server.address();
    },
    async close() {if (timer) clearInterval(timer);await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));}
  };
}
if (require.main === module) {
  createTeamServer().listen().then(addr => {
    process.stdout.write(`VEILPOINT local team prototype listening at http://${addr.address}:${addr.port}\n`);
    process.stdout.write('Open the displayed URL in two separate browser tabs to test the team round.\n');
  }).catch(err => {console.error(err);process.exitCode = 1;});
}
module.exports = {createTeamServer};
