# DESIGN — settled decisions (implement these, do not invent new UI)

Both themes style the SAME markup emitted by `public/app.js`. Class names below are the contract.

## Markup contract (app.js output)

### Shared
- `header.top`
  - contains `a.brand` wrapping `img` `/assets/logo.png` (white logo, alt "ISAIAH 6TYONE", 24px tall; inverted on the apple theme's light bar)
  - contains `.lang` with 3 `button[aria-pressed]`: KO, EN, 中
- `main#app`, which holds one of the two views below
- `footer.foot`
  - `.foot-links a`
  - `.foot-mail`, a text node plus `button.copy`
  - `.foot-updated`

### Home view: `.view-home`
- `section.hero`
  - `img.hero-poster`
  - `.hero-kicker`: "2027 CONFERENCE"
  - `h1.hero-title`: meta.title
  - `p.hero-sub`
  - `dl.hero-facts`: dates, venue
  - `.hero-days`: three `.day` items with `b` = label and `span` = title
- `.cta-row`: `a.btn.btn-primary` and `a.btn.btn-outline`
- `aside.notice`: `h2` + `p`
- `nav.quick`: 4-col grid of `a.quick-item`, each with `span.quick-icon` + `span.quick-label`
- `.remember`: `h2` + `ul li`
- `section.group` (one per `sections[]`)
  - `h2.group-title`, plus an optional `span.badge`
  - `ul.rows`, each `li a.row` containing `span.row-icon`, `span.row-text`, and `span.chev` (the "›" chevron)

### Detail view: `.view-page`
- `a.back` (pill)
- `p.eyebrow`: SECTION · PAGE in uppercase
- `h1.page-title`
- `p.page-sub`
- `img.page-cover` (optional)
- blocks:
  - `.b-text`, `h2.b-heading`, `.b-info`, `ul.b-list`, `.b-table-wrap table`
  - `details.b-acc` with `summary`
  - `figure.b-image`
  - `.b-copy`: `code` + `button.copy`
  - `ul.b-links` with `a.row`
  - `.b-people` with `.person`: `img`, `b`, `span`
- a second `a.back` at the bottom

## Option A: G2A-style (`theme-g2a.css`)

### Colours
- Page background: cream `#f2f0e1`
- Cards: white `#fff`, 1px border `#e4e0cc`, radius 4px. The cards are flat, like G2A's.
- Header and footer: near-black `#1a0f0b`, with cream text
- Accent: poster ember `#e0611b`. Use it where G2A uses red: primary button fill, outline button border/text, square bullets, the active lang pill and the badge.
- Hover: ember darker `#b84a10`

### Elements
- **Header**
  - 56px tall and sticky.
  - Brand on the left; KO/EN/中 sits in a pill group on the right.
  - Active pill: cream background with ink text. Inactive: transparent with cream text.
- **Hero**
  - Dark ink card, full-width up to 600px.
  - Poster image on top, 16:9 crop, top-aligned (object-position top).
  - Below the poster, cream text:
    - Kicker in Playfair italic, amber colour.
    - Title in Playfair 900, 32/36px.
    - Facts in Pretendard 15px.
    - Day chips: 1px amber border, small.
- **Quick grid**
  - 4 columns with a 1px border grid; it is 2 columns under 360px.
  - Icon 24px with a 13px label.
- **Section groups**
  - Group title: 13px uppercase letter-spacing .08em, muted `#6b6250`.
  - Rows: white with 1px separators, 56px min height, chevron on the right in ember.
  - Badge: "Start here" style. Ember background, white text, 11px, radius 2px.
- **Remember callout**
  - White card with a 4px ember left border.
  - Bullets are 6px ember squares.
- **Detail page**
  - Info box: background `#ebe7d3`.
  - Table header: ink background with cream text.
  - Accordion: a "+" marker on the right that rotates to "×" when open.
  - Back pill: 1px ink border, radius 999px.
- **Footer:** ink background, links in uppercase 12px with letter-spacing, and a muted last-updated line.

## Option B: Apple-style (`theme-apple.css`, worker applies the `/apple-design` skill within these bounds)

### Colours
- Light mode: background `#f5f5f7`, text `#1d1d1f`.
- Dark mode (`prefers-color-scheme`): background `#000`, text `#f5f5f7`.
- Accent: ember `#e0611b`. Dark mode may lift it to `#ff7a33` for contrast.

### Elements
- **Header**
  - Translucent "frosted" sticky bar: `backdrop-filter: saturate(180%) blur(20px)` over `rgba(245,245,247,.72)`.
  - 52px tall, hairline bottom border.
  - Lang: an iOS segmented control.
- **Hero**
  - Big type on the background, no card.
  - Title in Playfair 900, `clamp(40px, 9vw, 72px)`, tight leading.
  - Kicker uses an SF-like Pretendard 600 with a small caps feel.
  - Poster in an 18px-radius rounded frame with a soft shadow.
  - Days shown as three stacked rows separated by hairlines.
- **Buttons:** primary is a filled ember capsule, 44px+. Outline is ember text only, in the "Learn more ›" style.
- **Quick grid:** 4 rounded tiles (radius 16), white or `#1c1c1e`, icon centred.
- **Section groups**
  - iOS Settings style "inset grouped" lists: rounded 12px container, rows with a hairline inset separator, and a grey chevron.
  - Group titles: 13px uppercase grey outside the container.
- **Remember / notice / info:** rounded 16px cards.
- **Accordion:** chevron that rotates.
- **Motion:** subtle 200ms ease on press (scale .98). Disabled under reduced motion.

## Both options
- Display serif only for Latin display text: brand, kicker, hero title when the language is `en`, and day labels.
- KO/ZH titles use Pretendard 800, because Playfair has no Hangul/CJK glyphs and the fallback would look mixed.
- `html[lang=zh]` puts the CJK font stack first.
- Long words wrap (`overflow-wrap: anywhere` on table cells and row text).
