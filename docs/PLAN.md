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
| 8 | Report + PDF | `/make-pdf` | 7 | done (8b3bfe3) |
| 9 | Deploy | `/setup-deploy`, `/ship` | Q2 | doing: Render free plan for dev testing (`render.yaml`); production host TBD |

## Briefs

**7 QA screenshots.** Both themes × 3 languages × 390/1280, admin login/editor, detail pages (schedule, directions, food, lineup). Saved in `docs/screens/qa/`.

**8 Report + PDF.** Fill `docs/REPORT.md` (per-commit progress, options chosen, screens, limits) and build `docs/REPORT.pdf` with `/make-pdf`.

**9 Deploy.** Dev testing runs on Render's free plan (`render.yaml`, Q2). The free plan has no disk, so set `GITHUB_TOKEN` (fine-grained, Contents read/write on this repo only) and `GITHUB_REPO`: admin saves then commit to GitHub and survive spin-down. Without them, admin edits are lost on spin-down (after 15 idle minutes) or restart. Pull before pushing code: admin saves add commits to `main`. Set `ADMIN_PASSWORD` as a secret env var. The production host must keep a disk, with `DATA_DIR` set to its path. A fresh disk has no `content.json`, so seed it from `data/content.json` on first start.

Before handing off: `npm test` green, `/review` on the diff.
