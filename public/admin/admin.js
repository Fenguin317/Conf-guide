'use strict';
// Admin editor. All DOM is built with createElement/textContent/.value; content never goes through innerHTML.

const $ = (s) => document.querySelector(s);
const LANGS = [['ko', 'KO'], ['en', 'EN'], ['zh', '中文']];
const BLOCK_TYPES = ['text', 'heading', 'info', 'list', 'table', 'accordion', 'image', 'copy', 'links', 'people'];
const LABELS = {
  meta: '기본 정보', event: '행사', notice: '공지', quick: '바로가기', remember: '기억하세요', sections: '섹션', pages: '페이지', footer: '푸터',
  title: '제목', subtitle: '부제', body: '본문', items: '항목', updated: '수정일', theme: '테마', dates: '날짜', venue: '장소',
  address: '주소', verse: '말씀', days: '일정', label: '라벨', poster: '포스터', cta: '버튼', href: '링크', style: '스타일',
  page: '페이지', icon: '아이콘', id: 'ID', badge: '배지', eyebrow: '상단 라벨', cover: '커버 이미지', blocks: '블록',
  text: '텍스트', head: '머리글', rows: '행', q: '질문', a: '답변', src: '이미지 경로', alt: '대체 텍스트', caption: '캡션',
  value: '값', name: '이름', role: '역할', photo: '사진', contact: '연락처', links: '링크', email: '이메일', type: '유형',
};
const TYPE_LABELS = {
  text: '텍스트', heading: '소제목', info: '안내 상자', list: '목록', table: '표', accordion: '아코디언',
  image: '이미지', copy: '복사', links: '링크', people: '인물',
};
const emptyL = () => ({ ko: '', en: '', zh: '' });
const TEMPLATES = {
  text: () => ({ type: 'text', body: emptyL() }),
  heading: () => ({ type: 'heading', text: emptyL() }),
  info: () => ({ type: 'info', body: emptyL() }),
  list: () => ({ type: 'list', items: [emptyL()] }),
  table: () => ({ type: 'table', head: [emptyL()], rows: [[emptyL()]] }),
  accordion: () => ({ type: 'accordion', items: [{ q: emptyL(), a: emptyL() }] }),
  image: () => ({ type: 'image', src: '/assets/', alt: emptyL() }),
  copy: () => ({ type: 'copy', label: emptyL(), value: '' }),
  links: () => ({ type: 'links', items: [{ label: emptyL(), href: 'https://' }] }),
  people: () => ({ type: 'people', items: [{ name: emptyL(), role: emptyL() }] }),
};

let data = null;
let dirty = false;
let tab = 'form';
const openPaths = new Set(['meta']);
// Blank item shape per array (paths normalised to `*`), so an emptied array can still "+ 추가".
const shapes = new Map();

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isL = (v) => isObj(v) && 'ko' in v && Object.keys(v).every((k) => k === 'ko' || k === 'en' || k === 'zh');
const label = (k) => (typeof k === 'number' ? '' : LABELS[k] ?? k);

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}
const btn = (text, onclick, props = {}) => el('button', { type: 'button', onclick, ...props }, text);
const row = (name, control) => el('label', { className: 'row' }, el('span', { className: 'lbl' }, name), control);

function select(opts, value, set, props = {}) {
  const s = el('select', { onchange: (e) => set(e.target.value), ...props }, ...opts.map(([v, t]) => el('option', { value: v }, t)));
  s.value = value;
  return s;
}

function grow(t) {
  t.style.height = 'auto';
  if (t.scrollHeight) t.style.height = `${t.scrollHeight + 2}px`;
}
const growAll = (root) => root.querySelectorAll('.lfield textarea').forEach(grow);

function markDirty() {
  dirty = true;
  $('#dirty').hidden = false;
}
function setClean() {
  dirty = false;
  $('#dirty').hidden = true;
}

// Copy with every string emptied, except `type` and `style` values.
function blank(x, key) {
  if (typeof x === 'string') return key === 'type' || key === 'style' ? x : '';
  if (Array.isArray(x)) return x.map((y) => blank(y));
  if (isObj(x)) return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, blank(y, k)]));
  return x;
}

function scan(v, sk) {
  if (Array.isArray(v)) {
    if (v.length) shapes.set(sk, blank(v[0]));
    v.forEach((x) => scan(x, `${sk}.*`));
  } else if (isObj(v)) {
    const s = typeof v.type === 'string' ? `${sk}<${v.type}>` : sk;
    for (const [k, y] of Object.entries(v)) scan(y, `${s}.${k}`);
  }
}
function scanShapes() {
  for (const t of BLOCK_TYPES) scan(TEMPLATES[t](), 'pages.*.blocks.*');
  for (const [k, v] of Object.entries(data)) {
    if (k === 'pages' && isObj(v)) Object.values(v).forEach((p) => scan(p, 'pages.*'));
    else scan(v, k);
  }
}

/* ---------- form ---------- */

function renderForm() {
  const form = $('#form');
  form.replaceChildren(...Object.keys(data).map((k) => details(k, LABELS[k] ? `${LABELS[k]} · ${k}` : k,
    k === 'pages' && isObj(data.pages) ? pagesEditor() : node(data, k, k, k), 'top')));
  growAll(form);
}

function details(path, title, body, className) {
  const d = el('details', { className, open: openPaths.has(path) }, el('summary', {}, title), el('div', { className: 'body' }, body));
  d.addEventListener('toggle', () => {
    if (d.open) { openPaths.add(path); growAll(d); } else openPaths.delete(path);
  });
  return d;
}

function changed() {
  markDirty();
  renderForm();
}

function node(parent, key, path, sk) {
  const v = parent[key];
  const set = (x) => { parent[key] = x; markDirty(); };
  const name = label(key);
  if (path === 'meta.theme') return row(name, select([['g2a', 'A · G2A 스타일'], ['apple', 'B · 애플 스타일']], v, set));
  if (key === 'type' && typeof v === 'string') return row(name, el('span', { className: 'badge' }, TYPE_LABELS[v] ? `${v} · ${TYPE_LABELS[v]}` : v));
  if (key === 'style') return row(name, select([['primary', 'primary'], ['outline', 'outline']], v, set));
  if (/^quick\.\d+\.page$/.test(path)) return row(name, pageSelect(v, set));
  if (/^sections\.\d+\.pages$/.test(path) && Array.isArray(v)) return slugList(v, name);
  if (isL(v)) return lField(v, name);
  if (Array.isArray(v)) return arrayEditor(v, key, path, sk);
  if (isObj(v)) return objEditor(v, path, sk);
  if (typeof v === 'string') return row(name, el('input', { type: 'text', value: v, oninput: (e) => set(e.target.value) }));
  if (typeof v === 'number') {
    return row(name, el('input', { type: 'number', value: v, oninput: (e) => set(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0) }));
  }
  if (typeof v === 'boolean') return row(name, el('input', { type: 'checkbox', checked: v, onchange: (e) => set(e.target.checked) }));
  return row(name, el('code', {}, JSON.stringify(v)));
}

function objEditor(obj, path, sk) {
  const s = typeof obj.type === 'string' ? `${sk}<${obj.type}>` : sk;
  return el('div', { className: 'obj' }, ...Object.keys(obj).map((k) => node(obj, k, `${path}.${k}`, `${s}.${k}`)));
}

function lField(v, name) {
  return el('fieldset', { className: 'lfield' }, el('legend', {}, name), el('div', { className: 'l-grid' },
    ...LANGS.map(([lang, tag]) => el('label', {}, el('span', { className: 'lang' }, tag),
      el('textarea', { rows: 1, value: v[lang] ?? '', oninput: (e) => { v[lang] = e.target.value; markDirty(); grow(e.target); } })))));
}

function move(arr, i, d) {
  [arr[i], arr[i + d]] = [arr[i + d], arr[i]];
  changed();
}

function arrayEditor(arr, key, path, sk) {
  const wrap = el('div', { className: 'arr' }, arrName(key));
  arr.forEach((item, i) => {
    wrap.append(el('div', { className: 'card' },
      el('div', { className: 'card-head' },
        el('span', { className: 'card-title' }, `${label(key) || '항목'} ${i + 1}`),
        btn('↑', () => move(arr, i, -1), { disabled: i === 0, 'aria-label': `${i + 1}번 위로` }),
        btn('↓', () => move(arr, i, 1), { disabled: i === arr.length - 1, 'aria-label': `${i + 1}번 아래로` }),
        btn('삭제', () => { arr.splice(i, 1); changed(); }, { className: 'danger' })),
      node(arr, i, `${path}.${i}`, `${sk}.*`)));
  });
  if (key === 'blocks') {
    wrap.append(select([['', '+ 블록 추가…'], ...BLOCK_TYPES.map((t) => [t, `${t} · ${TYPE_LABELS[t]}`])], '', (t) => {
      if (!t) return;
      arr.push(TEMPLATES[t]());
      changed();
    }, { 'aria-label': '블록 추가' }));
  } else {
    wrap.append(btn('+ 추가', () => {
      arr.push(arr.length ? blank(arr.at(-1)) : shapes.has(sk) ? structuredClone(shapes.get(sk)) : emptyL());
      changed();
    }, { className: 'add' }));
  }
  return wrap;
}
const arrName = (key) => (typeof key === 'number' ? null : el('div', { className: 'arr-name' }, label(key)));

/* ---------- pages & slug references ---------- */

function pageSelect(v, set, props) {
  const pages = data.pages ?? {};
  const opts = Object.keys(pages).map((s) => [s, `${s} — ${pages[s]?.title?.ko ?? ''}`]);
  if (!Object.hasOwn(pages, v ?? '')) opts.unshift([v ?? '', v ? `${v} (없는 페이지)` : '— 페이지 선택 —']);
  return select(opts, v ?? '', set, props);
}

function slugList(list, title) {
  const unused = Object.keys(data.pages ?? {}).filter((s) => !list.includes(s));
  return el('fieldset', { className: 'slugs' }, el('legend', {}, title),
    ...list.map((slug, i) => el('div', { className: 'slug-row' },
      pageSelect(slug, (x) => { list[i] = x; changed(); }, { 'aria-label': `연결된 페이지 ${i + 1}` }),
      btn('삭제', () => { list.splice(i, 1); changed(); }, { className: 'danger', 'aria-label': `${slug} 연결 삭제` }))),
    unused.length ? select([['', '+ 페이지 연결…'], ...unused.map((s) => [s, s])], '', (s) => {
      if (!s) return;
      list.push(s);
      changed();
    }, { 'aria-label': '페이지 연결 추가' }) : null);
}

function pagesEditor() {
  const wrap = el('div', { className: 'pages' });
  for (const [slug, page] of Object.entries(data.pages)) {
    const path = `pages.${slug}`;
    wrap.append(details(path, `${slug} — ${page?.title?.ko ?? ''}`, el('div', {},
      isObj(page) ? objEditor(page, path, 'pages.*') : null,
      btn('페이지 삭제', () => deletePage(slug), { className: 'danger' })), 'card page'));
  }
  wrap.append(btn('+ 페이지 추가', addPage, { className: 'add' }));
  return wrap;
}

function addPage() {
  const input = prompt('새 페이지 주소(slug): 영문 소문자, 숫자, - 만 사용');
  if (input == null) return;
  const slug = input.trim();
  if (!/^[a-z0-9-]+$/.test(slug)) return alert('slug는 영문 소문자, 숫자, - 만 쓸 수 있습니다.');
  if (Object.hasOwn(data.pages, slug)) return alert(`"${slug}" 페이지가 이미 있습니다.`);
  data.pages[slug] = { icon: '📄', eyebrow: emptyL(), title: emptyL(), subtitle: emptyL(), blocks: [] };
  openPaths.add('pages').add(`pages.${slug}`);
  changed();
}

function deletePage(slug) {
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const quick = Array.isArray(data.quick) ? data.quick : [];
  const refs = [
    ...sections.filter((s) => Array.isArray(s?.pages) && s.pages.includes(slug)).map((s) => `섹션 "${s.id}"`),
    ...(quick.some((q) => q?.page === slug) ? ['바로가기'] : []),
  ];
  const msg = refs.length
    ? `"${slug}" 페이지를 삭제할까요?\n다음 곳에서 이 페이지를 가리키고 있으며, 함께 제거됩니다:\n${refs.join('\n')}`
    : `"${slug}" 페이지를 삭제할까요?`;
  if (!confirm(msg)) return;
  delete data.pages[slug];
  for (const s of sections) if (Array.isArray(s?.pages)) s.pages = s.pages.filter((p) => p !== slug);
  if (Array.isArray(data.quick)) data.quick = quick.filter((q) => q?.page !== slug);
  changed();
}

/* ---------- JSON tab ---------- */

function jsonStatus(text, bad) {
  const s = $('#json-status');
  s.textContent = text;
  s.className = bad ? 'bad' : 'ok';
}

function parseJsonTab() {
  try {
    const v = JSON.parse($('#json-text').value);
    if (!isObj(v)) throw new Error('최상위는 객체여야 합니다');
    return v;
  } catch (e) {
    jsonStatus(`JSON 오류: ${e.message}`, true);
    return null;
  }
}

// Pull JSON tab edits into `data`; false when it doesn't parse.
function syncFromJson() {
  const v = parseJsonTab();
  if (!v) return false;
  data = v;
  scanShapes();
  return true;
}

function showTab(t) {
  if (t === tab) return;
  if (tab === 'json' && !syncFromJson()) return;
  tab = t;
  for (const x of ['form', 'json']) {
    $(`#${x}`).hidden = x !== t;
    $(`#tab-${x}`).setAttribute('aria-selected', String(x === t));
  }
  render();
}

function render() {
  if (tab === 'json') {
    $('#json-text').value = JSON.stringify(data, null, 2);
    jsonStatus('', false);
  } else renderForm();
}

/* ---------- API / session ---------- */

async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

function showLogin(message = '') {
  $('#editor').hidden = true;
  $('#login').hidden = false;
  $('#login-error').textContent = message;
  $('#pw').value = '';
  $('#pw').focus();
}

async function showEditor() {
  if (!data) {
    const r = await api('GET', '/api/content');
    if (r.status !== 200) return showLogin(`콘텐츠를 불러오지 못했습니다 (${r.status})`);
    data = r.json;
    scanShapes();
    setClean();
  }
  $('#login').hidden = true;
  $('#editor').hidden = false;
  render();
}

const LOGIN_ERRORS = {
  401: '비밀번호가 틀렸습니다.',
  503: '관리자 비밀번호가 설정되지 않았습니다. 서버에서 npm run set-password 를 실행하세요.',
};

async function login(e) {
  e.preventDefault();
  const button = e.target.querySelector('button');
  button.disabled = true;
  try {
    const r = await api('POST', '/api/login', { password: $('#pw').value });
    if (r.status === 200) return await showEditor();
    $('#login-error').textContent = LOGIN_ERRORS[r.status] ?? `로그인 실패 (${r.status})`;
  } catch {
    $('#login-error').textContent = '서버에 연결할 수 없습니다.';
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  if (dirty && !confirm('저장하지 않은 변경 사항이 있습니다. 로그아웃할까요?')) return;
  await api('POST', '/api/logout').catch(() => {});
  showLogin();
}

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
}

function showErrors(list) {
  $('#errors-list').replaceChildren(...list.map((m) => el('li', {}, m)));
  $('#errors').hidden = false;
  $('#errors').scrollIntoView({ block: 'nearest' });
}

async function save() {
  if (tab === 'json' && !syncFromJson()) return;
  const today = new Date().toLocaleDateString('en-CA'); // en-CA formats as YYYY-MM-DD (local date)
  const body = { ...data, meta: { ...data.meta, updated: today } };
  const button = $('#save');
  button.disabled = true;
  try {
    const r = await api('PUT', '/api/content', body);
    if (r.status === 200) {
      if (isObj(data.meta)) data.meta.updated = today;
      $('#errors').hidden = true;
      setClean();
      render();
      toast('저장됨');
    } else if (r.status === 400) {
      showErrors(r.json.errors ?? [r.json.error ?? '잘못된 내용']);
    } else if (r.status === 401) {
      showLogin('세션이 만료되었습니다. 다시 로그인한 뒤 저장하세요. 편집 내용은 그대로 남아 있습니다.');
    } else {
      toast(`저장 실패 (${r.status}${r.json.error ? `: ${r.json.error}` : ''})`);
    }
  } catch {
    toast('저장 실패: 서버에 연결할 수 없습니다');
  } finally {
    button.disabled = false;
  }
}

/* ---------- wiring ---------- */

$('#login-form').addEventListener('submit', login);
$('#tab-form').addEventListener('click', () => showTab('form'));
$('#tab-json').addEventListener('click', () => showTab('json'));
$('#save').addEventListener('click', save);
$('#logout').addEventListener('click', logout);
$('#errors-close').addEventListener('click', () => { $('#errors').hidden = true; });
$('#json-text').addEventListener('input', markDirty);
$('#json-check').addEventListener('click', () => { if (parseJsonTab()) jsonStatus('올바른 JSON입니다.', false); });
addEventListener('beforeunload', (e) => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

api('GET', '/api/me').then((r) => (r.status === 200 ? showEditor() : showLogin()), () => showLogin('서버에 연결할 수 없습니다.'));
