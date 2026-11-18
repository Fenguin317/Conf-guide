import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.js';
import { ConflictError, GitHubError, listHistory, loadContent, readContent, readVersion, storageMode, syncFromGitHub, validateContent, writeContent } from './store.js';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
const BODY_LIMIT = 2 * 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};
// Public pages may be framed by 'self' plus the origins in FRAME_ANCESTORS (space/comma separated, e.g. the applicant portal).
// /admin and /api are never framable.
const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;
export function frameAncestors(env = process.env.FRAME_ANCESTORS || '') {
  const all = env.split(/[\s,]+/).filter(Boolean);
  const bad = all.filter((o) => !ORIGIN_RE.test(o));
  if (bad.length) console.error(`FRAME_ANCESTORS: ignoring ${bad.join(' ')} (need scheme://host[:port], no wildcards)`);
  return ["'self'", ...all.filter((o) => ORIGIN_RE.test(o))].join(' ');
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function sendJson(res, status, obj, headers = {}) {
  res.writeHead(status, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-cache', ...headers });
  res.end(JSON.stringify(obj));
}

function readJson(req) {
  if (Number(req.headers['content-length']) > BODY_LIMIT) return Promise.reject(new HttpError(413, 'body too large'));
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        req.removeAllListeners('data');
        req.pause();
        fail(new HttpError(413, 'body too large'));
      } else chunks.push(c);
    });
    req.on('end', () => {
      try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { fail(new HttpError(400, 'invalid JSON')); }
    });
    req.on('error', fail);
  });
}

const sessionToken = (req) => /(?:^|;\s*)sid=([0-9a-f]+)/.exec(req.headers.cookie || '')?.[1];

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

const ifMatch = (req) => req.headers['if-match']?.replace(/^W\//, '').replace(/"/g, '').trim();

async function handleApi(req, res, path, auth) {
  if ((req.method === 'POST' || req.method === 'PUT') && !sameOrigin(req)) return sendJson(res, 403, { error: 'origin mismatch' });
  const route = `${req.method} ${path}`;

  if (route === 'GET /api/content') return sendJson(res, 200, await readContent());

  if (route === 'POST /api/login') {
    const body = await readJson(req);
    const r = await auth.login(body?.password);
    if (r.status === 503) return sendJson(res, 503, { error: 'admin password not set; run npm run set-password' });
    if (r.status === 401) return sendJson(res, 401, { error: 'wrong password' });
    const secure = req.socket.encrypted || req.headers['x-forwarded-proto']?.split(',')[0].trim() === 'https';
    const cookie = `sid=${r.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? '; Secure' : ''}`;
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie });
  }

  if (route === 'POST /api/logout') {
    auth.logout(sessionToken(req));
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (route === 'GET /api/me') {
    return auth.check(sessionToken(req)) ? sendJson(res, 200, { ok: true }) : sendJson(res, 401, { error: 'not logged in' });
  }

  const admin = ['GET /api/admin/content', 'PUT /api/content', 'GET /api/history', 'POST /api/restore'];
  if (admin.includes(route) && !auth.check(sessionToken(req))) return sendJson(res, 401, { error: 'not logged in' });

  if (route === 'GET /api/admin/content') {
    const { content, version } = await loadContent();
    return sendJson(res, 200, content, { ETag: `"${version}"` });
  }

  if (route === 'GET /api/history') return sendJson(res, 200, await listHistory());

  if (route === 'PUT /api/content' || route === 'POST /api/restore') {
    const base = ifMatch(req);
    if (!base) return sendJson(res, 428, { error: 'If-Match header required (reload the editor)' });
    const body = await readJson(req);
    let content = body;
    let message = '수정';
    if (route === 'POST /api/restore') {
      content = await readVersion(body?.id);
      if (!content) return sendJson(res, 404, { error: 'unknown history entry' });
      message = `복구 ← ${String(body.id).slice(0, 12)}`;
    }
    const errors = validateContent(content);
    if (errors.length) return sendJson(res, 400, { error: 'invalid content', errors });
    const version = await writeContent(content, { base, message });
    return sendJson(res, 200, { ok: true }, { ETag: `"${version}"` });
  }

  sendJson(res, 404, { error: 'not found' });
}

async function serveStatic(req, res, path, ancestors) {
  const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); };
  let rel;
  try { rel = decodeURIComponent(path); } catch { return notFound(); }
  if (rel.includes('\0')) return notFound();
  if (rel === '/admin' || rel === '/admin/') rel = '/admin/index.html';
  else if (!extname(rel)) rel = '/index.html';

  const file = resolve(PUBLIC, '.' + rel);
  if (!file.startsWith(PUBLIC + sep)) return notFound();
  try {
    if (!(await stat(file)).isFile()) return notFound();
  } catch {
    return notFound();
  }
  const ext = extname(file).toLowerCase();
  const data = await readFile(file);
  // decided on the resolved file, so encoded or ../ paths to /admin stay unframable
  if (file === join(PUBLIC, 'index.html')) {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', `frame-ancestors ${ancestors}`);
  }
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=86400' : 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

export function createServer({ auth = createAuth() } = {}) {
  const ancestors = frameAncestors();
  const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const path = req.url.split('?')[0];
    // deny framing by default; serveStatic re-allows it only for the public shell (index.html)
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    try {
      if (path === '/api' || path.startsWith('/api/')) await handleApi(req, res, path, auth);
      else if (req.method === 'GET' || req.method === 'HEAD') await serveStatic(req, res, path, ancestors);
      else sendJson(res, 405, { error: 'method not allowed' });
    } catch (e) {
      if (e instanceof ConflictError) return sendJson(res, 412, { error: 'conflict: someone else saved first' });
      if (e instanceof GitHubError) {
        console.error(e);
        return sendJson(res, 502, { error: `GitHub 저장소 오류 (${e.message})` });
      }
      if (!(e instanceof HttpError)) console.error(e);
      if (res.headersSent) return res.destroy();
      sendJson(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'internal error' }, e.status === 413 ? { Connection: 'close' } : {});
    }
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3061;
  const auth = createAuth();
  console.log(`content storage: ${storageMode()}`);
  // a failed sync still serves the deployed copy; admin saves will then fail loudly instead of overwriting
  await syncFromGitHub().catch((e) => console.error('GitHub sync failed at startup:', e.message));
  createServer({ auth }).listen(port, '0.0.0.0', async () => {
    console.log(`isaiah61-guide listening on http://localhost:${port}`);
    const source = await auth.passwordSource();
    console.log(source ? `admin password: ${source}` : 'admin password not set; admin login disabled. Run: npm run set-password');
  });
}
