# PLAN

Status values: `todo` / `doing` / `done (commit)`. Open decisions live in `QUESTIONS.md`; work proceeds on their defaults.

| # | Task | gstack skill | After | Status |
|---|------|--------------|-------|--------|
| 1 | Scrape Notion content | `/browse` | – | done (33d12fc) |
| 2 | Server, auth, admin API | – | – | done (df07c38) |
| 3 | Guide frontend + theme A | – | – | done (5280d41) |
| 4 | Content JSON ko/en/zh | – | 1 | done (5749be6) |
| 5 | Admin editor UI | – | 2 | done (5001977) |
| 6 | Theme B apple-design | `/apple-design` | 3 | done (ad6f080) |
| 7 | QA screenshots | `/browse` | 4,5,6 | done (b22cc75) |
| 8 | Report + PDF | `/make-pdf` | 7 | doing |
| 9 | Deploy | `/setup-deploy`, `/ship` | Q2 | blocked on QUESTIONS Q2 |

## Briefs

**7 QA screenshots.** Both themes × 3 languages × 390/1280, admin login/editor, detail pages (schedule, directions, food, lineup). Saved in `docs/screens/qa/`.

**8 Report + PDF.** Fill `docs/REPORT.md` (per-commit progress, options chosen, screens, limits) and build `docs/REPORT.pdf` with `/make-pdf`.

**9 Deploy.** Waits for a host choice (Q2). Serverless hosts (Vercel) need a different content store, because the server writes `data/content.json` to disk.

Before handing off: `npm test` green, `/review` on the diff.
