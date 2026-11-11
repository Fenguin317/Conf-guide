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

function pickLang() {
  const ok = (l) => UI[l] ? l : null;
  let stored = null;
  try { stored = localStorage.getItem('lang'); } catch {}
  const nav = (navigator.language || '').toLowerCase();
  return ok(qs.get('lang')) || ok(stored) || (nav.startsWith('zh') ? 'zh' : nav.startsWith('en') ? 'en' : 'ko');
}
let lang = pickLang();

function setTheme(name) {
  document.getElementById('theme').href = `/theme-${name === 'apple' ? 'apple' : 'g2a'}.css`;
}
if (qs.get('theme')) setTheme(qs.get('theme'));

// Localized string (or plain string) → text in the current language
const t = (L) => typeof L === 'string' ? L : (L && (L[lang] || L.ko)) || '';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/https?:\/\/[^\s<]*[^\s<.,;:!?)]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)
  .replace(/\n/g, '<br>');
// Admin-editable URLs: allow only http(s), mailto, tel, hash and site paths
const url = (u) => esc(/^(https?:|mailto:|tel:|#|\/)/i.test(u || '') ? u : '#');
const ext = (u) => /^https?:/i.test(u || '') ? ' target="_blank" rel="noopener"' : '';
const img = (src, alt, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${url(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
const row = (href, icon, label) => `<li><a class="row" href="${url(href)}"${ext(href)}>${icon ? `<span class="row-icon" aria-hidden="true">${esc(icon)}</span>` : ''}<span class="row-text">${fmt(label)}</span><span class="chev" aria-hidden="true">›</span></a></li>`;
const hasPage = (slug) => /^[a-z0-9-]+$/.test(slug) && Object.hasOwn(C.pages || {}, slug);
const back = () => `<a class="back" href="#/"><span aria-hidden="true">←</span>&nbsp;${UI[lang].back}</a>`;

function header() {
  $top.innerHTML = `<a class="brand" href="#/" aria-label="${BRAND}"><span aria-hidden="true">${BRAND}</span><span aria-hidden="true">I61</span></a>
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
${(p.blocks || []).map((b) => BLOCKS[b.type]?.(b) || '').join('\n')}
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
  document.documentElement.lang = lang;
  header();
  footer();
  render();
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
  if (btn.matches('.copy')) copy(btn);
  else if (btn.dataset.lang && btn.dataset.lang !== lang) {
    lang = btn.dataset.lang;
    try { localStorage.setItem('lang', lang); } catch {}
    if (qs.has('lang')) { qs.set('lang', lang); history.replaceState(null, '', `?${qs}${location.hash}`); }
    renderAll();
    $top.querySelector(`[data-lang="${lang}"]`).focus();
  }
});
addEventListener('hashchange', () => { if (C) { render(); scrollTo(0, 0); } });

fetch('/api/content')
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((c) => {
    C = c;
    if (!qs.get('theme')) setTheme(c.meta?.theme);
    renderAll();
  })
  .catch(() => { setTheme(qs.get('theme')); document.documentElement.lang = lang; $app.textContent = UI[lang].error; });
