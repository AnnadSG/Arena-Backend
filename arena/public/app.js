import { GAMES } from '/shared/games/index.js';
import { COLS, cellName } from '/shared/board.js';

// ---------- Drawing helpers per game (UI only; rules live in /shared) ----------
const CAT = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 35V8l9 8h8l9-8v27z" fill="currentColor"/><circle cx="15" cy="23" r="2.6" fill="#fff"/><circle cx="25" cy="23" r="2.6" fill="#fff"/><path d="M18 29h4l-2 2z" fill="#fff"/></svg>';
const DOG = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="10" y="9" width="20" height="25" rx="9" fill="currentColor"/><ellipse cx="8" cy="18" rx="5" ry="10" fill="currentColor" opacity=".75"/><ellipse cx="32" cy="18" rx="5" ry="10" fill="currentColor" opacity=".75"/><circle cx="16" cy="19" r="2.4" fill="#fff"/><circle cx="24" cy="19" r="2.4" fill="#fff"/><ellipse cx="20" cy="27" rx="3.6" ry="2.6" fill="#fff"/></svg>';
const STONE = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="22" r="14" fill="#0003"/><circle cx="20" cy="19" r="14" fill="#fff" stroke="#141414" stroke-width="3"/></svg>';

const UI = {
  dominorio: {
    pick(s, i, legal) {
      const c = s.p === 0 ? [[i, i + 8], [i - 8, i]] : [[i, i + 1], [i - 1, i]];
      for (const [a, b] of c) { const m = legal.find((m) => m[0] === a && m[1] === b); if (m) return m; }
      return null;
    },
    cell(s, i) {
      if (!s.b[i]) return { cls: '', html: '' };
      const id = s.id[i];
      let k = 'd' + s.b[i];
      if (i < 56 && s.id[i + 8] === id) k += ' top';
      else if (i >= 8 && s.id[i - 8] === id) k += ' bot';
      else if (i % 8 < 7 && s.id[i + 1] === id) k += ' lft';
      else if (i % 8 && s.id[i - 1] === id) k += ' rgt';
      return { cls: k, html: '' };
    },
    isLast: (s, i) => !!s.last && s.last.includes(i),
    cellsOf: (m) => m,
  },
  'caes-e-gatos': {
    pick: (s, i, legal) => (legal.includes(i) ? i : null),
    cell(s, i) {
      const v = s.b[i];
      if (!v) return { cls: '', html: '' };
      return { cls: '', html: `<span class="g${v - 1}" style="display:flex;width:100%;height:100%;align-items:center;justify-content:center">${v === 1 ? CAT : DOG}</span>` };
    },
    isLast: (s, i) => s.last === i,
    cellsOf: (m) => [m],
  },
  rastos: {
    pick: (s, i, legal) => (legal.includes(i) ? i : null),
    cell(s, i) {
      if (s.k === i) return { cls: '', html: STONE };
      if (s.b[i]) return { cls: 'x', html: '' };
      if (i === 56) return { cls: '', html: '<span class="goal g0">1</span>' };
      if (i === 7) return { cls: '', html: '<span class="goal g1">2</span>' };
      return { cls: '', html: '' };
    },
    isLast: (s, i) => s.last === i,
    cellsOf: (m) => [m],
  },
};

// ---------- State ----------
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const socket = io();
let gameId = 'dominorio';
let me = null;
let match = null;
let levels = [];
let hover = -1;
let prevLen = 0;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const emit = (ev, data) => new Promise((resolve) => socket.emit(ev, data, resolve));
const showError = (msg) => { $('err').textContent = msg || ''; };
const game = () => GAMES[match?.gameId ?? gameId];
const mySeat = () => (match && me ? match.seats.findIndex((s) => s && s.id === me.id) : -1);

// ---------- Rendering ----------
function renderTabs() {
  $('tabs').innerHTML = Object.values(GAMES)
    .map((g) => `<button role="tab" data-g="${g.id}" aria-selected="${g.id === gameId}">${esc(g.title)}</button>`).join('');
  $('rules').innerHTML = GAMES[gameId].rules.map((r) => `<p>${esc(r)}</p>`).join('');
  const side = $('side').value || '0';
  $('side').innerHTML = GAMES[gameId].players.map((p, i) => `<option value="${i}">${esc(p)}${i === 0 ? ' (começa)' : ''}</option>`).join('');
  $('side').value = side;
}

function renderForm() {
  const mode = $('mode').value;
  $('sideL').hidden = mode !== 'ai';
  $('levelL').hidden = mode === 'pvp';
  $('level2L').hidden = mode !== 'aivai';
  $('levelL').firstChild.textContent = mode === 'aivai' ? 'Primeiro agente' : 'Agente';
  $('create').disabled = !me && mode !== 'aivai';
}

function renderBoard(fresh) {
  const g = game();
  const ui = UI[g.id];
  const s = match ? match.state : g.init();
  const seat = mySeat();
  const canPlay = match?.status === 'playing' && seat === s.p;
  const legal = canPlay ? g.moves(s) : [];
  const ok = new Set(legal.flatMap((m) => ui.cellsOf(m)));
  const pv = canPlay && hover >= 0 && g.id === 'dominorio' ? ui.pick(s, hover, legal) ?? [] : [];

  let h = '';
  for (let y = 0; y < 8; y++) {
    h += `<div class="lab">${8 - y}</div>`;
    for (let x = 0; x < 8; x++) {
      const i = y * 8 + x;
      const c = ui.cell(s, i);
      let cls = 'c' + ((x + y) % 2 ? ' alt' : '') + (c.cls ? ' ' + c.cls : '');
      if (ok.has(i) && !c.cls && !c.html.includes('svg')) cls += ' ok';
      if (pv.includes(i)) cls += ' pv';
      if (ui.isLast(s, i)) cls += ' last' + (fresh ? ' new' : '');
      h += `<button class="${cls}" data-i="${i}" style="--pc:var(--p${s.p})" aria-label="${cellName(i)}"${canPlay ? '' : ' tabindex="-1"'}>${c.html}</button>`;
    }
  }
  h += '<div></div>' + [...COLS].map((c) => `<div class="lab">${c}</div>`).join('');
  $('board').innerHTML = h;
}

function seatName(i) {
  const s = match.seats[i];
  if (!s) return 'à espera…';
  return s.name + (me && s.id === me.id ? ' (tu)' : '');
}

function renderMatch(fresh) {
  renderBoard(fresh);
  const g = game();
  if (!match) {
    $('matchbar').hidden = true;
    $('log').innerHTML = '';
    return;
  }
  const s = match.state;
  const dot = (p) => `<span class="dot" style="background:var(--p${p})"></span>`;
  let status;
  if (match.status === 'waiting') status = `${dot(0)}À espera do adversário — partilha o código`;
  else if (match.status === 'finished') {
    const elo = match.elo ? ` · ELO ${match.elo.before[match.winner]}→${match.elo.after[match.winner]}` : '';
    status = `${dot(match.winner)}Ganhou ${esc(g.players[match.winner])}: ${esc(seatName(match.winner))}${elo}`;
  } else {
    const seat = match.seats[s.p];
    status = `${dot(s.p)}${seat.type === 'ai' ? `${esc(seat.name)} está a pensar…` : `Vez de ${esc(g.players[s.p])}: ${esc(seatName(s.p))}`}`;
  }
  $('status').innerHTML = status;
  $('matchbar').hidden = false;
  $('code').textContent = match.code;
  $('resign').hidden = !(match.status === 'playing' && mySeat() >= 0);
  $('copy').hidden = match.mode !== 'pvp';

  $('log').innerHTML = match.log.map((x) => `<li><span class="g${x.seat}" style="font-weight:800">${esc(g.players[x.seat][0])}</span> ${esc(x.label)}</li>`).join('');
  $('log').scrollTop = 1e6;

  const r = match.lastSearch;
  if (r) {
    $('sd').textContent = r.depth;
    $('sn').textContent = r.nodes.toLocaleString('pt-PT');
    $('st').textContent = `${r.timeMs} ms`;
    $('se').textContent = Math.abs(r.score) > 9000 ? (r.score > 0 ? '+V' : '−V') : (r.score > 0 ? '+' : '') + r.score;
  }
  if (match.status === 'finished') loadTables();
}

async function loadTables() {
  try {
    const [elo, recent] = await Promise.all([
      fetch(`/api/leaderboard?game=${gameId}`).then((r) => r.json()),
      fetch(`/api/matches?game=${gameId}`).then((r) => r.json()),
    ]);
    $('board-elo').tBodies[0].innerHTML = elo.length
      ? elo.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}${p.is_bot ? ' <span class="tag">agente</span>' : ''}</td><td class="n">${Number(p.elo)}</td><td class="n">${Number(p.games)}</td><td class="n">${Number(p.wins)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">Ainda não há partidas terminadas neste jogo.</td></tr>';
    $('recent').tBodies[0].innerHTML = recent.length
      ? recent.map((m) => `<tr><td>${esc(m.player0)}</td><td>${esc(m.player1)}</td><td>${esc(m.winner === 0 ? m.player0 : m.player1)}</td><td class="n">${Number(m.n_moves)}</td><td class="n">${Number(m.elo_delta)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">Sem partidas.</td></tr>';
  } catch {
    showError('Não foi possível carregar o ranking.');
  }
}

// ---------- Actions ----------
async function hello(name) {
  const r = await emit('hello', { name });
  if (!r.ok) return showError(r.error);
  me = r.player;
  store.set('arena:name', me.name);
  $('me').textContent = `Ligado como ${me.name}.`;
  showError('');
  renderForm();
  renderMatch();
}

function setMatch(m) {
  const fresh = m.log.length !== prevLen;
  prevLen = m.log.length;
  match = m;
  if (m.gameId !== gameId) { gameId = m.gameId; renderTabs(); loadTables(); }
  renderMatch(fresh);
}

$('helloForm').addEventListener('submit', (e) => { e.preventDefault(); hello($('name').value); });

$('create').addEventListener('click', async () => {
  const mode = $('mode').value;
  const r = await emit('match:create', {
    gameId, mode, side: Number($('side').value), level: Number($('level').value),
    levels: [Number($('level').value), Number($('level2').value)],
  });
  if (!r.ok) return showError(r.error);
  showError('');
  prevLen = -1;
  setMatch(r.match);
});

$('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await emit('match:join', { code: $('joinCode').value.trim() });
  if (!r.ok) return showError(r.error);
  showError('');
  setMatch(r.match);
});

$('resign').addEventListener('click', async () => {
  const r = await emit('match:resign', { id: match.id });
  if (!r.ok) showError(r.error);
});

$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(match.code); $('copy').textContent = 'Copiado'; }
  catch { $('copy').textContent = match.code; }
  setTimeout(() => { $('copy').textContent = 'Copiar código'; }, 1500);
});

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  gameId = b.dataset.g;
  match = null;
  renderTabs();
  renderMatch();
  loadTables();
});

$('board').addEventListener('click', async (e) => {
  const b = e.target.closest('.c');
  if (!b || !match || match.status !== 'playing' || mySeat() !== match.state.p) return;
  const g = game();
  const move = UI[g.id].pick(match.state, Number(b.dataset.i), g.moves(match.state));
  if (move === null) return;
  const r = await emit('match:move', { id: match.id, move });
  if (!r.ok) showError(r.error);
});
$('board').addEventListener('pointerover', (e) => {
  if (game().id !== 'dominorio') return;
  const b = e.target.closest('.c');
  const i = b ? Number(b.dataset.i) : -1;
  if (i !== hover) { hover = i; renderBoard(); }
});
$('board').addEventListener('pointerleave', () => { if (hover >= 0) { hover = -1; renderBoard(); } });
$('mode').addEventListener('change', renderForm);

socket.on('match:state', (m) => { if (match && m.id === match.id) setMatch(m); });
socket.on('connect', async () => {
  const saved = me?.name ?? store.get('arena:name');
  if (saved) { $('name').value = saved; await hello(saved); }
  if (match) { // re-subscribe after a reconnect
    const r = await emit('match:join', { code: match.code });
    if (r.ok) setMatch(r.match);
  }
});
socket.on('disconnect', () => showError('Ligação ao servidor perdida — a tentar de novo…'));

// ---------- Boot ----------
const info = await fetch('/api/games').then((r) => r.json()).catch(() => null);
levels = info?.levels ?? [];
const opts = levels.map((l) => `<option value="${l.level}">${esc(l.name)}</option>`).join('');
$('level').innerHTML = opts;
$('level2').innerHTML = opts;
$('level').value = '1';
$('level2').value = '2';
renderTabs();
renderForm();
renderMatch();
loadTables();
