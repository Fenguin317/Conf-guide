import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import { hashPassword, adminFile, MIN_PASSWORD } from './auth.js';
import { dataDir } from './store.js';

function askHidden(question) {
  return new Promise((ok) => {
    const { stdin, stdout } = process;
    let pw = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return ok(pw);
        }
        if (ch === '\u0003') { stdin.setRawMode(false); stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') pw = pw.slice(0, -1);
        else pw += ch;
      }
    };
    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

let pw;
if (process.stdin.isTTY) {
  pw = await askHidden('New admin password: ');
  if (pw !== (await askHidden('Repeat password: '))) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
} else {
  pw = (await text(process.stdin)).split(/\r?\n/)[0];
}
if (pw.length < MIN_PASSWORD) {
  console.error(`Password must be at least ${MIN_PASSWORD} characters.`);
  process.exit(1);
}

await mkdir(dataDir(), { recursive: true });
await writeFile(adminFile(), JSON.stringify({ hash: await hashPassword(pw) }) + '\n', { mode: 0o600 });
await chmod(adminFile(), 0o600); // mode above only applies when the file is new
console.log(`Saved password hash to ${adminFile()}`);
