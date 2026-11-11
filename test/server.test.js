import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword, createAuth } from '../server/auth.js';
import { validateContent } from '../server/store.js';
import { createServer } from '../server/index.js';

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

  const edited = structuredClone(content);
  edited.meta.updated = '2027-01-01';
  assert.equal((await req('PUT', '/api/content', { body: edited, headers: { Cookie: sid } })).status, 200);
  assert.equal(JSON.parse(await readFile(join(dir, 'content.json'), 'utf8')).meta.updated, '2027-01-01');
  assert.ok((await readdir(join(dir, 'backups'))).some((f) => /^content-.*\.json$/.test(f)));

  const bad = structuredClone(content);
  bad.pages.faq.blocks.push({ type: 'video' });
  const badRes = await req('PUT', '/api/content', { body: bad, headers: { Cookie: sid } });
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
});
