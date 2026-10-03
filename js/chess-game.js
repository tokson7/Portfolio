/* chess-game.js — custom board renderer on top of chess.js (rules engine).
 *
 * Rules (castling, en passant, promotion, check, mate, every draw rule) come
 * from chess.js; this file owns input, rendering, the AI and move review.
 *
 * The game is stored as a list of verbose moves from the start position, so
 * any earlier position can be rebuilt for review without touching `game`.
 */

/* ─── State ────────────────────────────────────────────── */
var game           = null;   /* live position (chess.js instance) */
var playerColor    = 'w';
var playerName     = 'Anonymous';
var difficulty     = 'medium';
var selectedSquare = null;
var legalTargets   = {};     /* target square → { to, flags } for the selected piece */
var moveList       = [];     /* verbose moves played, in order */
var viewPly        = null;   /* null = live; otherwise number of moves shown */
var resigned       = false;
var aiToken        = 0;      /* bumped to cancel a pending AI move */
var aiPending      = false;
var pendingPromotion = null; /* { from, to } while the picker is open */
var animateNext    = null;   /* { from, to, rook? } slide on next render */

var DEPTH_MAP = { easy: 1, medium: 3, hard: 4 };
var FILES = ['a','b','c','d','e','f','g','h'];
var PIECE_VALUES = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 }; /* for the material count */
var START_COUNT  = { p: 8, n: 2, b: 2, r: 2, q: 1 };
var CASTLE_ROOK  = { /* king target → rook from/to */
  g1: { from: 'h1', to: 'f1' }, c1: { from: 'a1', to: 'd1' },
  g8: { from: 'h8', to: 'f8' }, c8: { from: 'a8', to: 'd8' }
};

function T() { return window.CHESS_T || {}; }
function pieceCode(p) { return p.color + p.type.toUpperCase(); }
function isLive() { return viewPly === null || viewPly === moveList.length; }
function isOver() { return resigned || game.game_over(); }

/* Position for the move being viewed (live game when not reviewing). */
function viewedPosition() {
  if (isLive()) return game;
  var g = new Chess();
  for (var i = 0; i < viewPly; i++) g.move(moveList[i]);
  return g;
}

/* ─── Board rendering ──────────────────────────────────── */
function squareOrder() {
  var rows = [0,1,2,3,4,5,6,7], cols = [0,1,2,3,4,5,6,7];
  if (playerColor === 'b') { rows.reverse(); cols.reverse(); }
  return { rows: rows, cols: cols };
}

function renderBoard() {
  var el = document.getElementById('board');
  if (!el) return;
  var pos   = viewedPosition();
  var state = pos.board();
  var live  = isLive();
  var shown = live ? moveList.length : viewPly;
  var last  = shown > 0 ? moveList[shown - 1] : null;
  var checkColor = pos.in_check() ? pos.turn() : null;
  var order = squareOrder();

  /* Rook squares that castle when clicked with the king selected */
  var castleRooks = {};
  Object.keys(legalTargets).forEach(function (t) {
    var m = legalTargets[t];
    if (m.via) castleRooks[t] = true;
  });

  var frag = document.createDocumentFragment();
  for (var ri = 0; ri < 8; ri++) {
    for (var ci = 0; ci < 8; ci++) {
      var row = order.rows[ri], col = order.cols[ci];
      var name = FILES[col] + (8 - row);
      var piece = state[row][col];
      var sq = document.createElement('div');
      sq.className = 'square ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.square = name;

      if (last && (last.from === name || last.to === name)) sq.classList.add('last-move');
      if (live && selectedSquare === name) sq.classList.add('selected');
      if (live && legalTargets[name]) {
        if (castleRooks[name]) sq.classList.add('castle-target');
        else {
          var f = legalTargets[name].flags;
          sq.classList.add(f.indexOf('c') !== -1 || f.indexOf('e') !== -1 ? 'legal-capture' : 'legal-move');
        }
      }
      if (piece && piece.type === 'k' && piece.color === checkColor) sq.classList.add('in-check');

      if (piece) {
        var span = document.createElement('span');
        span.className = 'piece ' + pieceCode(piece);
        sq.appendChild(span);
      }
      if (ri === 7) {
        var fl = document.createElement('span'); fl.className = 'coord-file';
        fl.textContent = FILES[col]; sq.appendChild(fl);
      }
      if (ci === 0) {
        var rk = document.createElement('span'); rk.className = 'coord-rank';
        rk.textContent = 8 - row; sq.appendChild(rk);
      }
      frag.appendChild(sq);
    }
  }
  el.innerHTML = '';
  el.appendChild(frag);
  el.classList.toggle('reviewing', !live);

  if (animateNext) { runSlide(animateNext); animateNext = null; }
  updateReviewUi();
}

function squareEl(name) {
  return document.querySelector('#board .square[data-square="' + name + '"]');
}

/* Slide the moved piece (and the rook when castling) from its old square. */
function runSlide(a) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var pairs = [[a.from, a.to]];
  if (a.rook) pairs.push([a.rook.from, a.rook.to]);
  pairs.forEach(function (p) {
    var fromEl = squareEl(p[0]), toEl = squareEl(p[1]);
    if (!fromEl || !toEl) return;
    var piece = toEl.querySelector('.piece');
    if (!piece) return;
    var fr = fromEl.getBoundingClientRect(), tr = toEl.getBoundingClientRect();
    piece.style.transition = 'none';
    piece.style.transform = 'translate(' + (fr.left - tr.left) + 'px,' + (fr.top - tr.top) + 'px)';
    piece.style.zIndex = 5;
    piece.getBoundingClientRect(); /* commit the start position */
    piece.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.7, 0.2, 1)';
    piece.style.transform = '';
    setTimeout(function () { piece.style.zIndex = ''; piece.style.transition = ''; }, 220);
  });
}

/* ─── Selection & moves ────────────────────────────────── */
function selectSquare(name) {
  selectedSquare = name;
  legalTargets = {};
  game.moves({ square: name, verbose: true }).forEach(function (m) {
    legalTargets[m.to] = { to: m.to, flags: m.flags };
    /* Castling can also be played by clicking the rook */
    if (m.flags.indexOf('k') !== -1 || m.flags.indexOf('q') !== -1) {
      var rook = CASTLE_ROOK[m.to];
      if (rook) legalTargets[rook.from] = { to: m.to, flags: m.flags, via: true };
    }
  });
}

function clearSelection() { selectedSquare = null; legalTargets = {}; }

function canPlayerMove() {
  return game && !isOver() && game.turn() === playerColor && !aiPending && !pendingPromotion;
}

/* Try to play selected piece → target. Returns true if a move was made or a
   promotion choice opened. */
function tryMove(target, opts) {
  var lt = legalTargets[target];
  if (!selectedSquare || !lt) return false;
  var from = selectedSquare, to = lt.to;
  if (lt.flags.indexOf('p') !== -1) {
    openPromotion(from, to);
    return true;
  }
  return commitMove({ from: from, to: to }, opts);
}

function commitMove(spec, opts) {
  var mv = game.move(spec);
  if (!mv) return false;
  moveList.push(mv);
  viewPly = null;
  clearSelection();
  if (!(opts && opts.dragged)) {
    animateNext = { from: mv.from, to: mv.to, rook: (mv.flags.indexOf('k') !== -1 || mv.flags.indexOf('q') !== -1) ? CASTLE_ROOK[mv.to] : null };
  }
  afterMove();
  if (!checkGameOver() && game.turn() !== playerColor) scheduleAi(300);
  return true;
}

function afterMove() {
  renderBoard(); updateStatus(); updateMoveHistory(); updateCaptured();
}

/* ─── Promotion picker ─────────────────────────────────── */
function openPromotion(from, to) {
  pendingPromotion = { from: from, to: to };
  var picker = document.getElementById('promo-picker');
  var target = squareEl(to);
  if (!picker || !target) { pendingPromotion = null; commitMove({ from: from, to: to, promotion: 'q' }); return; }
  var br = picker.parentNode.getBoundingClientRect(), tr = target.getBoundingClientRect(); /* parent is the positioned .board-wrap */
  picker.innerHTML = '';
  ['q','n','r','b'].forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'promo-option';
    b.setAttribute('aria-label', (T()['promo_' + t]) || t);
    b.innerHTML = '<span class="piece ' + playerColor + t.toUpperCase() + '"></span>';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var p = pendingPromotion; closePromotion();
      if (p) commitMove({ from: p.from, to: p.to, promotion: t });
    });
    picker.appendChild(b);
  });
  picker.style.width = tr.width + 'px';
  picker.style.left = (tr.left - br.left) + 'px';
  picker.style.top = (tr.top - br.top) + 'px'; /* promotion square is always on the top rank */
  picker.classList.add('visible');
  picker.querySelector('button').focus();
}

function closePromotion() {
  pendingPromotion = null;
  var picker = document.getElementById('promo-picker');
  if (picker) { picker.classList.remove('visible'); picker.innerHTML = ''; }
}

/* ─── Pointer input: click-to-move and drag-and-drop ──── */
var drag = null; /* { from, ghost, pieceEl, startX, startY, moved, deselectOnUp } */

function squareAtPoint(x, y) {
  var el = document.elementFromPoint(x, y);
  var sq = el && el.closest ? el.closest('#board .square') : null;
  return sq ? sq.dataset.square : null;
}

function onBoardPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  var sqEl = e.target.closest('.square');
  if (!sqEl) return;
  var name = sqEl.dataset.square;

  if (pendingPromotion) { closePromotion(); clearSelection(); renderBoard(); return; }

  /* Reviewing an earlier move: any board press returns to the live game */
  if (!isLive()) { goLive(); return; }
  if (!canPlayerMove()) return;
  e.preventDefault();

  /* Second press on a legal target (incl. a rook for castling) plays the move */
  if (selectedSquare && legalTargets[name] && name !== selectedSquare) {
    tryMove(name);
    return;
  }

  var piece = game.get(name);
  if (piece && piece.color === playerColor) {
    var already = selectedSquare === name;
    selectSquare(name);
    renderBoard();
    var pieceEl = squareEl(name).querySelector('.piece');
    drag = { from: name, pieceEl: pieceEl, ghost: null, startX: e.clientX, startY: e.clientY, moved: false, deselectOnUp: already };
    try { document.getElementById('board').setPointerCapture(e.pointerId); } catch (err) {}
  } else {
    clearSelection();
    renderBoard();
  }
}

function onBoardPointerMove(e) {
  if (!drag) return;
  var dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
  if (!drag.moved) {
    drag.moved = true;
    var size = squareEl(drag.from).getBoundingClientRect().width;
    var g = document.createElement('span');
    g.className = 'piece drag-ghost ' + drag.pieceEl.className.replace('piece', '').trim();
    g.style.width = g.style.height = size + 'px';
    document.body.appendChild(g);
    drag.ghost = g; drag.size = size;
    drag.pieceEl.classList.add('dragging');
  }
  drag.ghost.style.transform = 'translate(' + (e.clientX - drag.size / 2) + 'px,' + (e.clientY - drag.size / 2) + 'px)';
  var over = squareAtPoint(e.clientX, e.clientY);
  document.querySelectorAll('#board .drag-over').forEach(function (s) { s.classList.remove('drag-over'); });
  if (over && legalTargets[over]) squareEl(over).classList.add('drag-over');
}

function onBoardPointerUp(e) {
  if (!drag) return;
  var d = drag; drag = null;
  if (d.ghost) d.ghost.remove();
  if (d.moved) {
    var target = squareAtPoint(e.clientX, e.clientY);
    if (target && target !== d.from && legalTargets[target] && tryMove(target, { dragged: true })) return;
    renderBoard(); /* snap back, keep the piece selected */
    return;
  }
  if (d.deselectOnUp) { clearSelection(); renderBoard(); }
}

function onBoardPointerCancel() {
  if (!drag) return;
  if (drag.ghost) drag.ghost.remove();
  drag = null;
  renderBoard();
}

/* ─── AI ───────────────────────────────────────────────── */
/* The search (js/chess-ai.js) runs in a Web Worker so the page never freezes
   while Tornike thinks; without worker support it runs here instead. */
var THINK_MS = { easy: 400, medium: 3000, hard: 4000 };
var aiWorker = null, aiWorkerFailed = false;

function getAiWorker() {
  if (aiWorker || aiWorkerFailed || typeof Worker === 'undefined') return aiWorker;
  try {
    aiWorker = new Worker('js/chess-ai-worker.js');
    aiWorker.onmessage = function (e) { applyAiMove(e.data.id, e.data.san); };
    aiWorker.onerror = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      aiWorkerFailed = true; aiWorker = null;
      if (aiPending) makeAiMove(aiToken); /* retry this move on the main thread */
    };
  } catch (err) { aiWorkerFailed = true; aiWorker = null; }
  return aiWorker;
}

function scheduleAi(delay) {
  var token = ++aiToken;
  aiPending = true;
  updateStatus();
  setTimeout(function () { makeAiMove(token); }, delay || 0);
}

function makeAiMove(token) {
  if (token !== aiToken) return;           /* cancelled by undo / new game / resign */
  if (isOver() || game.turn() === playerColor) { aiPending = false; updateStatus(); return; }
  var opts = { depth: DEPTH_MAP[difficulty] || 3, timeMs: THINK_MS[difficulty] || 3000 };
  var worker = getAiWorker();
  if (worker) {
    worker.postMessage({ id: token, fen: game.fen(), depth: opts.depth, timeMs: opts.timeMs });
    return;
  }
  /* Fallback: let the "thinking" status paint first, then search here */
  setTimeout(function () {
    if (token !== aiToken) return;
    applyAiMove(token, ChessAI.search(new Chess(game.fen()), opts));
  }, 30);
}

function applyAiMove(token, san) {
  if (token !== aiToken) return;           /* result for a cancelled request */
  aiPending = false;
  if (isOver() || game.turn() === playerColor || !san) { updateStatus(); return; }
  var wasLive = isLive();
  var mv = game.move(san);
  if (!mv) { updateStatus(); return; }
  moveList.push(mv);
  if (wasLive) {
    viewPly = null;
    animateNext = { from: mv.from, to: mv.to, rook: (mv.flags.indexOf('k') !== -1 || mv.flags.indexOf('q') !== -1) ? CASTLE_ROOK[mv.to] : null };
  }
  /* A selection made before the reply may no longer be legal */
  if (selectedSquare) { var keep = selectedSquare; selectSquare(keep); if (!Object.keys(legalTargets).length) clearSelection(); }
  afterMove();
  checkGameOver();
}

function cancelAi() {
  /* A worker still searching for a cancelled move would delay the next one */
  if (aiPending && aiWorker) { aiWorker.terminate(); aiWorker = null; }
  aiToken++; aiPending = false;
}

/* ─── Undo ─────────────────────────────────────────────── */
/* Takes back the player's last move together with the AI's reply.
   Never removes the AI's opening move when the player is Black. */
function undoMove() {
  if (!game || resigned || pendingPromotion) return;
  cancelAi();
  var removed = false;
  while (moveList.length && moveList[moveList.length - 1].color !== playerColor) {
    if (moveList.length === 1) break; /* AI's first move as White stays */
    game.undo(); moveList.pop();
  }
  if (moveList.length && moveList[moveList.length - 1].color === playerColor) {
    game.undo(); moveList.pop(); removed = true;
  }
  if (!removed) { updateStatus(); return; }
  viewPly = null;
  clearSelection();
  document.getElementById('game-over').classList.remove('visible');
  afterMove();
}

/* ─── Move review (history navigation) ─────────────────── */
function goToPly(ply) {
  if (!game) return;
  if (pendingPromotion) closePromotion();
  ply = Math.max(0, Math.min(moveList.length, ply));
  viewPly = ply === moveList.length ? null : ply;
  clearSelection();
  var shown = viewPly === null ? moveList.length : viewPly;
  /* Animate single steps forward; jumps and backward steps just redraw */
  animateNext = null;
  renderBoard();
  updateMoveHistory();
  updateStatus();
  return shown;
}
function currentPly() { return viewPly === null ? moveList.length : viewPly; }
function stepBack()    { goToPly(currentPly() - 1); }
function stepForward() {
  var next = currentPly() + 1;
  if (next > moveList.length) return;
  var mv = moveList[next - 1];
  goToPly(next);
  animateNext = { from: mv.from, to: mv.to, rook: (mv.flags.indexOf('k') !== -1 || mv.flags.indexOf('q') !== -1) ? CASTLE_ROOK[mv.to] : null };
  runSlide(animateNext); animateNext = null;
}
function goStart() { goToPly(0); }
function goLive()  { goToPly(moveList.length); }

function updateReviewUi() {
  var ply = currentPly(), n = moveList.length;
  var set = function (id, disabled) { var b = document.getElementById(id); if (b) b.disabled = disabled; };
  set('nav-start', ply === 0);
  set('nav-prev', ply === 0);
  set('nav-next', ply >= n);
  set('nav-end', ply >= n);
  var banner = document.getElementById('review-banner');
  if (banner) {
    if (isLive()) banner.hidden = true;
    else {
      banner.hidden = false;
      var label = document.getElementById('review-label');
      var moveNo = Math.ceil(ply / 2);
      if (label) label.textContent = ply === 0
        ? (T().review_start || 'Startposition')
        : (T().review_move || 'Zug') + ' ' + moveNo + (ply % 2 === 1 ? '.' : '…') + ' ' + moveList[ply - 1].san;
    }
  }
  var undo = document.getElementById('undo-btn');
  if (undo) undo.disabled = !moveList.some(function (m) { return m.color === playerColor; }) || resigned;
}

/* ─── UI helpers ───────────────────────────────────────── */
function setStatus(msg) {
  var el = document.getElementById('status');
  if (el) el.textContent = msg;
}

function updateStatus() {
  if (!game) return;
  var tr = T(), name = playerName || tr.anon || 'Du';
  var yours = game.turn() === playerColor;
  if (resigned)                           setStatus(name + (tr.resign_suf || ' hat aufgegeben.'));
  else if (game.in_checkmate())           setStatus(yours ? (tr.checkmate_ai || 'Schachmatt — Tornike gewinnt!') : (tr.checkmate_player_pre || 'Schachmatt — ') + name + (tr.checkmate_player_suf || ' gewinnt!'));
  else if (game.in_stalemate())           setStatus(tr.stalemate_status || 'Patt — Remis.');
  else if (game.in_threefold_repetition()) setStatus(tr.threefold_status || 'Dreifache Stellungswiederholung — Remis.');
  else if (game.insufficient_material())  setStatus(tr.insufficient_status || 'Ungenügendes Material — Remis.');
  else if (game.in_draw())                setStatus(tr.fifty_status || '50-Züge-Regel — Remis.');
  else if (game.in_check())               setStatus(yours ? (tr.check_prefix || 'Schach! ') + name + (tr.check_your_turn || ' ist am Zug.') : (tr.check_ai || 'Schach — Tornike denkt nach…'));
  else                                    setStatus(yours ? name + (tr.your_turn || ' ist am Zug') : (tr.ai_thinking || 'Tornike denkt nach…'));
}

function updateMoveHistory() {
  var el = document.getElementById('move-history-list');
  if (!el) return;
  var ply = currentPly(), html = '';
  for (var i = 0; i < moveList.length; i += 2) {
    html += '<li class="move-row"><span class="move-num">' + (i / 2 + 1) + '.</span>'
      + moveCell(i, ply) + (moveList[i + 1] ? moveCell(i + 1, ply) : '<span class="move-cell empty"></span>') + '</li>';
  }
  if (!moveList.length) html = '<li class="move-empty">' + (T().moves_empty || 'Noch keine Züge') + '</li>';
  el.innerHTML = html;
  var cur = el.querySelector('.move-cell.current');
  if (cur) {
    var top = cur.offsetTop - el.offsetTop, bottom = top + cur.offsetHeight;
    if (top < el.scrollTop || bottom > el.scrollTop + el.clientHeight) el.scrollTop = top - el.clientHeight / 2;
    var row = cur.parentNode; /* horizontal strip on phones */
    if (el.scrollWidth > el.clientWidth) el.scrollLeft = row.offsetLeft - el.clientWidth / 2;
  } else if (ply === moveList.length) {
    el.scrollTop = el.scrollHeight;
  }
}

function moveCell(i, ply) {
  var m = moveList[i];
  var cls = 'move-cell' + (i === ply - 1 ? ' current' : '');
  return '<button type="button" class="' + cls + '" data-ply="' + (i + 1) + '">' + m.san + '</button>';
}

function updateCaptured() {
  var rem = { w: {}, b: {} };
  game.board().forEach(function (r) { r.forEach(function (p) { if (p && p.type !== 'k') rem[p.color][p.type] = (rem[p.color][p.type] || 0) + 1; }); });
  var order = ['q','r','b','n','p'];
  function taken(color) { /* pieces of `color` that are off the board */
    var html = '', value = 0;
    order.forEach(function (t) {
      var missing = Math.max(0, START_COUNT[t] - (rem[color][t] || 0));
      for (var x = 0; x < missing; x++) html += '<span class="piece mini ' + color + t.toUpperCase() + '"></span>';
      value += missing * PIECE_VALUES[t];
    });
    return { html: html, value: value };
  }
  var aiColor = playerColor === 'w' ? 'b' : 'w';
  var byYou = taken(aiColor), byAi = taken(playerColor);
  var diff = (byYou.value - byAi.value) / 10;
  var you = document.getElementById('captured-by-you'), ai = document.getElementById('captured-by-ai');
  if (you) you.innerHTML = byYou.html + (diff > 0 ? '<span class="material">+' + diff + '</span>' : '');
  if (ai)  ai.innerHTML  = byAi.html  + (diff < 0 ? '<span class="material">+' + (-diff) + '</span>' : '');
}

/* ─── Game history (localStorage) ───────────────────────── */
function readHistory() {
  try { return JSON.parse(localStorage.getItem('chessHistory') || '[]'); } catch (e) { return []; }
}

function saveGameResult(result) {
  var history = readHistory();
  history.unshift({
    id: Date.now(),
    playerName: playerName || T().anon_name || 'Anonym',
    result: result,
    side: playerColor === 'w' ? 'gold' : 'blue', /* stored names kept for old entries */
    moves: moveList.length,
    date: new Date().toISOString()
  });
  if (history.length > 50) history = history.slice(0, 50);
  try { localStorage.setItem('chessHistory', JSON.stringify(history)); } catch (e) {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; });
}

function renderGameHistory() {
  var history = readHistory();
  var container = document.getElementById('game-history');
  if (!container) return;
  var tr = T();
  if (history.length === 0) {
    container.innerHTML = '<p class="no-games">' + (tr.no_games || 'Noch keine Spiele. Sei der Erste!') + '</p>';
    return;
  }
  var wins   = history.filter(function (g) { return g.result === 'win';  }).length;
  var losses = history.filter(function (g) { return g.result === 'loss'; }).length;
  var draws  = history.filter(function (g) { return g.result === 'draw'; }).length;
  var html = '<table class="history-table">';
  html += '<thead><tr><th>#</th><th>' + (tr.th_player || 'Spieler') + '</th><th>' + (tr.th_side || 'Seite') + '</th><th>' + (tr.th_result || 'Ergebnis') + '</th><th>' + (tr.th_moves || 'Züge') + '</th><th>' + (tr.th_date || 'Datum') + '</th></tr></thead><tbody>';
  history.forEach(function (g, i) {
    var d = new Date(g.date);
    var dateStr = d.toLocaleDateString(tr.date_locale || 'de-DE', { month: 'short', day: 'numeric' });
    var rc = g.result === 'win' ? 'result-win' : g.result === 'loss' ? 'result-loss' : 'result-draw';
    var rt = g.result === 'win' ? (tr.res_win || 'Gewonnen') : g.result === 'loss' ? (tr.res_loss || 'Verloren') : (tr.res_draw || 'Remis');
    html += '<tr>';
    html += '<td class="game-num">' + (i + 1) + '</td>';
    html += '<td class="player-name">' + escapeHtml(g.playerName) + '</td>';
    html += '<td class="side-badge"><span class="piece mini ' + (g.side === 'gold' ? 'wK' : 'bK') + '"></span></td>';
    html += '<td class="' + rc + '">' + rt + '</td>';
    html += '<td class="move-count">' + (g.moves || '-') + '</td>';
    html += '<td class="game-date">' + dateStr + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '<div class="history-stats">';
  html += '<span>' + (tr.stats_total_pre || 'Gesamt: ') + history.length + (tr.stats_total_suf || ' Spiele') + '</span>';
  html += '<span>' + (tr.stats_tornike_pre || 'Tornike: ') + losses + (tr.stats_wins_suf || ' Siege') + '</span>';
  html += '<span>' + (tr.stats_player_pre || 'Spieler: ') + wins + (tr.stats_wins_suf || ' Siege') + '</span>';
  html += '<span>' + (tr.stats_draws_pre || 'Remis: ') + draws + '</span>';
  html += '</div>';
  container.innerHTML = html;
}

/* ─── Game over ────────────────────────────────────────── */
function showGameOver(title, sub) {
  document.getElementById('game-over-title').textContent = title;
  document.getElementById('game-over-sub').textContent = sub;
  document.getElementById('game-over').classList.add('visible');
}

function checkGameOver() {
  if (!game.game_over()) return false;
  var tr = T(), title, sub;
  cancelAi();
  if (game.in_checkmate()) {
    var won = game.turn() !== playerColor;
    title = won ? (playerName || tr.anon || 'Du') + (tr.gameover_player_suf || ' hat gewonnen!') : (tr.gameover_tornike || 'Tornike gewinnt.');
    sub   = won ? (tr.gameover_impressive || 'Beeindruckend. Du hast die Engine überlistet.') : (tr.gameover_better || 'Beim nächsten Mal klappt es.');
    saveGameResult(won ? 'win' : 'loss');
    if (won) spawnParticles();
  } else {
    title = tr.gameover_draw || 'Remis.';
    sub = game.in_stalemate() ? (tr.gameover_stale || 'Patt.')
        : game.in_threefold_repetition() ? (tr.threefold_status || 'Dreifache Stellungswiederholung.')
        : game.insufficient_material() ? (tr.insufficient_status || 'Ungenügendes Material.')
        : (tr.fifty_status || '50-Züge-Regel.');
    saveGameResult('draw');
  }
  updateStatus(); updateReviewUi();
  setTimeout(function () { showGameOver(title, sub); }, 450); /* let the final move land first */
  return true;
}

function spawnParticles() {
  for (var i = 0; i < 60; i++) {
    (function () {
      var el = document.createElement('div'); el.className = 'particle';
      var dur = 1.4 + Math.random() * 1.2, delay = Math.random() * 0.6, dx = (Math.random() - 0.5) * 220;
      el.style.cssText = 'left:' + (Math.random() * 100) + 'vw;top:-10px;--dur:' + dur + 's;--delay:' + delay + 's;--dx:' + dx + 'px;'
        + 'width:' + (4 + Math.random() * 6) + 'px;height:' + (4 + Math.random() * 6) + 'px;';
      document.body.appendChild(el);
      setTimeout(function () { el.remove(); }, (dur + delay) * 1000 + 200);
    })();
  }
}

/* ─── Game lifecycle ───────────────────────────────────── */
function resetState(fen) {
  cancelAi();
  closePromotion();
  game = fen ? new Chess(fen) : new Chess();
  moveList = []; viewPly = null; resigned = false;
  clearSelection();
  document.getElementById('game-over').classList.remove('visible');
  var aiColor = playerColor === 'w' ? 'b' : 'w';
  document.querySelector('.side-you').className = 'piece mini side-you ' + playerColor + 'K';
  document.querySelector('.side-ai').className  = 'piece mini side-ai ' + aiColor + 'K';
  document.getElementById('player-label').textContent = playerName;
  afterMove();
}

function initGame() {
  resetState();
  if (game.turn() !== playerColor) scheduleAi(600);
}

function startGame() {
  var modal = document.getElementById('name-modal');
  modal.classList.add('visible');
  var input = document.getElementById('player-name-input');
  input.value = '';
  setTimeout(function () { input.focus(); }, 50);
}

function launchGame() {
  var input = document.getElementById('player-name-input');
  playerName = (input.value.trim()) || T().anon_name || 'Anonymous';
  document.getElementById('name-modal').classList.remove('visible');
  if (window.stopShaderAnimation) window.stopShaderAnimation();
  var landing = document.getElementById('landing');
  var screen  = document.getElementById('game-screen');
  landing.classList.add('hidden');
  setTimeout(function () {
    landing.style.display = 'none';
    screen.style.display = '';
    screen.classList.add('visible');
    initGame();
  }, 350);
}

function preloadPieces() {
  ['w','b'].forEach(function (c) { ['K','Q','R','B','N','P'].forEach(function (p) {
    var img = new Image(); img.src = 'assets/chess/pieces/' + c + p + '.svg';
  }); });
}

/* ─── DOM ready ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  preloadPieces();

  document.querySelectorAll('[data-diff]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-diff]').forEach(function (x) { x.classList.remove('selected'); });
      b.classList.add('selected'); difficulty = b.dataset.diff;
    });
  });

  document.querySelectorAll('[data-side]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-side]').forEach(function (x) { x.classList.remove('selected'); });
      b.classList.add('selected'); playerColor = b.dataset.side;
    });
  });

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('confirm-name-btn').addEventListener('click', launchGame);
  document.getElementById('player-name-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') launchGame();
  });

  var board = document.getElementById('board');
  board.addEventListener('pointerdown', onBoardPointerDown);
  board.addEventListener('pointermove', onBoardPointerMove);
  board.addEventListener('pointerup', onBoardPointerUp);
  board.addEventListener('pointercancel', onBoardPointerCancel);
  board.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.getElementById('undo-btn').addEventListener('click', undoMove);

  document.getElementById('nav-start').addEventListener('click', goStart);
  document.getElementById('nav-prev').addEventListener('click', stepBack);
  document.getElementById('nav-next').addEventListener('click', stepForward);
  document.getElementById('nav-end').addEventListener('click', goLive);
  document.getElementById('review-live').addEventListener('click', goLive);
  document.getElementById('move-history-list').addEventListener('click', function (e) {
    var b = e.target.closest('.move-cell[data-ply]');
    if (b) goToPly(parseInt(b.dataset.ply, 10));
  });

  document.addEventListener('keydown', function (e) {
    if (!game || !document.getElementById('game-screen').classList.contains('visible')) return;
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'Escape' && pendingPromotion) { closePromotion(); clearSelection(); renderBoard(); return; }
    if (document.getElementById('game-over').classList.contains('visible')) return;
    var handled = true;
    if (e.key === 'ArrowLeft') stepBack();
    else if (e.key === 'ArrowRight') stepForward();
    else if (e.key === 'ArrowUp' || e.key === 'Home') goStart();
    else if (e.key === 'ArrowDown' || e.key === 'End') goLive();
    else handled = false;
    if (handled) e.preventDefault();
  });

  document.getElementById('new-game-btn').addEventListener('click', function () {
    cancelAi(); closePromotion();
    var screen  = document.getElementById('game-screen');
    var landing = document.getElementById('landing');
    screen.classList.remove('visible');
    document.getElementById('game-over').classList.remove('visible');
    setTimeout(function () {
      screen.style.display = 'none';
      landing.style.display = '';
      landing.classList.remove('hidden');
      renderGameHistory();
      if (window.startShaderAnimation) window.startShaderAnimation();
    }, 350);
  });

  document.getElementById('resign-btn').addEventListener('click', function () {
    if (!game || isOver()) return;
    cancelAi(); closePromotion();
    resigned = true;
    clearSelection();
    var tr = T(), name = playerName || tr.anon || 'You';
    saveGameResult('loss');
    renderBoard(); updateStatus();
    showGameOver(name + (tr.resign_suf || ' hat aufgegeben.'), tr.resign_tornike || 'Tornike gewinnt. Noch eine Runde?');
  });

  document.getElementById('rematch-btn').addEventListener('click', function () { initGame(); });
  document.getElementById('review-btn').addEventListener('click', function () {
    document.getElementById('game-over').classList.remove('visible');
  });

  renderGameHistory();
});
