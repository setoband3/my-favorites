// ── Storage Keys ──────────────────────────────────────────────────
const KEY_PW   = 'myfav_pw';
const KEY_DATA = 'myfav_data';
const KEY_GH   = 'myfav_github';

// ── State ─────────────────────────────────────────────────────────
const state = {
  data:           { genres: [], bookmarks: [] },
  github:         { owner: '', repo: '', token: '' },
  currentGenreId: null,
  editingBmId:    null,
  editingGenreId: null,
};

// ── Init ──────────────────────────────────────────────────────────
function init() {
  const gh = JSON.parse(localStorage.getItem(KEY_GH) || '{}');
  state.github = { owner: gh.owner || '', repo: gh.repo || '', token: gh.token || '' };

  const hasPw = !!localStorage.getItem(KEY_PW);
  if (!hasPw) {
    document.getElementById('lockMsg').textContent = '初回設定：パスワードを設定してください';
    document.getElementById('unlockBtn').textContent = 'パスワードを設定する';
  }

  // ロック画面
  document.getElementById('pwInput').addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
  document.getElementById('unlockBtn').addEventListener('click', unlock);

  // ヘッダー
  document.getElementById('lockBtn').addEventListener('click', lock);
  document.getElementById('addBtn').addEventListener('click', () => openBmModal());
  document.getElementById('emptyAddBtn').addEventListener('click', () => openBmModal());
  document.getElementById('addGenreBtn').addEventListener('click', () => openGenreModal());
  document.getElementById('syncBtn').addEventListener('click', pushToGitHub);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);

  // お気に入りモーダル
  document.getElementById('saveBmBtn').addEventListener('click', saveBookmark);
  document.getElementById('deleteBmBtn').addEventListener('click', deleteBookmark);
  document.getElementById('cancelBmBtn').addEventListener('click', () => closeModal('bookmarkModal'));

  // ジャンルモーダル
  document.getElementById('saveGenreBtn').addEventListener('click', saveGenre);
  document.getElementById('deleteGenreBtn').addEventListener('click', deleteGenre);
  document.getElementById('cancelGenreBtn').addEventListener('click', () => closeModal('genreModal'));

  // 設定モーダル
  document.getElementById('changePwBtn').addEventListener('click', changePassword);
  document.getElementById('saveGhBtn').addEventListener('click', saveGithubSettings);
  document.getElementById('pullGhBtn').addEventListener('click', pullFromGitHub);
  document.getElementById('closeSettingsBtn').addEventListener('click', () => closeModal('settingsModal'));

  // オーバーレイクリックで閉じる
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden'); });
  });
}

// ── Password ──────────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function unlock() {
  const pw = document.getElementById('pwInput').value;
  if (!pw) return;

  const storedHash = localStorage.getItem(KEY_PW);
  const hash = await sha256(pw);

  if (!storedHash) {
    localStorage.setItem(KEY_PW, hash);
    enterApp();
    return;
  }

  if (hash === storedHash) {
    document.getElementById('lockErr').classList.add('hidden');
    enterApp();
  } else {
    document.getElementById('lockErr').classList.remove('hidden');
    document.getElementById('pwInput').value = '';
    document.getElementById('pwInput').focus();
  }
}

function lock() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('lockScreen').classList.remove('hidden');
  document.getElementById('pwInput').value = '';
  const hasPw = !!localStorage.getItem(KEY_PW);
  document.getElementById('lockMsg').textContent = hasPw ? 'パスワードを入力してください' : '初回設定：パスワードを設定してください';
  document.getElementById('unlockBtn').textContent = hasPw ? 'ロック解除' : 'パスワードを設定する';
  document.getElementById('lockErr').classList.add('hidden');
}

async function enterApp() {
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  await loadData();
  render();
}

async function changePassword() {
  const newPw  = document.getElementById('newPw').value;
  const confirm = document.getElementById('newPwConfirm').value;
  const msg = document.getElementById('pwMsg');

  if (!newPw) return;
  if (newPw !== confirm) {
    showStatusMsg(msg, 'パスワードが一致しません', 'err');
    return;
  }
  localStorage.setItem(KEY_PW, await sha256(newPw));
  document.getElementById('newPw').value = '';
  document.getElementById('newPwConfirm').value = '';
  showStatusMsg(msg, 'パスワードを変更しました ✓', 'ok');
}

// ── Data ──────────────────────────────────────────────────────────
async function loadData() {
  // ローカルストレージ優先、なければ data.json を取得
  const local = localStorage.getItem(KEY_DATA);
  if (local) {
    state.data = JSON.parse(local);
  } else {
    try {
      const res = await fetch('data.json?_=' + Date.now());
      if (res.ok) state.data = await res.json();
    } catch {}
    saveLocal();
  }
  if (!state.currentGenreId && state.data.genres.length > 0) {
    state.currentGenreId = state.data.genres[0].id;
  }
}

function saveLocal() {
  localStorage.setItem(KEY_DATA, JSON.stringify(state.data));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── GitHub Sync ───────────────────────────────────────────────────
async function pushToGitHub() {
  const { owner, repo, token } = state.github;
  if (!owner || !repo || !token) {
    toast('GitHub設定が未完了です。設定から入力してください。', 'err');
    openSettings();
    return;
  }

  const btn = document.getElementById('syncBtn');
  btn.textContent = '⟳ 同期中…';
  btn.disabled = true;

  try {
    const sha = await getFileSha(owner, repo, token);
    const content = toBase64(JSON.stringify(state.data, null, 2));
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data.json`, {
      method: 'PUT',
      headers: ghHeaders(token),
      body: JSON.stringify({ message: 'Update favorites', content, ...(sha && { sha }) }),
    });
    if (!res.ok) throw new Error((await res.json()).message);
    toast('GitHubに同期しました ✓', 'ok');
  } catch (e) {
    toast('同期失敗: ' + e.message, 'err');
  } finally {
    btn.textContent = '⟳ 同期';
    btn.disabled = false;
  }
}

async function pullFromGitHub() {
  const { owner, repo, token } = state.github;
  if (!owner || !repo || !token) {
    showStatusMsg(document.getElementById('ghMsg'), 'GitHub設定を先に保存してください', 'err');
    return;
  }

  const btn = document.getElementById('pullGhBtn');
  btn.textContent = '読み込み中…';
  btn.disabled = true;

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data.json`, {
      headers: ghHeaders(token),
    });
    if (!res.ok) throw new Error((await res.json()).message);
    const file = await res.json();
    const text = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
    state.data = JSON.parse(text);
    if (!state.currentGenreId && state.data.genres.length > 0) {
      state.currentGenreId = state.data.genres[0].id;
    }
    saveLocal();
    render();
    showStatusMsg(document.getElementById('ghMsg'), 'GitHubから読み込みました ✓', 'ok');
  } catch (e) {
    showStatusMsg(document.getElementById('ghMsg'), '読み込み失敗: ' + e.message, 'err');
  } finally {
    btn.textContent = 'GitHubから読み込む';
    btn.disabled = false;
  }
}

async function getFileSha(owner, repo, token) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data.json`, {
    headers: ghHeaders(token),
  });
  if (!res.ok) return null;
  return (await res.json()).sha;
}

function ghHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
}

function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// ── Settings ──────────────────────────────────────────────────────
function openSettings() {
  document.getElementById('ghOwner').value = state.github.owner;
  document.getElementById('ghRepo').value  = state.github.repo;
  document.getElementById('ghToken').value = state.github.token;
  document.getElementById('settingsModal').classList.remove('hidden');
}

function saveGithubSettings() {
  state.github.owner = document.getElementById('ghOwner').value.trim();
  state.github.repo  = document.getElementById('ghRepo').value.trim();
  state.github.token = document.getElementById('ghToken').value.trim();
  localStorage.setItem(KEY_GH, JSON.stringify(state.github));
  showStatusMsg(document.getElementById('ghMsg'), 'GitHub設定を保存しました ✓', 'ok');
}

// ── Modals ────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function openBmModal(bm = null) {
  state.editingBmId = bm ? bm.id : null;
  document.getElementById('bmHeading').textContent = bm ? 'お気に入りを編集' : 'お気に入りを追加';
  document.getElementById('bUrl').value   = bm ? bm.url : '';
  document.getElementById('bTitle').value = bm ? bm.title : '';
  document.getElementById('bDesc').value  = bm ? (bm.description || '') : '';

  const sel = document.getElementById('bGenre');
  sel.innerHTML = '';
  [...state.data.genres].sort((a, b) => a.order - b.order).forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    if ((bm && bm.genreId === g.id) || (!bm && g.id === state.currentGenreId)) opt.selected = true;
    sel.appendChild(opt);
  });

  document.getElementById('deleteBmBtn').classList.toggle('hidden', !bm);
  document.getElementById('bookmarkModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('bUrl').focus(), 50);
}

function openGenreModal(g = null) {
  state.editingGenreId = g ? g.id : null;
  document.getElementById('genreHeading').textContent = g ? 'ジャンルを編集' : 'ジャンルを追加';
  document.getElementById('gName').value = g ? g.name : '';
  document.getElementById('deleteGenreBtn').classList.toggle('hidden', !g);
  document.getElementById('genreModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('gName').focus(), 50);
}

// ── CRUD: Bookmark ────────────────────────────────────────────────
function saveBookmark() {
  const url     = document.getElementById('bUrl').value.trim();
  const title   = document.getElementById('bTitle').value.trim();
  const desc    = document.getElementById('bDesc').value.trim();
  const genreId = document.getElementById('bGenre').value;

  if (!url || !title) { alert('URLとタイトルは必須です'); return; }

  if (state.editingBmId) {
    const bm = state.data.bookmarks.find(b => b.id === state.editingBmId);
    if (bm) Object.assign(bm, { url, title, description: desc, genreId });
  } else {
    const maxOrder = state.data.bookmarks
      .filter(b => b.genreId === genreId)
      .reduce((m, b) => Math.max(m, b.order), -1);
    state.data.bookmarks.push({ id: uid(), genreId, title, url, description: desc, order: maxOrder + 1 });
  }

  saveLocal();
  closeModal('bookmarkModal');
  render();
}

function deleteBookmark() {
  if (!state.editingBmId) return;
  if (!confirm('このお気に入りを削除しますか？')) return;
  state.data.bookmarks = state.data.bookmarks.filter(b => b.id !== state.editingBmId);
  saveLocal();
  closeModal('bookmarkModal');
  render();
}

// ── CRUD: Genre ───────────────────────────────────────────────────
function saveGenre() {
  const name = document.getElementById('gName').value.trim();
  if (!name) return;

  if (state.editingGenreId) {
    const g = state.data.genres.find(g => g.id === state.editingGenreId);
    if (g) g.name = name;
  } else {
    const maxOrder = state.data.genres.reduce((m, g) => Math.max(m, g.order), -1);
    const newG = { id: uid(), name, order: maxOrder + 1 };
    state.data.genres.push(newG);
    state.currentGenreId = newG.id;
  }

  saveLocal();
  closeModal('genreModal');
  render();
}

function deleteGenre() {
  if (!state.editingGenreId) return;
  const hasItems = state.data.bookmarks.some(b => b.genreId === state.editingGenreId);
  const msg = hasItems
    ? 'このジャンルのお気に入りもすべて削除されます。よろしいですか？'
    : 'このジャンルを削除しますか？';
  if (!confirm(msg)) return;

  state.data.bookmarks = state.data.bookmarks.filter(b => b.genreId !== state.editingGenreId);
  state.data.genres    = state.data.genres.filter(g => g.id !== state.editingGenreId);

  if (state.currentGenreId === state.editingGenreId) {
    state.currentGenreId = state.data.genres[0]?.id || null;
  }

  saveLocal();
  closeModal('genreModal');
  render();
}

// ── Render ────────────────────────────────────────────────────────
function render() {
  renderGenreTabs();
  renderCards();
}

function renderGenreTabs() {
  const container = document.getElementById('genreTabs');
  container.innerHTML = '';

  [...state.data.genres]
    .sort((a, b) => a.order - b.order)
    .forEach(g => {
      const btn = document.createElement('button');
      btn.className   = 'genre-tab' + (g.id === state.currentGenreId ? ' active' : '');
      btn.textContent = g.name;
      btn.dataset.genreId = g.id;
      btn.draggable = true;

      btn.addEventListener('click',    () => { state.currentGenreId = g.id; render(); });
      btn.addEventListener('dblclick', () => openGenreModal(g));
      btn.addEventListener('dragstart', onGenreDragStart);
      btn.addEventListener('dragover',  onGenreDragOver);
      btn.addEventListener('drop',      onGenreDrop);
      btn.addEventListener('dragend',   onGenreDragEnd);

      container.appendChild(btn);
    });
}

function renderCards() {
  const grid  = document.getElementById('cards');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';

  if (!state.currentGenreId) { empty.classList.remove('hidden'); return; }

  const bms = state.data.bookmarks
    .filter(b => b.genreId === state.currentGenreId)
    .sort((a, b) => a.order - b.order);

  empty.classList.toggle('hidden', bms.length > 0);

  bms.forEach(bm => grid.appendChild(createCard(bm)));
}

function createCard(bm) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.bmId = bm.id;

  let domain = '';
  try { domain = new URL(bm.url).hostname; } catch {}
  const favicon = domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    : '';

  card.innerHTML = `
    <div class="card-top">
      <img class="card-favicon" src="${favicon}" alt=""
           onerror="this.style.display='none'">
      <span class="card-title">${esc(bm.title)}</span>
    </div>
    ${bm.description ? `<div class="card-desc">${esc(bm.description)}</div>` : ''}
    <div class="card-domain">${esc(domain)}</div>
    <button class="card-edit-btn" title="編集">✎</button>
  `;

  card.addEventListener('click', e => {
    if (e.target.classList.contains('card-edit-btn')) return;
    window.open(bm.url, '_blank', 'noopener,noreferrer');
  });

  card.querySelector('.card-edit-btn').addEventListener('click', e => {
    e.stopPropagation();
    openBmModal(bm);
  });

  card.addEventListener('dragstart', onCardDragStart);
  card.addEventListener('dragover',  onCardDragOver);
  card.addEventListener('drop',      onCardDrop);
  card.addEventListener('dragend',   onCardDragEnd);

  return card;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Drag & Drop: Cards ────────────────────────────────────────────
let dragBmId = null;

function onCardDragStart(e) {
  dragBmId = e.currentTarget.dataset.bmId;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onCardDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over-card');
}

function onCardDrop(e) {
  e.preventDefault();
  const targetId = e.currentTarget.dataset.bmId;
  if (dragBmId === targetId) return;

  const items = state.data.bookmarks
    .filter(b => b.genreId === state.currentGenreId)
    .sort((a, b) => a.order - b.order);

  const fi = items.findIndex(b => b.id === dragBmId);
  const ti = items.findIndex(b => b.id === targetId);
  if (fi === -1 || ti === -1) return;

  items.splice(ti, 0, items.splice(fi, 1)[0]);
  items.forEach((b, i) => { b.order = i; });

  saveLocal();
  render();
}

function onCardDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drag-over-card').forEach(c => c.classList.remove('drag-over-card'));
  dragBmId = null;
}

// ── Drag & Drop: Genres ───────────────────────────────────────────
let dragGenreId = null;

function onGenreDragStart(e) {
  dragGenreId = e.currentTarget.dataset.genreId;
  e.dataTransfer.effectAllowed = 'move';
}

function onGenreDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over-tab');
}

function onGenreDrop(e) {
  e.preventDefault();
  const targetId = e.currentTarget.dataset.genreId;
  if (dragGenreId === targetId) return;

  const items = [...state.data.genres].sort((a, b) => a.order - b.order);
  const fi = items.findIndex(g => g.id === dragGenreId);
  const ti = items.findIndex(g => g.id === targetId);
  if (fi === -1 || ti === -1) return;

  items.splice(ti, 0, items.splice(fi, 1)[0]);
  items.forEach((g, i) => { g.order = i; });

  saveLocal();
  renderGenreTabs();
}

function onGenreDragEnd(e) {
  e.currentTarget.classList.remove('drag-over-tab');
  document.querySelectorAll('.drag-over-tab').forEach(t => t.classList.remove('drag-over-tab'));
  dragGenreId = null;
}

// ── Toast / Status ────────────────────────────────────────────────
function toast(msg, type = '') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function showStatusMsg(el, msg, type) {
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── Start ─────────────────────────────────────────────────────────
init();
