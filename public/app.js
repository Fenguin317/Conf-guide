'use strict';
const UI = {
  ko: { back: '뒤로', copy: '복사', copied: '복사됨!', updated: '최종 업데이트', contact: '문의', dates: '일시', venue: '장소', error: '내용을 불러오지 못했습니다. 새로고침해 주세요.' },
  en: { back: 'Back', copy: 'Copy', copied: 'Copied!', updated: 'Last updated', contact: 'Contact', dates: 'Dates', venue: 'Venue', error: 'Could not load the guide. Please refresh.' },
  zh: { back: '返回', copy: '复制', copied: '已复制！', updated: '最后更新', contact: '联系', dates: '日期', venue: '地点', error: '无法加载内容，请刷新页面。' },
};
const LANGS = [['ko', 'KO'], ['en', 'EN'], ['zh', '中']];
const BRAND = 'ISAIAH 6TYONE';
const KICKER = 'CONFERENCE'; // shown after the year taken from event.dates
const qs = new URLSearchParams(location.search);
const $app = document.getElementById('app');
const $top = document.querySelector('.top');
const $foot = document.querySelector('.foot');
const $live = document.getElementById('live');
let C = null;
// Visual edit mode: only when /admin embeds this page as /?edit (admin.js drives it over postMessage).
const EDIT = qs.has('edit') && window.parent !== window;
let paths = new Map(); // localized object -> its JSON path, so an edited element maps back to content
let ids = [];          // render-time id -> localized object
let fallback = new Set();
const END = '\uE002';
const MARK = /[\uE002\uE100-\uF8FF]/g;

function pickLang() {
  const ok = (l) => UI[l] ? l : null;
  let stored = null;
  try { stored = localStorage.getItem('lang'); } catch {}
  const nav = (navigator.language || '').toLowerCase();
  return ok(qs.get('lang')) || ok(stored) || (nav.startsWith('zh') ? 'zh' : nav.startsWith('en') ? 'en' : 'ko');
}
let lang = pickLang();

function setTheme(name) {
  const apple = name !== 'g2a';
  document.getElementById('theme').href = `/theme-${apple ? 'apple' : 'g2a'}.css`;
  document.querySelector('meta[name=theme-color]').content = !apple ? '#1a0f0b' : matchMedia('(prefers-color-scheme: dark)').matches ? '#000' : '#f5f5f7';
}
if (qs.get('theme')) setTheme(qs.get('theme'));

// Localized string (or plain string) → text in the current language.
// In edit mode the text is wrapped in private-use marker chars that annotate() turns into editable elements.
const t = (L) => {
  const s = typeof L === 'string' ? L : (L && (L[lang] || L.ko)) || '';
  if (!EDIT || !s || !paths.has(L)) return s;
  const id = ids.push(L) - 1;
  if (!L[lang]) fallback.add(id);
  return String.fromCharCode(0xE100 + id) + s + END;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/https?:\/\/[^\s<\uE000-\uF8FF]*[^\s<.,;:!?)\uE000-\uF8FF]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)
  .replace(/\n/g, '<br>');
// Admin-editable URLs: allow only http(s), mailto, tel, hash and site paths
const url = (u) => esc(/^(https?:|mailto:|tel:|#|\/)/i.test(u || '') ? u : '#');
const ext = (u) => /^https?:/i.test(u || '') ? ' target="_blank" rel="noopener"' : '';
const img = (src, alt, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${url(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
const row = (href, icon, label) => `<li><a class="row" href="${url(href)}"${ext(href)}>${icon ? `<span class="row-icon" aria-hidden="true">${esc(icon)}</span>` : ''}<span class="row-text">${fmt(label)}</span><span class="chev" aria-hidden="true">›</span></a></li>`;
const hasPage = (slug) => /^[a-z0-9-]+$/.test(slug) && Object.hasOwn(C.pages || {}, slug);
const back = () => `<a class="back" href="#/"><span aria-hidden="true">←</span>&nbsp;${UI[lang].back}</a>`;

function header() {
  $top.innerHTML = `<a class="brand" href="#/"><img src="/assets/logo.png" alt="${BRAND}" width="480" height="97"></a>
<div class="lang" role="group" aria-label="Language">${LANGS.map(([k, l]) => `<button type="button" lang="${k}" data-lang="${k}" aria-pressed="${k === lang}">${l}</button>`).join('')}</div>`;
}

function footer() {
  const f = C.footer || {}, u = UI[lang];
  $foot.innerHTML = `${t(f.contact) ? `<p>${fmt(t(f.contact))}</p>` : ''}
<div class="foot-links">${(f.links || []).map((l) => `<a href="${url(l.href)}"${ext(l.href)}>${esc(t(l.label))}</a>`).join('')}</div>
${f.email ? `<div class="foot-mail"><span>${u.contact}</span> ${esc(f.email)} <button type="button" class="copy" data-copy="${esc(f.email)}">${u.copy}</button></div>` : ''}
<p class="foot-updated">${u.updated} ${esc(C.meta?.updated)}</p>`;
}

function home() {
  const m = C.meta || {}, e = C.event || {}, u = UI[lang];
  const year = (t(e.dates).match(/\b\d{4}\b/) || [''])[0];
  const fact = (label, v) => t(v) ? `<dt class="sr-only">${label}</dt><dd>${fmt(t(v))}</dd>` : '';
  return `<div class="view-home">
<section class="hero">
${e.poster ? img(e.poster, t(m.title), 'hero-poster') : ''}
<div class="hero-kicker">${esc(`${year} ${KICKER}`.trim())}</div>
<h1 class="hero-title">${fmt(t(m.title))}</h1>
${t(m.subtitle) ? `<p class="hero-sub">${fmt(t(m.subtitle))}</p>` : ''}
<dl class="hero-facts">${fact(u.dates, e.dates)}${fact(u.venue, e.venue)}</dl>
${e.days?.length ? `<div class="hero-days">${e.days.map((d) => `<div class="day"><b>${esc(t(d.label))}</b> <span>${fmt(t(d.title))}</span></div>`).join('')}</div>` : ''}
</section>
${e.cta?.length ? `<div class="cta-row">${e.cta.map((c) => `<a class="btn btn-${c.style === 'outline' ? 'outline' : 'primary'}" href="${url(c.href)}"${ext(c.href)}>${fmt(t(c.label))}</a>`).join('')}</div>` : ''}
${C.notice && t(C.notice.body) ? `<aside class="notice"><h2>${fmt(t(C.notice.title))}</h2><p>${fmt(t(C.notice.body))}</p></aside>` : ''}
${C.quick?.length ? `<nav class="quick">${C.quick.filter((q) => hasPage(q.page)).map((q) => `<a class="quick-item" href="#/${q.page}"><span class="quick-icon" aria-hidden="true">${esc(q.icon || C.pages[q.page].icon)}</span><span class="quick-label">${fmt(t(C.pages[q.page].title))}</span></a>`).join('')}</nav>` : ''}
${C.remember?.items?.length ? `<div class="remember"><h2>${fmt(t(C.remember.title))}</h2><ul>${C.remember.items.map((i) => `<li>${fmt(t(i))}</li>`).join('')}</ul></div>` : ''}
${(C.sections || []).map((s) => `<section class="group"><h2 class="group-title">${fmt(t(s.title))}${t(s.badge) ? ` <span class="badge">${esc(t(s.badge))}</span>` : ''}</h2>
<ul class="rows">${(s.pages || []).filter(hasPage).map((p) => row(`#/${p}`, C.pages[p].icon, t(C.pages[p].title))).join('')}</ul></section>`).join('')}
</div>`;
}

const BLOCKS = {
  text: (b) => `<p class="b-text">${fmt(t(b.body))}</p>`,
  heading: (b) => `<h2 class="b-heading">${fmt(t(b.text))}</h2>`,
  info: (b) => `<div class="b-info">${t(b.title) ? `<h3>${fmt(t(b.title))}</h3>` : ''}<p>${fmt(t(b.body))}</p></div>`,
  list: (b) => `<ul class="b-list">${(b.items || []).map((i) => `<li>${fmt(t(i))}</li>`).join('')}</ul>`,
  table: (b) => `<div class="b-table-wrap" tabindex="0"><table>${b.head?.length ? `<thead><tr>${b.head.map((h) => `<th scope="col">${fmt(t(h))}</th>`).join('')}</tr></thead>` : ''}<tbody>${(b.rows || []).map((r) => `<tr>${r.map((c) => `<td>${fmt(t(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
  accordion: (b) => (b.items || []).map((i) => `<details class="b-acc"><summary>${fmt(t(i.q))}</summary><p>${fmt(t(i.a))}</p></details>`).join(''),
  image: (b) => `<figure class="b-image">${img(b.src, t(b.alt))}${t(b.caption) ? `<figcaption>${fmt(t(b.caption))}</figcaption>` : ''}</figure>`,
  copy: (b) => `<div class="b-copy"><code>${esc(b.value)}</code><button type="button" class="copy" data-copy="${esc(b.value)}">${esc(t(b.label) || UI[lang].copy)}</button></div>`,
  links: (b) => `<ul class="b-links">${(b.items || []).map((i) => row(i.href, '', t(i.label))).join('')}</ul>`,
  people: (b) => `<div class="b-people">${(b.items || []).map((p) => `<div class="person">${p.photo ? img(p.photo, t(p.name)) : ''}<b>${fmt(t(p.name))}</b><span>${fmt(t(p.role))}</span></div>`).join('')}</div>`,
};

function detail(slug, p) {
  const sec = (C.sections || []).find((s) => (s.pages || []).includes(slug));
  const eyebrow = t(p.eyebrow) || t(sec?.title);
  return `<div class="view-page">
${back()}
<p class="eyebrow">${esc(eyebrow ? `${eyebrow} · ${t(p.title)}` : t(p.title))}</p>
<h1 class="page-title">${fmt(t(p.title))}</h1>
${t(p.subtitle) ? `<p class="page-sub">${fmt(t(p.subtitle))}</p>` : ''}
${p.cover ? img(p.cover, t(p.title), 'page-cover') : ''}
${(p.blocks || []).map((b, i) => (EDIT ? `<!--b${i}-->` : '') + (BLOCKS[b.type]?.(b) || '')).join('\n')}
${back()}
</div>`;
}

function render() {
  const slug = location.hash.replace(/^#\/?/, ''); // slugs are [a-z0-9-], no decoding needed
  const p = hasPage(slug) ? C.pages[slug] : null;
  document.body.dataset.view = p ? 'page' : 'home';
  $app.innerHTML = p ? detail(slug, p) : home();
  document.title = p ? `${t(p.title)} · ${t(C.meta?.title)}` : t(C.meta?.title) || BRAND;
}

function renderAll() {
  ids = [];
  fallback = new Set();
  document.documentElement.lang = lang;
  header();
  footer();
  render();
  if (EDIT) annotate();
}

async function copy(btn) {
  const v = btn.dataset.copy;
  let ok = false;
  try { await navigator.clipboard.writeText(v); ok = true; } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: v, readOnly: true });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
  }
  if (!ok) return;
  btn.dataset.label ??= btn.textContent;
  btn.textContent = $live.textContent = UI[lang].copied;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = btn.dataset.label; $live.textContent = ''; }, 1500);
}

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  if (btn.matches('.copy')) { if (!EDIT) copy(btn); }
  else if (btn.dataset.lang && btn.dataset.lang !== lang) {
    lang = btn.dataset.lang;
    try { localStorage.setItem('lang', lang); } catch {}
    if (qs.has('lang')) { qs.set('lang', lang); history.replaceState(null, '', `?${qs}${location.hash}`); }
    renderAll();
    $top.querySelector(`[data-lang="${lang}"]`).focus();
  }
});
addEventListener('hashchange', () => {
  if (!C) return;
  EDIT ? renderAll() : render();
  scrollTo(0, 0);
  if (EDIT) post({ type: 'nav', hash: location.hash });
});

/* ---------- visual edit mode ---------- */

const post = (msg) => window.parent.postMessage(msg, location.origin);

function indexPaths(v, p = []) {
  if (!v || typeof v !== 'object') return;
  if (!Array.isArray(v) && typeof v.ko === 'string') return void paths.set(v, p);
  for (const [k, x] of Object.entries(v)) indexPaths(x, [...p, Array.isArray(v) ? Number(k) : k]);
}

// Turn marker-wrapped text into editable elements, tag page blocks with data-block, then strip the markers.
function annotate() {
  const roots = [$top, $app, $foot];
  for (const root of roots) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      for (const ch of n.data) {
        const id = ch.charCodeAt(0) - 0xE100;
        // shortcut: content that itself holds U+E100–U+F8FF chars gets them stripped in edit mode; use another marker scheme if that ever matters
        if (id < 0 || !ids[id]) continue;
        // the owner is the nearest element whose whole text is exactly this one marked string
        for (let e = n.parentElement; e && root.contains(e); e = e.parentElement) {
          const tc = e.textContent.trim();
          if (!tc.includes(END, tc.indexOf(ch))) continue;
          const L = ids[id];
          if (tc[0] === ch && tc.indexOf(END) === tc.length - 1 && !/\*\*.+?\*\*/.test(L[lang] || L.ko)) {
            e.dataset.edit = id;
            try { e.contentEditable = 'plaintext-only'; } catch { e.contentEditable = 'true'; }
            e.spellcheck = false;
            if (fallback.has(id)) e.title = `${lang.toUpperCase()} 번역 없음: 한국어를 보여 주는 중이며, 고치면 ${lang.toUpperCase()} 칸에 저장됩니다`;
          }
          break;
        }
      }
    }
    const strip = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = strip.nextNode());) n.data = n.data.replace(MARK, '');
    for (const e of root.querySelectorAll('*')) for (const a of e.attributes) a.value = a.value.replace(MARK, '');
  }
  document.title = document.title.replace(MARK, '');
  for (const d of $app.querySelectorAll('details')) d.open = true;
  let block = -1;
  for (const n of $app.querySelector('.view-page')?.childNodes ?? []) {
    if (n.nodeType === Node.COMMENT_NODE && /^b\d+$/.test(n.data)) block = Number(n.data.slice(1));
    else if (n.nodeType === Node.ELEMENT_NODE && block >= 0 && !n.matches('.back')) n.dataset.block = block;
  }
}

if (EDIT) {
  document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/admin/edit-mode.css">');
  const slug = () => location.hash.replace(/^#\/?/, '');
  const bar = document.createElement('div');
  bar.className = 'edit-bar';
  bar.hidden = true;
  bar.innerHTML = '<button type="button" draggable="true" data-op="drag" aria-label="끌어서 이동" title="끌어서 이동">⠿</button><button type="button" data-op="up" aria-label="위로">↑</button><button type="button" data-op="down" aria-label="아래로">↓</button><button type="button" data-op="edit">세부 편집</button><button type="button" data-op="delete" class="danger">삭제</button>';
  const line = Object.assign(document.createElement('div'), { className: 'edit-drop', hidden: true });
  document.body.append(bar, line);
  let current = -1, dragging = -1, dropAt = -1;
  const blockEls = (i) => [...$app.querySelectorAll(`[data-block="${i}"]`)];
  const showBar = (i) => {
    $app.querySelectorAll('.edit-hover').forEach((e) => e.classList.remove('edit-hover'));
    const els = blockEls(i);
    if (!els.length) { bar.hidden = true; current = -1; return; }
    current = i;
    els.forEach((e) => e.classList.add('edit-hover'));
    const r = els[0].getBoundingClientRect();
    bar.style.top = `${Math.max(0, r.top + scrollY - 40)}px`;
    bar.style.left = `${r.left + scrollX}px`;
    bar.hidden = false;
  };
  const blockAt = (target) => target.closest?.('[data-block]');
  document.addEventListener('mouseover', (ev) => { const b = blockAt(ev.target); if (b && Number(b.dataset.block) !== current) showBar(Number(b.dataset.block)); });
  document.addEventListener('focusin', (ev) => { const b = blockAt(ev.target); if (b) showBar(Number(b.dataset.block)); });
  bar.addEventListener('click', (ev) => {
    const op = ev.target.closest('button')?.dataset.op;
    if (!op || op === 'drag' || current < 0) return;
    const i = current;
    // keep the bar on the block being moved, not on the slot it left
    if (op === 'up' && i > 0) current = i - 1;
    else if (op === 'down' && blockEls(i + 1).length) current = i + 1;
    else if (op === 'delete') current = -1;
    post({ type: 'block', op, slug: slug(), i });
  });
  bar.addEventListener('dragstart', (ev) => { dragging = current; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(current)); });
  document.addEventListener('dragover', (ev) => {
    if (dragging < 0) return;
    const b = blockAt(ev.target);
    if (!b) return;
    ev.preventDefault();
    const i = Number(b.dataset.block), els = blockEls(i);
    const top = els[0].getBoundingClientRect().top, bottom = els.at(-1).getBoundingClientRect().bottom;
    const after = ev.clientY > (top + bottom) / 2;
    dropAt = after ? i + 1 : i;
    const r = (after ? els.at(-1) : els[0]).getBoundingClientRect();
    Object.assign(line.style, { top: `${(after ? r.bottom : r.top) + scrollY - 2}px`, left: `${r.left + scrollX}px`, width: `${r.width}px` });
    line.hidden = false;
  });
  document.addEventListener('drop', (ev) => {
    if (dragging < 0) return;
    ev.preventDefault();
    if (dropAt >= 0 && dropAt !== dragging && dropAt !== dragging + 1) {
      current = dropAt > dragging ? dropAt - 1 : dropAt;
      post({ type: 'block', op: 'move', slug: slug(), i: dragging, to: dropAt });
    }
  });
  document.addEventListener('dragend', () => { dragging = dropAt = -1; line.hidden = true; });
  // links stay inert while editing, except in-guide navigation clicked outside editable text
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a');
    if (ev.target.closest('[data-edit]') || ev.target.closest('summary') || (a && !a.getAttribute('href')?.startsWith('#/'))) ev.preventDefault();
  }, true);
  document.addEventListener('input', (ev) => {
    const e = ev.target.closest?.('[data-edit]');
    if (!e) return;
    const L = ids[e.dataset.edit];
    const value = e.innerText.replace(/\u00A0/g, ' ').replace(/\n$/, '');
    L[lang] = value;
    e.removeAttribute('title');
    post({ type: 'text', path: paths.get(L), lang, value });
  });
  addEventListener('message', (ev) => {
    if (ev.source !== window.parent || ev.origin !== location.origin || ev.data?.type !== 'content') return;
    const moved = ev.data.hash !== undefined && ev.data.hash !== location.hash;
    C = ev.data.content;
    paths = new Map();
    indexPaths(C);
    setTheme(qs.get('theme') || C.meta?.theme);
    if (moved) history.replaceState(null, '', ev.data.hash || '#/');
    const y = scrollY;
    renderAll();
    scrollTo(0, moved ? 0 : y);
    if (current >= 0) showBar(current); else bar.hidden = true;
  });
  post({ type: 'ready' });
} else fetch('/api/content')
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((c) => {
    C = c;
    if (!qs.get('theme')) setTheme(c.meta?.theme);
    renderAll();
  })
  .catch(() => { setTheme(qs.get('theme')); document.documentElement.lang = lang; $app.textContent = UI[lang].error; });
