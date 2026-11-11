# filemap

- `CLAUDE.md`: commands and rules for agents
- `QUESTIONS.md`: open decisions and the defaults applied
- `docs/SPEC.md`: goals, schema, API, definition of done
- `docs/DESIGN.md`: markup contract and theme A/B specs
- `docs/PLAN.md`: task list and status
- `docs/reference/`: G2A/Notion reference screenshots and scraped Notion text (`notion/`)
- `public/assets/poster.jpg`: conference poster (hero image, font/palette source)
- `data/`: `content.json` (committed); `admin.json` and `backups/` are gitignored
- `server/index.js`: HTTP server (`createServer()`): static `public/`, SPA fallback, `/api/*` routes, security headers
- `server/auth.js`: scrypt hash/verify, in-memory sessions, login rate limit (`createAuth()`)
- `server/store.js`: `DATA_DIR`, read/validate/atomic-write `content.json`, backups (newest 20)
- `server/set-password.js`: `npm run set-password` prompt → `data/admin.json`
- `public/`: guide frontend; `public/admin/` is the admin UI
- `test/server.test.js`: auth, validator, and HTTP integration tests (`npm test`)
