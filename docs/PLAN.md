# PLAN

The user is asleep and asked me to decide by judgment, so open questions go in `QUESTIONS.md` and work proceeds on the recommended defaults.

Status values: `todo` / `doing` / `done (commit)`.

| # | Task | Tier | After | Status |
|---|------|------|-------|--------|
| 1 | Scrape Notion content | medium | – | doing |
| 2 | Server, auth, admin API | careful | – | done (df07c38) |
| 3 | Guide frontend + theme A | medium | – | done (5280d41) |
| 4 | Content JSON ko/en/zh | medium | 1 | todo |
| 5 | Admin editor UI | medium | 2 | done (5001977) |
| 6 | Theme B apple-design | medium | 3 | done (see log) |
| 7 | QA screenshots + report PDF | medium | 4,5,6 | todo |

## Briefs

**1 Scrape Notion content.**
- Use gstack's headless browser to read the main Notion page and all 13 subpages, including the database entries under "컨퍼런스 가이드".
- Save text to `docs/reference/notion/<slug>.md`.
- Download the images that are actually used into `public/assets/notion/`.
- Verify: every subpage has a non-empty file, and the image list resolves.

**2 Server, auth, admin API.**
- Build `server/` per SPEC §API with zero dependencies, plus `npm run set-password`.
- Write `node:test` tests in `test/`.
- Verify: `npm test` is green, and curl confirms login → PUT → content changed → backup created.

**3 Guide frontend + theme A.**
- Build `public/index.html`, `base.css`, `app.js` and `theme-g2a.css` per SPEC data model and DESIGN markup contract and Option A.
- Use the seed `data/content.json`.
- Verify:
  - Screenshots at 390px and 1280px.
  - No console errors.
  - No horizontal scroll at 320px.

**4 Content JSON ko/en/zh.**
- Turn the scraped Notion text into `data/content.json` per the SPEC schema, translating it into natural EN and Simplified ZH.
- Verify: the server validator accepts it, and every `L` has all three languages.

**5 Admin editor UI.**
- Build `public/admin/` with login, a generic form editor, a JSON tab, save and a toast, per SPEC §Key flows 3.
- Verify: log in, edit a field in all three languages, save, and see the change on the guide.

**6 Theme B apple-design.**
- Write `theme-apple.css` per DESIGN Option B, using the `/apple-design` skill, styling the same markup only.
- Verify screenshots in light and dark at 390px and 1280px.

**7 QA screenshots + report PDF.**
- Run the app.
- Take screenshots of both themes × 3 languages × mobile/desktop, the admin pages and a few detail pages.
- Build `docs/REPORT.pdf` from `docs/REPORT.md` with `/make-pdf`. It covers per-commit progress and the options chosen.
