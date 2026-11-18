# SPEC — 2027 Isaiah 6tyOne Conference Guide

## Goal
A mobile-first guide web page for the 2027 아이자야씩스티원 conference (2027-01-26~28, KINTEX Hall 2, Hall 9).
- **Content** comes from the Notion guidebook: https://isaiah6tyone.notion.site/2027-3ed1bb6187b280a38248ff83ce1d01e1
- **Structure and controls** follow https://guide.g2a.co.kr/: a home page of grouped link lists, hash-routed detail pages, a language toggle and a footer.
- **Languages:** KO / EN / 中文, switchable at any time and remembered per visitor.
- **Admin:** `/admin` takes a password login, then lets the team add and edit every page in all three languages.
- **Two design options** share one markup:
  - **A. G2A-style**: imitates the G2A site.
  - **B. Apple-style**: follows the `/apple-design` skill.
  - The default option is set in admin. For review, `?theme=g2a|apple` overrides it.

## Non-goals (MVP)
- Image upload (admin references existing `/assets/...` paths).
- Multiple admin accounts/roles.
- Notion live sync.
- Automatic translation.
- Hosting/deploy.

All of these are listed in `QUESTIONS.md`.

## Stack
- **Runtime:** Node 24, zero npm dependencies. Server is `node:http`, auth is `node:crypto` (scrypt plus timingSafeEqual), and tests use `node:test`.
- **Frontend:** vanilla HTML/CSS/JS with no build step.
- **Fonts:**
  - **Display serif:** Playfair Display (Google Fonts, 400/700/900 plus italic). It is the free equivalent of the poster's high-contrast didone.
  - **Body:** Pretendard (jsDelivr CDN `pretendard@v1.3.9` dynamic-subset). G2A also uses it.
  - **Chinese:** `"PingFang SC","Noto Sans SC","Microsoft YaHei"` fallback.
- **Palette** (from the poster):

  | Token | Value |
  |---|---|
  | ink | `#1a0f0b` |
  | ember | `#e0611b` |
  | amber | `#f2a14a` |
  | cream | `#f6ead7` |

## Architecture
```
server/index.js     HTTP server: static /public, GET /api/content, admin API
server/auth.js      password hash/verify, sessions
server/store.js     read/validate/write content.json (atomic + backup)
public/index.html   guide shell; app.js renders from /api/content
public/app.js       router (#/ home, #/<slug> detail), i18n, block renderer
public/theme-g2a.css, public/theme-apple.css   option A / B (same markup)
public/base.css     reset, fonts, layout primitives shared by both themes
public/admin/       admin login + form editor (index.html, admin.js, admin.css)
data/content.json   all guide content (committed)
data/admin.json     scrypt password hash (gitignored, created by `npm run set-password`)
```

## Data model (`data/content.json`)
- **`L` (localized string):** an object `{ "ko": "", "en": "", "zh": "" }`.
  - Rendering falls back in the order requested language → `ko` → `""`.
  - Newlines (`\n`) render as line breaks.
  - `**bold**` and URLs auto-link. Nothing else is parsed, and the text is HTML-escaped first.

```jsonc
{
  "meta": { "updated": "2026-11-12", "theme": "apple", "title": L, "subtitle": L },
  "event": {
    "dates": L, "venue": L, "address": L, "theme": L, "verse": L,
    "days": [ { "label": "Day 1", "title": L } ],
    "poster": "/assets/poster.jpg",
    "cta": [ { "label": L, "href": "#/schedule", "style": "primary|outline" } ]
  },
  "notice": { "title": L, "body": L },            // optional banner card on home
  "quick":  [ { "page": "schedule", "icon": "🗓️" } ],   // 4-col icon grid → pages
  "remember": { "title": L, "items": [ L ] },     // red/ember bullet callout
  "sections": [ { "id": "getting-here", "title": L, "badge": L?, "pages": ["directions", "parking"] } ],
  "pages": {
    "<slug>": { "icon": "🚗", "title": L, "subtitle": L, "eyebrow": L, "cover": "/assets/..."?, "blocks": [ Block ] }
  },
  "footer": { "contact": L, "links": [ { "label": "INSTAGRAM", "href": "https://..." } ], "email": "i6tyone.conf@gmail.com" }
}
```

The `slug` key must match `[a-z0-9-]+`.

**Block types.** Each block's `type` is one of the following:

| type | fields | renders |
|---|---|---|
| `text` | `body: L` | paragraph |
| `heading` | `text: L` | section h2 inside a detail page |
| `info` | `title: L?, body: L` | shaded info box |
| `list` | `items: [L]` | bullet list |
| `table` | `head: [L], rows: [[L]]` | responsive table (horizontal scroll inside its own wrapper on narrow screens) |
| `accordion` | `items: [{ q: L, a: L }]` | `<details>` rows with a +/− marker |
| `image` | `src: "/assets/..", alt: L, caption: L?` | full-width image, lazy |
| `copy` | `label: L, value: "string"` | value plus a Copy button (clipboard) |
| `links` | `items: [{ label: L, href: "..." }]` | chevron link rows (external links get `target=_blank rel=noopener`) |
| `people` | `items: [{ name: L, role: L, photo: "/assets/.."? }]` | lineup cards |

Unknown block types are skipped by the renderer and rejected by the server validator.

## API
- `GET /api/content`: content.json (public; in GitHub mode the local cache).
- `GET /api/admin/content`: auth. Latest content (fresh from GitHub in GitHub mode) with `ETag` = its version.
- `POST /api/login {password}`: sets cookie `sid`. The cookie is HttpOnly, SameSite=Strict, Path=/, Max-Age 12h, and Secure when the request is HTTPS.
- `POST /api/logout`
- `GET /api/me`: 200 or 401.
- `PUT /api/content`: auth required.
  - Request: the full JSON body, max 2 MB, and `If-Match: <ETag from GET /api/admin/content>` (428 without it).
  - 412 when someone saved since that ETag (no lost updates); 502 when GitHub refuses or is unreachable (nothing changed).
  - **GitHub mode** (`GITHUB_TOKEN` + `GITHUB_REPO`, optional `GITHUB_BRANCH`=main): commits `data/content.json` with `[skip render]`, then updates the local cache. Git history is the backup. The server pulls the GitHub copy at startup.
  - **Local mode:** writes atomically (tmp + rename) and keeps the previous version in `data/backups/content-<ISO>.json` (last 20 kept).
  - Responds 400 with a message on invalid content.
- `GET /api/history`: auth. Newest first `[{id, date, message, url?}]` (GitHub: last 30 commits of content.json; local: backups).
- `POST /api/restore {id}`: auth + `If-Match`. Validates the old version and saves it as a new version, so the pre-restore state stays in history. Takes effect on the public site at once.
- **Framing:** public pages send `Content-Security-Policy: frame-ancestors 'self' $FRAME_ANCESTORS` (space/comma-separated origins, no wildcards). `/admin` and `/api` send `X-Frame-Options: DENY` + `frame-ancestors 'none'`.
- **POST/PUT checks:** the `Origin` header must match `Host` when present, as CSRF defence in depth.
- **No login lockout:** failed logins only return 401, so nobody can lock the admin out (a per-IP lockout behind a proxy locks everyone). A password of at least 12 characters is the brute-force defense: `set-password` refuses shorter ones and the server refuses to start with a shorter `ADMIN_PASSWORD`.
- **Password:** `npm run set-password` prompts and writes `data/admin.json`. Env `ADMIN_PASSWORD` is the alternative for hosting. With neither present, admin login is disabled and the server logs a hint.
- **Static files:** no directory listing and no path traversal (resolved path must stay under `public/`). Unknown non-API paths serve `public/index.html`.

## Key flows
1. **Visitor:**
   - The home page shows a hero (title, dates/venue, poster), CTAs, notice, quick grid, the "Remember" callout, grouped link sections and the footer.
   - A tap opens `#/<slug>`, which shows the eyebrow, H1, subtitle, blocks and a ← Back pill.
2. **Language:** the KO / EN / 中 pill sits in the sticky header. The choice is stored in `localStorage.lang` (wrapped in try/catch), and `?lang=` overrides it. The `<html lang>` attribute updates on change.
3. **Admin:**
   - Log in at `/admin`.
   - The editor offers:
     - A **Form** tab: a generic recursive editor. Each `L` object shows as three labelled textareas KO/EN/中文. Arrays support add, delete and move ↑↓, and add clones the last item with emptied strings. Pages can be added and deleted.
     - A **JSON** tab: raw JSON with a validate button.
   - Save → `PUT`, with a success or error toast.
   - "Preview" opens `/` in a new tab.

## Responsive / a11y
- **Widths:** layout works from 320px to 1440px with no horizontal page scroll. The content column is max 600px on home and 720px on detail pages.
- **Safe areas:** `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on the sticky header and footer.
- **Accessibility:**
  - Tap targets are at least 44px.
  - Visible focus states.
  - `prefers-reduced-motion` is honoured.
  - Contrast is AA.

## Definition of done (MVP)
- `npm start` serves the guide.
- `npm test` passes, covering auth hash/verify, session expiry, content validation, path traversal, the 12-character password minimum and that failed logins never lock the admin out.
- All 13 Notion sections exist as pages, in KO plus EN/ZH translations.
- Both themes have been screenshotted at 1280px and 390px, plus the admin screens.
- `docs/REPORT.pdf` exists.
