import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword, createAuth } from '../server/auth.js';
import { summarizeChange, syncFromGitHub, validateContent } from '../server/store.js';
import { createServer, frameAncestors } from '../server/index.js';

const DATA = fileURLToPath(new URL('../data', import.meta.url));
const loadContent = async () => JSON.parse(await readFile(join(DATA, 'content.json'), 'utf8'));

test('hash/verify roundtrip and wrong password', async () => {
  const h = await hashPassword('correct horse');
  assert.match(h, /^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/);
  assert.equal(await verifyPassword('correct horse', h), true);
  assert.equal(await verifyPassword('wrong horse', h), false);
});

test('sessions expire after 12h', async () => {
  let t = 1_000_000;
  const auth = createAuth({ password: 'testpass1234', now: () => t });
  const { status, token } = await auth.login('testpass1234');
  assert.equal(status, 200);
  assert.equal(auth.check(token), true);
  t += 12 * 3600_000;
  assert.equal(auth.check(token), false);
});

test('ADMIN_PASSWORD shorter than 12 characters is rejected', () => {
  assert.throws(() => createAuth({ password: 'short-pass1' }), /at least 12/);
});

test('validateContent accepts data/content.json', async () => {
  assert.deepEqual(validateContent(await loadContent()), []);
});

test('validateContent rejects bad content', async () => {
  const cases = {
    'bad slug': (c) => { c.pages['Bad Slug'] = c.pages.faq; },
    'dangling section page ref': (c) => { c.sections[0].pages.push('nope'); },
    'javascript: href': (c) => { c.footer.links[0].href = 'javascript:alert(1)'; },
    'image src outside /assets': (c) => { c.pages.faq.blocks.push({ type: 'image', src: '/etc/x.png', alt: { ko: 'x' } }); },
    'image src with ..': (c) => { c.pages.faq.blocks.push({ type: 'image', src: '/assets/../server/auth.js', alt: { ko: 'x' } }); },
    'unknown block type': (c) => { c.pages.faq.blocks.push({ type: 'video' }); },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const c = await loadContent();
    mutate(c);
    assert.notEqual(validateContent(c).length, 0, name);
  }
});

function request(port, method, path, { body, headers = {} } = {}) {
  return new Promise((ok, fail) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: { 'Content-Type': 'application/json', ...headers } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', fail);
    req.end(data);
  });
}

test('HTTP integration', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'i61-'));
  await cp(DATA, dir, { recursive: true });
  process.env.DATA_DIR = dir;
  process.env.ADMIN_PASSWORD = 'testpass1234';
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  t.after(async () => {
    server.close();
    delete process.env.DATA_DIR;
    delete process.env.ADMIN_PASSWORD;
    await rm(dir, { recursive: true, force: true });
  });
  const req = (method, path, opts) => request(port, method, path, opts);
  const content = await loadContent();

  const get = await req('GET', '/api/content');
  assert.equal(get.status, 200);
  assert.deepEqual(JSON.parse(get.text), content);

  assert.equal((await req('PUT', '/api/content', { body: content })).status, 401);

  const ok = await req('POST', '/api/login', { body: { password: 'testpass1234' } });
  assert.equal(ok.status, 200);
  const cookie = ok.headers['set-cookie'][0];
  assert.match(cookie, /^sid=[0-9a-f]{64}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200$/);
  const sid = cookie.split(';')[0];
  assert.equal((await req('GET', '/api/me', { headers: { Cookie: sid } })).status, 200);

  // no lockout: repeated failures must never block the real admin (ISSUE-002)
  for (let i = 1; i <= 6; i++) assert.equal((await req('POST', '/api/login', { body: { password: 'nope' } })).status, 401);
  assert.equal((await req('POST', '/api/login', { body: { password: 'testpass1234' } })).status, 200);

  assert.equal((await req('GET', '/api/admin/content')).status, 401);
  assert.equal((await req('GET', '/api/history')).status, 401);
  assert.equal((await req('POST', '/api/restore', { body: { id: 'x' } })).status, 401);
  const loaded = await req('GET', '/api/admin/content', { headers: { Cookie: sid } });
  const v1 = loaded.headers.etag;
  assert.match(v1, /^"[0-9a-f]+"$/);

  const edited = structuredClone(content);
  edited.meta.updated = '2027-01-01';
  assert.equal((await req('PUT', '/api/content', { body: edited, headers: { Cookie: sid } })).status, 428);
  const saved = await req('PUT', '/api/content', { body: edited, headers: { Cookie: sid, 'If-Match': v1 } });
  assert.equal(saved.status, 200);
  assert.notEqual(saved.headers.etag, v1);
  assert.equal(JSON.parse(await readFile(join(dir, 'content.json'), 'utf8')).meta.updated, '2027-01-01');
  assert.ok((await readdir(join(dir, 'backups'))).some((f) => /^content-.*\.json$/.test(f)));

  // a second admin still holding v1 must not overwrite the save above
  const stale = structuredClone(content);
  stale.meta.updated = '1999-01-01';
  assert.equal((await req('PUT', '/api/content', { body: stale, headers: { Cookie: sid, 'If-Match': v1 } })).status, 412);
  assert.equal(JSON.parse(await readFile(join(dir, 'content.json'), 'utf8')).meta.updated, '2027-01-01');

  // history → restore the pre-save copy; the current copy becomes a new backup
  const history = JSON.parse((await req('GET', '/api/history', { headers: { Cookie: sid } })).text);
  assert.equal(history.length, 1);
  assert.ok(!Number.isNaN(Date.parse(history[0].date)));
  assert.equal((await req('POST', '/api/restore', { body: { id: '../content.json' }, headers: { Cookie: sid, 'If-Match': saved.headers.etag } })).status, 404);
  assert.equal((await req('POST', '/api/restore', { body: { id: history[0].id }, headers: { Cookie: sid, 'If-Match': v1 } })).status, 412);
  const restored = await req('POST', '/api/restore', { body: { id: history[0].id }, headers: { Cookie: sid, 'If-Match': saved.headers.etag } });
  assert.equal(restored.status, 200);
  assert.deepEqual(JSON.parse((await req('GET', '/api/content')).text), content);
  assert.equal(JSON.parse((await req('GET', '/api/history', { headers: { Cookie: sid } })).text).length, 2);

  const bad = structuredClone(content);
  bad.pages.faq.blocks.push({ type: 'video' });
  const badRes = await req('PUT', '/api/content', { body: bad, headers: { Cookie: sid, 'If-Match': restored.headers.etag } });
  assert.equal(badRes.status, 400);
  assert.ok(JSON.parse(badRes.text).errors.length > 0);

  for (const p of ['/../server/auth.js', '/%2e%2e/server/auth.js', '/..%2fserver/auth.js']) {
    const r = await req('GET', p);
    assert.doesNotMatch(r.text, /timingSafeEqual/, p);
  }

  const cross = await req('PUT', '/api/content', { body: content, headers: { Cookie: sid, Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);

  const same = await req('GET', '/api/content', { headers: { Origin: `http://127.0.0.1:${port}` } });
  assert.equal(same.status, 200);
  assert.equal(same.headers['x-frame-options'], 'DENY');
  assert.equal(same.headers['content-security-policy'], "frame-ancestors 'none'");
});

test('frame headers: public pages framable by allowed origins only, admin never', async (t) => {
  process.env.FRAME_ANCESTORS = 'https://portal.example, *, https://dev.portal.example:8443';
  const server = createServer({ auth: createAuth({ password: 'testpass1234' }) });
  delete process.env.FRAME_ANCESTORS;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const { port } = server.address();
  for (const p of ['/', '/index.html', '/faq']) {
    const r = await request(port, 'GET', p);
    assert.equal(r.headers['x-frame-options'], undefined, p);
    assert.equal(r.headers['content-security-policy'], "frame-ancestors 'self' https://portal.example https://dev.portal.example:8443", p);
  }
  for (const p of ['/admin', '/admin/', '/admin/index.html', '/%61dmin/', '/admin%2f', '/x/../admin/index.html', '/ADMIN/index.html', '/app.js', '/api/content']) {
    const r = await request(port, 'GET', p);
    assert.equal(r.headers['x-frame-options'], 'DENY', p);
    assert.equal(r.headers['content-security-policy'], "frame-ancestors 'none'", p);
  }
  assert.equal(frameAncestors(''), "'self'");
  assert.equal(frameAncestors('*'), '*');
  assert.equal(frameAncestors('https://*.example javascript:x'), "'self'");
});

test('summarizeChange names changed keys and pages, ignores meta', () => {
  const a = { meta: { updated: '1' }, event: { x: 1 }, pages: { faq: { t: 1 }, home: { t: 1 } } };
  const b = { meta: { updated: '2' }, event: { x: 2 }, pages: { faq: { t: 2 }, home: { t: 1 }, new: {} } };
  assert.equal(summarizeChange(a, b), 'event, pages.faq, pages.new');
});

// Minimal stand-in for the GitHub contents/commits API: one file, sha-checked writes.
function fakeGitHub(initial) {
  const commits = [];
  const sha = (text) => createHash('sha1').update(text).digest('hex');
  const commit = (text, message) => commits.unshift({ sha: sha(text + commits.length), blob: sha(text), text, message, date: new Date().toISOString() });
  commit(initial, 'init');
  const state = { fail: 0, puts: 0 };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.headers.authorization !== 'Bearer tok') return send(401, { message: 'Bad credentials' });
      if (state.fail) return send(state.fail, { message: 'boom' });
      const u = new URL(req.url, 'http://x');
      if (u.pathname !== '/repos/o/r/contents/data/content.json' && u.pathname !== '/repos/o/r/commits') return send(404, { message: 'Not Found' });
      if (req.method === 'GET' && u.pathname.endsWith('/commits')) {
        return send(200, commits.map((c) => ({ sha: c.sha, html_url: `https://github.com/o/r/commit/${c.sha}`, commit: { message: c.message, committer: { date: c.date } } })));
      }
      if (req.method === 'GET') {
        const ref = u.searchParams.get('ref');
        const c = ref === 'main' ? commits[0] : commits.find((x) => x.sha === ref);
        if (!c) return send(404, { message: 'No commit found' });
        return send(200, { sha: c.blob, content: Buffer.from(c.text).toString('base64') });
      }
      const b = JSON.parse(body);
      if (b.sha !== commits[0].blob) return send(409, { message: 'is at x but expected y' });
      state.puts++;
      commit(Buffer.from(b.content, 'base64').toString('utf8'), b.message);
      send(200, { content: { sha: commits[0].blob } });
    });
  });
  return { server, commits, state };
}

test('GitHub storage: save, conflict, failure, history, restore', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'i61-gh-'));
  await cp(DATA, dir, { recursive: true });
  const content = await loadContent();
  const remote = structuredClone(content);
  remote.meta.updated = '2030-01-01'; // GitHub newer than the deployed file
  const gh = fakeGitHub(JSON.stringify(remote, null, 2) + '\n');
  await new Promise((r) => gh.server.listen(0, '127.0.0.1', r));
  Object.assign(process.env, { DATA_DIR: dir, GITHUB_TOKEN: 'tok', GITHUB_REPO: 'o/r', GITHUB_API: `http://127.0.0.1:${gh.server.address().port}` });
  const server = createServer({ auth: createAuth({ password: 'testpass1234' }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    server.close();
    gh.server.close();
    for (const k of ['DATA_DIR', 'GITHUB_TOKEN', 'GITHUB_REPO', 'GITHUB_API']) delete process.env[k];
    await rm(dir, { recursive: true, force: true });
  });
  const { port } = server.address();
  const req = (method, path, opts) => request(port, method, path, opts);
  const cache = async () => JSON.parse(await readFile(join(dir, 'content.json'), 'utf8'));
  const sid = (await req('POST', '/api/login', { body: { password: 'testpass1234' } })).headers['set-cookie'][0].split(';')[0];
  const H = (etag) => ({ Cookie: sid, 'If-Match': etag });

  await syncFromGitHub();
  assert.equal((await cache()).meta.updated, '2030-01-01');

  const v1 = (await req('GET', '/api/admin/content', { headers: { Cookie: sid } })).headers.etag;
  const edited = structuredClone(remote);
  edited.event.dates.ko = '바뀐 날짜';
  const saved = await req('PUT', '/api/content', { body: edited, headers: H(v1) });
  assert.equal(saved.status, 200);
  assert.match(gh.commits[0].message, /^admin: 수정 \(event\) \[skip render\]$/);
  assert.equal((await cache()).event.dates.ko, '바뀐 날짜');

  assert.equal((await req('PUT', '/api/content', { body: remote, headers: H(v1) })).status, 412);
  assert.equal(gh.state.puts, 1);

  gh.state.fail = 500;
  const failed = await req('PUT', '/api/content', { body: remote, headers: H(saved.headers.etag) });
  gh.state.fail = 0;
  assert.equal(failed.status, 502);
  assert.equal((await cache()).event.dates.ko, '바뀐 날짜', 'failed GitHub write must not touch the cache');

  const history = JSON.parse((await req('GET', '/api/history', { headers: { Cookie: sid } })).text);
  assert.deepEqual(history.map((h) => h.message), ['admin: 수정 (event)', 'init']);
  assert.equal((await req('POST', '/api/restore', { body: { id: 'not-a-sha' }, headers: H(saved.headers.etag) })).status, 404);
  assert.equal((await req('POST', '/api/restore', { body: { id: 'f'.repeat(40) }, headers: H(saved.headers.etag) })).status, 404);
  const restored = await req('POST', '/api/restore', { body: { id: history[1].id }, headers: H(saved.headers.etag) });
  assert.equal(restored.status, 200);
  assert.deepEqual(JSON.parse((await req('GET', '/api/content')).text), remote);
  assert.equal(gh.commits.length, 3, 'restore is a new commit; the pre-restore version stays in history');

  // repo set but token missing: saves must fail visibly, not silently land on a wiped disk
  delete process.env.GITHUB_TOKEN;
  assert.equal((await req('PUT', '/api/content', { body: remote, headers: H('x') })).status, 502);
  assert.deepEqual(JSON.parse((await req('GET', '/api/content')).text), remote, 'public site still served');
});
