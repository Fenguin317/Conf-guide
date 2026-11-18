import { readFile, copyFile, mkdir, open, rename, readdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const KEEP_BACKUPS = 20;
const BLOCK_TYPES = ['text', 'heading', 'info', 'list', 'table', 'accordion', 'image', 'copy', 'links', 'people'];
const GH_PATH = 'data/content.json';

export const dataDir = () => resolve(process.env.DATA_DIR || fileURLToPath(new URL('../data', import.meta.url)));
const contentFile = () => join(dataDir(), 'content.json');
const serialize = (obj) => JSON.stringify(obj, null, 2) + '\n';

export class ConflictError extends Error {}
export class GitHubError extends Error {
  constructor(status, message) { super(`GitHub ${status}: ${message}`); this.status = status; }
}

// GitHub mode when GITHUB_TOKEN + GITHUB_REPO are set: GitHub is the source of truth and its commits are the
// backups/history; data/content.json is only the cache the public site reads. Otherwise local file + data/backups/.
const gh = () => {
  const { GITHUB_TOKEN: token, GITHUB_REPO: repo } = process.env;
  if (!token && !repo) return null;
  // half-configured: fail admin saves loudly rather than fall back to a disk Render wipes
  if (!token || !repo) throw new GitHubError('config', 'GITHUB_TOKEN and GITHUB_REPO must both be set');
  return { api: process.env.GITHUB_API || 'https://api.github.com', repo, branch: process.env.GITHUB_BRANCH || 'main', token };
};
export function storageMode() {
  try {
    const g = gh();
    return g ? `github ${g.repo}@${g.branch}` : `local ${dataDir()}`;
  } catch (e) {
    return `BROKEN (${e.message}); admin saves will fail`;
  }
}

async function ghFetch(g, method, path, body) {
  const r = await fetch(`${g.api}/repos/${g.repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${g.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => { throw new GitHubError('unreachable', e.message); });
  const json = await r.json().catch(() => ({}));
  if (r.status === 409) throw new ConflictError('content changed since it was loaded');
  if (!r.ok) throw new GitHubError(r.status, json.message || r.statusText);
  return json;
}

// shortcut: the contents API only inlines files up to 1 MB (content.json is ~60 KB); switch to the raw media type if it grows past that.
async function ghRead(g, ref) {
  const f = await ghFetch(g, 'GET', `/contents/${GH_PATH}?ref=${encodeURIComponent(ref)}`);
  return { content: JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')), version: f.sha };
}

async function atomicWrite(file, text) {
  const tmp = join(dataDir(), `.content-${randomBytes(6).toString('hex')}.tmp`);
  const fh = await open(tmp, 'w');
  try {
    await fh.writeFile(text);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, file);
}

// Public read path: always the local file (in GitHub mode, the cache).
export async function readContent() {
  return JSON.parse(await readFile(contentFile(), 'utf8'));
}

const localVersion = (text) => createHash('sha256').update(text).digest('hex').slice(0, 20);

// Admin read path: latest content plus the version a later save must be based on.
// Never writes the cache: a read racing a save could put older content back on the public site.
export async function loadContent() {
  const g = gh();
  if (g) return ghRead(g, g.branch);
  const text = await readFile(contentFile(), 'utf8');
  return { content: JSON.parse(text), version: localVersion(text) };
}

// Pull GitHub's copy into the cache at startup (Render's free disk resets to the deployed file on restart).
export async function syncFromGitHub() {
  const g = gh();
  if (g) await atomicWrite(contentFile(), serialize((await ghRead(g, g.branch)).content));
}

// "event, pages.faq" — which top-level keys / pages differ, for the history list.
export function summarizeChange(prev, next) {
  const changed = [];
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);
  for (const k of keys) {
    if (k === 'pages') {
      const slugs = new Set([...Object.keys(prev?.pages ?? {}), ...Object.keys(next?.pages ?? {})]);
      for (const s of slugs) if (JSON.stringify(prev?.pages?.[s]) !== JSON.stringify(next?.pages?.[s])) changed.push(`pages.${s}`);
    } else if (k !== 'meta' && JSON.stringify(prev?.[k]) !== JSON.stringify(next?.[k])) changed.push(k);
  }
  return changed.join(', ');
}

// One write at a time, so the version check and the write cannot interleave.
let queue = Promise.resolve();
const serial = (fn) => {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
};

// Saves only if the stored version still equals `base`; returns the new version. Throws ConflictError otherwise.
export function writeContent(obj, { base, message = '수정' } = {}) {
  return serial(async () => {
    const text = serialize(obj);
    const g = gh();
    if (g) {
      const prev = await readContent().catch(() => null);
      const summary = summarizeChange(prev, obj);
      const r = await ghFetch(g, 'PUT', `/contents/${GH_PATH}`, {
        // [skip render] keeps Render from redeploying on every admin save; the running server already has the new cache.
        message: `admin: ${message}${summary ? ` (${summary})` : ''} [skip render]`,
        content: Buffer.from(text).toString('base64'),
        sha: base,
        branch: g.branch,
      });
      await atomicWrite(contentFile(), text);
      return r.content.sha;
    }

    let current = null;
    try { current = await readFile(contentFile(), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (current !== null && localVersion(current) !== base) throw new ConflictError('content changed since it was loaded');
    const backups = join(dataDir(), 'backups');
    await mkdir(backups, { recursive: true });
    if (current !== null) await copyFile(contentFile(), join(backups, `content-${new Date().toISOString().replace(/:/g, '-')}.json`));
    // ISO names sort chronologically
    const old = (await readdir(backups)).filter((f) => BACKUP_RE.test(f)).sort().slice(0, -KEEP_BACKUPS);
    await Promise.all(old.map((f) => unlink(join(backups, f))));
    await atomicWrite(contentFile(), text);
    return localVersion(text);
  });
}

const BACKUP_RE = /^content-[0-9T.Z-]+\.json$/;
const SHA_RE = /^[0-9a-f]{40}$/;

// Newest first: [{ id, date, message, url? }]. Each id can be passed to readVersion / restore.
export async function listHistory() {
  const g = gh();
  if (g) {
    const commits = await ghFetch(g, 'GET', `/commits?path=${GH_PATH}&sha=${encodeURIComponent(g.branch)}&per_page=30`);
    return commits.map((c) => ({
      id: c.sha,
      date: c.commit.committer?.date ?? c.commit.author?.date,
      message: c.commit.message.split('\n')[0].replace(' [skip render]', ''),
      url: c.html_url,
    }));
  }
  let files = [];
  try { files = (await readdir(join(dataDir(), 'backups'))).filter((f) => BACKUP_RE.test(f)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  // a backup holds the content as it was just before that save
  return files.sort().reverse().map((f) => ({
    id: f,
    date: f.slice(8, -5).replace(/T(\d\d)-(\d\d)-(\d\d)/, 'T$1:$2:$3'),
    message: '이 시점 저장 직전 백업',
  }));
}

// Content at a history id; null when the id is not a valid history entry.
export async function readVersion(id) {
  const g = gh();
  if (g) {
    if (!SHA_RE.test(id ?? '')) return null;
    try {
      return (await ghRead(g, id)).content;
    } catch (e) {
      if (e instanceof GitHubError && (e.status === 404 || e.status === 422)) return null;
      throw e;
    }
  }
  if (!BACKUP_RE.test(id ?? '')) return null;
  try {
    return JSON.parse(await readFile(join(dataDir(), 'backups', id), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

// Returns a list of "path: problem" strings; empty means valid.
export function validateContent(c) {
  const errs = [];
  const err = (p, m) => { errs.push(`${p}: ${m}`); };
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const opt = (fn) => (v, p) => { if (v !== undefined) fn(v, p); };

  const str = (v, p) => { if (typeof v !== 'string') err(p, 'must be a string'); };
  const oneOf = (...vals) => (v, p) => { if (!vals.includes(v)) err(p, `must be one of ${vals.join(', ')}`); };
  const L = (v, p) => {
    if (!isObj(v) || typeof v.ko !== 'string') return err(p, 'must be {ko, en, zh} with a string ko');
    for (const k of ['en', 'zh']) if (k in v && typeof v[k] !== 'string') err(`${p}.${k}`, 'must be a string');
  };
  const src = (v, p) => {
    if (typeof v !== 'string' || !v.startsWith('/assets/') || v.includes('..')) err(p, 'must be a path under /assets/');
  };
  const href = (v, p) => {
    if (typeof v !== 'string' || !/^(https:\/\/|http:\/\/|mailto:|tel:|#\/)/.test(v)) err(p, 'must start with https://, http://, mailto:, tel: or #/');
  };
  const arr = (each) => (v, p) => {
    if (!Array.isArray(v)) return err(p, 'must be an array');
    v.forEach((x, i) => each(x, `${p}[${i}]`));
  };
  // fields: { key: checker }, checks each key of an object
  const obj = (fields) => (v, p) => {
    if (!isObj(v)) return err(p, 'must be an object');
    for (const [k, check] of Object.entries(fields)) check(v[k], `${p}.${k}`);
  };

  const pages = isObj(c?.pages) ? c.pages : {};
  const pageRef = (v, p) => { if (typeof v !== 'string' || !Object.hasOwn(pages, v)) err(p, `unknown page "${v}"`); };

  const blockFields = {
    text: { body: L },
    heading: { text: L },
    info: { title: opt(L), body: L },
    list: { items: arr(L) },
    table: { head: arr(L), rows: arr(arr(L)) },
    accordion: { items: arr(obj({ q: L, a: L })) },
    image: { src, alt: L, caption: opt(L) },
    copy: { label: L, value: str },
    links: { items: arr(obj({ label: L, href })) },
    people: { items: arr(obj({ name: L, role: L, photo: opt(src) })) },
  };
  const block = (b, p) => {
    if (!isObj(b) || !BLOCK_TYPES.includes(b.type)) return err(`${p}.type`, `must be one of ${BLOCK_TYPES.join(', ')}`);
    obj(blockFields[b.type])(b, p);
  };

  // required top-level keys (meta, event, sections, pages, footer) are enforced by their checkers below
  if (!isObj(c)) return ['content: must be an object'];

  obj({ updated: opt(str), theme: oneOf('g2a', 'apple'), title: L, subtitle: L })(c.meta, 'meta');
  obj({
    dates: L, venue: L, address: L, theme: L, verse: L,
    days: arr(obj({ label: str, title: L })),
    poster: src,
    cta: arr(obj({ label: L, href, style: oneOf('primary', 'outline') })),
  })(c.event, 'event');

  opt(obj({ title: L, body: L }))(c.notice, 'notice');
  opt(arr(obj({ page: pageRef, icon: str })))(c.quick, 'quick');
  opt(obj({ title: L, items: arr(L) }))(c.remember, 'remember');
  arr(obj({ id: str, title: L, badge: opt(L), pages: arr(pageRef) }))(c.sections, 'sections');

  if (!isObj(c.pages)) err('pages', 'must be an object');
  for (const [slug, page] of Object.entries(pages)) {
    if (!/^[a-z0-9-]+$/.test(slug)) err(`pages.${slug}`, 'slug must match [a-z0-9-]+');
    obj({ icon: str, title: L, subtitle: L, eyebrow: L, cover: opt(src), blocks: arr(block) })(page, `pages.${slug}`);
  }

  obj({ contact: L, links: arr(obj({ label: str, href })), email: str })(c.footer, 'footer');
  return errs;
}
