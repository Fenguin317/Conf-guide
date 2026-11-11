import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDir } from './store.js';

const scrypt = promisify(scryptCb);
const N = 16384, R = 8, P = 1, KEYLEN = 32;
const SESSION_TTL = 12 * 3600_000;
// No login lockout (it let anyone lock the admin out behind a proxy), so a long password is the brute-force defense.
export const MIN_PASSWORD = 12;

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw, stored) {
  const [alg, n, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p });
  return timingSafeEqual(key, expected);
}

export const adminFile = () => join(dataDir(), 'admin.json');

// password: plaintext from env (hashed once, kept in memory); otherwise <data>/admin.json is read per login.
export function createAuth({ password = process.env.ADMIN_PASSWORD, now = Date.now } = {}) {
  if (password && password.length < MIN_PASSWORD) throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD} characters`);
  const envHash = password ? hashPassword(password) : null;
  const sessions = new Map(); // token -> expiry ms

  async function getHash() {
    if (envHash) return envHash;
    try {
      return JSON.parse(await readFile(adminFile(), 'utf8')).hash || null;
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  return {
    async passwordSource() {
      return envHash ? 'ADMIN_PASSWORD env' : (await getHash()) ? adminFile() : null;
    },

    // -> { status: 200, token } | { status: 401 | 503 }
    async login(pw) {
      const hash = await getHash();
      if (!hash) return { status: 503 };
      if (typeof pw !== 'string' || !(await verifyPassword(pw, hash))) return { status: 401 };
      const token = randomBytes(32).toString('hex');
      sessions.set(token, now() + SESSION_TTL);
      return { status: 200, token };
    },

    check(token) {
      const t = now();
      for (const [k, exp] of sessions) if (exp <= t) sessions.delete(k);
      return !!token && sessions.has(token);
    },

    logout(token) {
      sessions.delete(token);
    },
  };
}
