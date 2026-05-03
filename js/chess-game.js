/* chess-game.js — custom board renderer, no chessboard.js */

/* ─── State ────────────────────────────────────────────── */
var game           = null;
var playerColor    = 'w';
var playerName     = 'Anonymous';
var difficulty     = 'medium';
var selectedSquare = null;
var legalMoves     = [];
var lastMove       = { from: null, to: null };

var DEPTH_MAP = { easy: 1, medium: 3, hard: 5 };

var PIECE_UNICODE = {
  wK: '\u2654', wQ: '\u2655', wR: '\u2656', wB: '\u2657', wN: '\u2658', wP: '\u2659',
  bK: '\u265A', bQ: '\u265B', bR: '\u265C', bB: '\u265D', bN: '\u265E', bP: '\u265F'
};

var FILES = ['a','b','c','d','e','f','g','h'];

var PIECE_VALUES = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };
var STARTING     = { p: 8,  n: 2,  b: 2,  r: 2,  q: 1,  k: 1  };

/* ─── Board rendering ──────────────────────────────────── */
function renderBoard() {
  var el = document.getElementById('board');
  if (!el) return;
  el.innerHTML = '';
  var state  = game.board();
  var inChk  = game.in_check();
  var turn   = game.turn();

  /* When player chose black, flip the board so they see their pieces at bottom */
  var rows = [0,1,2,3,4,5,6,7];
  var cols = [0,1,2,3,4,5,6,7];
  if (playerColor === 'b') { rows = rows.slice().reverse(); cols = cols.slice().reverse(); }

  for (var ri = 0; ri < 8; ri++) {
    for (var ci = 0; ci < 8; ci++) {
      var row = rows[ri];
      var col = cols[ci];

      var sq   = document.createElement('div');
      var name = FILES[col] + (8 - row);  /* e.g. 'e4' */
      var isLight = (row + col) % 2 === 0;

      sq.className = 'square ' + (isLight ? 'light' : 'dark');
      sq.dataset.square = name;

      if (lastMove.from === name || lastMove.to === name) sq.classList.add('last-move');
      if (selectedSquare === name) sq.classList.add('selected');
      if (legalMoves.indexOf(name) !== -1) {
        sq.classList.add(state[row][col] ? 'legal-capture' : 'legal-move');
      }
      if (inChk) {
        var p = state[row][col];
        if (p && p.type === 'k' && p.color === turn) sq.classList.add('in-check');
      }

      /* Place piece */
      var piece = state[row][col];
      if (piece) {
        var span = document.createElement('span');
        span.className = 'piece ' + (piece.color === 'w' ? 'white-piece' : 'black-piece');
        span.textContent = PIECE_UNICODE[(piece.color === 'w' ? 'w' : 'b') + piece.type.toUpperCase()];
        sq.appendChild(span);
      }

      /* Coordinate labels */
      var isBottomRow = (playerColor === 'w') ? ri === 7 : ri === 0;
      var isLeftCol   = (playerColor === 'w') ? ci === 0 : ci === 7;
      if (isBottomRow) {
        var f = document.createElement('span'); f.className = 'coord-file';
        f.textContent = FILES[col]; sq.appendChild(f);
      }
      if (isLeftCol) {
        var r = document.createElement('span'); r.className = 'coord-rank';
        r.textContent = 8 - row; sq.appendChild(r);
      }

      sq.addEventListener('click', onSquareClick);
      el.appendChild(sq);
    }
  }
}

/* ─── Click handler ────────────────────────────────────── */
function onSquareClick(e) {
  var name = e.currentTarget.dataset.square;

  /* Ignore during AI turn or game over */
  if (game.game_over()) return;
  if (game.turn() !== playerColor) return;

  if (selectedSquare) {
    /* Try to make the move */
    if (legalMoves.indexOf(name) !== -1) {
      var mv = game.move({ from: selectedSquare, to: name, promotion: 'q' });
      if (mv) {
        lastMove     = { from: selectedSquare, to: name };
        selectedSquare = null;
        legalMoves   = [];
        renderBoard();
        updateStatus();
        updateMoveHistory();
        updateCaptured();
        if (!checkGameOver()) setTimeout(makeAiMove, 300);
        return;
      }
    }
    /* Same square → deselect */
    if (name === selectedSquare) {
      selectedSquare = null; legalMoves = [];
      renderBoard(); return;
    }
    /* Click another own piece → reselect */
  }

  /* Select piece */
  var state = game.board();
  var col   = FILES.indexOf(name[0]);
  var row   = 8 - parseInt(name[1]);
  var piece = state[row][col];

  if (piece && piece.color === playerColor) {
    selectedSquare = name;
    legalMoves = game.moves({ square: name, verbose: true }).map(function(m){ return m.to; });
    renderBoard();
  } else {
    selectedSquare = null; legalMoves = [];
    renderBoard();
  }
}

/* ─── AI ───────────────────────────────────────────────── */
function evaluateBoard() {
  if (game.in_checkmate()) return game.turn() === 'b' ? 9999 : -9999;
  if (game.in_draw() || game.in_stalemate()) return 0;
  var total = 0;
  game.board().forEach(function(r) {
    r.forEach(function(p) {
      if (!p) return;
      var v = PIECE_VALUES[p.type] || 0;
      total += p.color === 'w' ? v : -v;
    });
  });
  return total;
}

function minimax(depth, alpha, beta, isMax) {
  if (depth === 0 || game.game_over()) return evaluateBoard();
  var moves = game.moves();
  if (isMax) {
    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      game.move(moves[i]);
      var s = minimax(depth-1, alpha, beta, false);
      game.undo();
      if (s > best) best = s;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    var best = Infinity;
    for (var i = 0; i < moves.length; i++) {
      game.move(moves[i]);
      var s = minimax(depth-1, alpha, beta, true);
      game.undo();
      if (s < best) best = s;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

function makeAiMove() {
  if (game.game_over()) return;
  setStatus('Tornike is thinking...');

  var depth     = DEPTH_MAP[difficulty] || 3;
  var aiIsWhite = playerColor !== 'w';  /* AI is opposite of player */
  var delay     = difficulty === 'easy' ? 300 : difficulty === 'hard' ? 800 : 500;

  setTimeout(function() {
    var moves = game.moves().slice().sort(function(){ return Math.random()-0.5; });
    if (!moves.length) { updateStatus(); return; }

    var best = null, bestScore = aiIsWhite ? -Infinity : Infinity;
    for (var i = 0; i < moves.length; i++) {
      game.move(moves[i]);
      var score = minimax(depth-1, -Infinity, Infinity, !aiIsWhite);
      game.undo();
      if (aiIsWhite ? score > bestScore : score < bestScore) {
        bestScore = score; best = moves[i];
      }
    }
    if (best) {
      var mv = game.move(best);
      lastMove = { from: mv.from, to: mv.to };
      renderBoard(); updateStatus(); updateMoveHistory(); updateCaptured();
      checkGameOver();
    }
  }, delay);
}

/* ─── UI helpers ───────────────────────────────────────── */
function setStatus(msg) {
  var el = document.getElementById('status');
  if (el) el.textContent = msg;
}

function updateStatus() {
  var t = game.turn(), yours = t === playerColor;
  var name = playerName || 'Du';
  if      (game.in_checkmate()) setStatus(yours ? 'Schachmatt — Tornike gewinnt!' : 'Schachmatt — ' + name + ' gewinnt!');
  else if (game.in_draw())      setStatus('Remis!');
  else if (game.in_stalemate()) setStatus('Patt — Remis.');
  else if (game.in_check())     setStatus(yours ? 'Schach! ' + name + ' ist am Zug.' : 'Schach — Tornike denkt nach...');
  else                          setStatus(yours ? name + ' ist am Zug'             : 'Tornike denkt nach...');
}

function updateMoveHistory() {
  var hist = game.history(), html = '';
  for (var i = 0; i < hist.length; i += 2) {
    var n = Math.floor(i/2)+1;
    html += '<div class="move-row"><span class="move-num">'+n+'.</span>'
          + '<span class="move-white">'+hist[i]+'</span>'
          + (hist[i+1] ? '<span class="move-black">'+hist[i+1]+'</span>' : '')
          + '</div>';
  }
  var el = document.getElementById('move-history-list');
  if (el) { el.innerHTML = html; el.scrollTop = el.scrollHeight; }
}

function updateCaptured() {
  var rem = { w:{}, b:{} };
  var starting = { p:8, n:2, b:2, r:2, q:1 };
  game.board().forEach(function(r){ r.forEach(function(p){ if(p && p.type !== 'k') rem[p.color][p.type]=(rem[p.color][p.type]||0)+1; }); });

  var order = ['q','r','b','n','p'];

  // pieces YOU captured (AI's missing) — blue, left column
  var youHtml = '';
  order.forEach(function(t){
    var missing = starting[t] - (rem.b[t] || 0);
    for (var x = 0; x < missing; x++) youHtml += '<div class="blue">' + PIECE_UNICODE['b'+t.toUpperCase()] + '</div>';
  });

  // pieces AI captured (yours missing) — gold, right column
  var aiHtml = '';
  order.forEach(function(t){
    var missing = starting[t] - (rem.w[t] || 0);
    for (var x = 0; x < missing; x++) aiHtml += '<div class="gold">' + PIECE_UNICODE['w'+t.toUpperCase()] + '</div>';
  });

  var cby = document.getElementById('captured-by-you');
  var cba = document.getElementById('captured-by-ai');
  if (cby) cby.innerHTML = youHtml;
  if (cba) cba.innerHTML = aiHtml;
}

/* ─── Game history (localStorage) ───────────────────────── */
function saveGameResult(result) {
  var history = JSON.parse(localStorage.getItem('chessHistory') || '[]');
  history.unshift({
    id: Date.now(),
    playerName: playerName || 'Anonym',
    result: result,
    side: playerColor === 'w' ? 'gold' : 'blue',
    moves: game ? game.history().length : 0,
    date: new Date().toISOString()
  });
  if (history.length > 50) history = history.slice(0, 50);
  localStorage.setItem('chessHistory', JSON.stringify(history));
}

function renderGameHistory() {
  var history = JSON.parse(localStorage.getItem('chessHistory') || '[]');
  var container = document.getElementById('game-history');
  if (!container) return;
  if (history.length === 0) {
    container.innerHTML = '<p class="no-games">Noch keine Spiele. Sei der Erste!</p>';
    return;
  }
  var wins   = history.filter(function(g){ return g.result === 'win';  }).length;
  var losses = history.filter(function(g){ return g.result === 'loss'; }).length;
  var draws  = history.filter(function(g){ return g.result === 'draw'; }).length;
  var html = '<table class="history-table">';
  html += '<thead><tr><th>#</th><th>Spieler</th><th>Seite</th><th>Ergebnis</th><th>Züge</th><th>Datum</th></tr></thead><tbody>';
  history.forEach(function(g, i) {
    var d = new Date(g.date);
    var dateStr = d.toLocaleDateString('de-DE', { month: 'short', day: 'numeric' });
    var rc = g.result === 'win' ? 'result-win' : g.result === 'loss' ? 'result-loss' : 'result-draw';
    var rt = g.result === 'win' ? 'Gewonnen' : g.result === 'loss' ? 'Verloren' : 'Remis';
    html += '<tr>';
    html += '<td class="game-num">' + (i+1) + '</td>';
    html += '<td class="player-name">' + g.playerName + '</td>';
    html += '<td class="side-badge">' + (g.side === 'gold' ? '♙' : '♟') + '</td>';
    html += '<td class="' + rc + '">' + rt + '</td>';
    html += '<td class="move-count">' + (g.moves || '-') + '</td>';
    html += '<td class="game-date">' + dateStr + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '<div class="history-stats">';
  html += '<span>Gesamt: ' + history.length + ' Spiele</span>';
  html += '<span>Tornike: ' + losses + ' Siege</span>';
  html += '<span>Spieler: ' + wins + ' Siege</span>';
  html += '<span>Remis: ' + draws + '</span>';
  html += '</div>';
  container.innerHTML = html;
}

/* ─── Game over ────────────────────────────────────────── */
function checkGameOver() {
  if (!game.game_over()) return false;
  var title, sub;
  if (game.in_checkmate()) {
    var won = game.turn() !== playerColor;
    title = won ? (playerName || 'Du') + ' hat gewonnen!' : 'Tornike gewinnt.';
    sub   = won ? 'Beeindruckend. Du hast die Engine überlistet.' : 'Beim nächsten Mal klappt es.';
    saveGameResult(won ? 'win' : 'loss');
    if (won) spawnParticles();
  } else {
    title = 'Remis.'; sub = game.in_stalemate() ? 'Patt.' : 'Das Spiel endete remis.';
    saveGameResult('draw');
  }
  document.getElementById('game-over-title').textContent = title;
  document.getElementById('game-over-sub').textContent   = sub;
  document.getElementById('game-over').classList.add('visible');
  return true;
}

function spawnParticles() {
  for (var i=0;i<60;i++) {
    (function(){
      var el=document.createElement('div'); el.className='particle';
      var dur=1.4+Math.random()*1.2, delay=Math.random()*0.6, dx=(Math.random()-0.5)*220;
      el.style.cssText='left:'+(Math.random()*100)+'vw;top:-10px;--dur:'+dur+'s;--delay:'+delay+'s;--dx:'+dx+'px;'
        +'width:'+(4+Math.random()*6)+'px;height:'+(4+Math.random()*6)+'px;';
      document.body.appendChild(el);
      setTimeout(function(){ el.remove(); },(dur+delay)*1000+200);
    })();
  }
}

/* ─── Transition helpers ───────────────────────────────── */
function initGame() {
  game = new Chess();
  selectedSquare = null; legalMoves = []; lastMove = { from:null, to:null };
  document.getElementById('game-over').classList.remove('visible');
  renderBoard(); updateStatus(); updateCaptured();
  if (playerColor === 'b') setTimeout(makeAiMove, 600);
}

function startGame() {
  /* Show name modal instead of going directly to game */
  var modal = document.getElementById('name-modal');
  modal.classList.add('visible');
  var input = document.getElementById('player-name-input');
  input.value = '';
  setTimeout(function(){ input.focus(); }, 50);
}

function launchGame() {
  var input = document.getElementById('player-name-input');
  playerName = (input.value.trim()) || 'Anonymous';
  document.getElementById('name-modal').classList.remove('visible');

  if (window.stopShaderAnimation) window.stopShaderAnimation();

  var landing = document.getElementById('landing');
  var screen  = document.getElementById('game-screen');
  landing.classList.add('hidden');
  setTimeout(function(){
    landing.style.display = 'none';
    /* Add .visible — CSS animation on .game-container fires immediately */
    screen.classList.add('visible');
    initGame();
  }, 350);
}

/* ─── DOM ready ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {

  /* Difficulty */
  document.querySelectorAll('[data-diff]').forEach(function(b){
    b.addEventListener('click', function(){
      document.querySelectorAll('[data-diff]').forEach(function(x){ x.classList.remove('selected'); });
      b.classList.add('selected'); difficulty = b.dataset.diff;
    });
  });

  /* Side */
  document.querySelectorAll('[data-side]').forEach(function(b){
    b.addEventListener('click', function(){
      document.querySelectorAll('[data-side]').forEach(function(x){ x.classList.remove('selected'); });
      b.classList.add('selected'); playerColor = b.dataset.side;
    });
  });

  document.getElementById('start-btn').addEventListener('click', startGame);

  /* Name modal confirm */
  document.getElementById('confirm-name-btn').addEventListener('click', launchGame);
  document.getElementById('player-name-input').addEventListener('keydown', function(e){
    if (e.key === 'Enter') launchGame();
  });

  document.getElementById('undo-btn').addEventListener('click', function(){
    if (!game) return;
    game.undo(); game.undo();
    selectedSquare=null; legalMoves=[];
    renderBoard(); updateStatus(); updateMoveHistory(); updateCaptured();
  });

  document.getElementById('new-game-btn').addEventListener('click', function(){
    /* Return to landing and refresh history */
    var screen  = document.getElementById('game-screen');
    var landing = document.getElementById('landing');
    screen.classList.remove('visible');
    setTimeout(function(){
      screen.style.display = 'none';
      landing.style.display = '';
      landing.classList.remove('hidden');
      renderGameHistory();
      if (window.startShaderAnimation) window.startShaderAnimation();
    }, 350);
  });

  document.getElementById('resign-btn').addEventListener('click', function(){
    var name = playerName || 'You';
    document.getElementById('game-over-title').textContent = name + ' hat aufgegeben.';
    document.getElementById('game-over-sub').textContent   = 'Tornike gewinnt. Noch eine Runde?';
    document.getElementById('game-over').classList.add('visible');
    saveGameResult('loss');
  });

  document.getElementById('rematch-btn').addEventListener('click', function(){ initGame(); });

  /* Render history on load */
  renderGameHistory();

});
