import { readFile, copyFile, mkdir, open, rename, readdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const KEEP_BACKUPS = 20;
const BLOCK_TYPES = ['text', 'heading', 'info', 'list', 'table', 'accordion', 'image', 'copy', 'links', 'people'];

export const dataDir = () => resolve(process.env.DATA_DIR || fileURLToPath(new URL('../data', import.meta.url)));
const contentFile = () => join(dataDir(), 'content.json');

export async function readContent() {
  return JSON.parse(await readFile(contentFile(), 'utf8'));
}

export async function writeContent(obj) {
  const dir = dataDir();
  const backups = join(dir, 'backups');
  await mkdir(backups, { recursive: true });
  try {
    await copyFile(contentFile(), join(backups, `content-${new Date().toISOString().replace(/:/g, '-')}.json`));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  // ISO names sort chronologically
  const old = (await readdir(backups)).filter((f) => /^content-.*\.json$/.test(f)).sort().slice(0, -KEEP_BACKUPS);
  await Promise.all(old.map((f) => unlink(join(backups, f))));

  const tmp = join(dir, `.content-${randomBytes(6).toString('hex')}.tmp`);
  const fh = await open(tmp, 'w');
  try {
    await fh.writeFile(JSON.stringify(obj, null, 2) + '\n');
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, contentFile());
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
