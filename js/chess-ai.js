/* chess-ai.js — Tornike's move search. Shared by the Web Worker
 * (chess-ai-worker.js) and the page, which falls back to it when workers
 * are unavailable. Needs chess.js (global `Chess`).
 *
 * Alpha-beta minimax on material, searched with iterative deepening under a
 * time budget: each finished depth replaces the answer, so a slow position
 * returns the deepest complete result instead of freezing for seconds.
 */
var ChessAI = (function () {
  var VALUES = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };
  var MATE = 99999;

  function material(game) {
    var total = 0;
    game.board().forEach(function (r) {
      r.forEach(function (p) { if (p) total += p.color === 'w' ? VALUES[p.type] : -VALUES[p.type]; });
    });
    return total;
  }

  /* Captures and checks first: same result, far fewer nodes for alpha-beta */
  function ordered(moves) {
    return moves.sort(function (a, b) {
      var sa = (a.indexOf('x') !== -1 ? 2 : 0) + (a.indexOf('+') !== -1 ? 1 : 0);
      var sb = (b.indexOf('x') !== -1 ? 2 : 0) + (b.indexOf('+') !== -1 ? 1 : 0);
      return sb - sa;
    });
  }

  function Timeout() {}

  /* Mate and stalemate are read from the move list; game_over() would replay
     the whole game at every node to test threefold repetition. */
  function minimax(game, depth, alpha, beta, isMax, deadline, counter) {
    if ((++counter.n & 15) === 0 && Date.now() > deadline) throw new Timeout(); /* chess.js manages <1 node/ms in middlegames */
    if (depth === 0) return material(game);
    var moves = ordered(game.moves()), best, s, i;
    if (!moves.length) {
      if (!game.in_check()) return 0;
      return game.turn() === 'w' ? -(MATE + depth) : MATE + depth; /* sooner mate scores higher */
    }
    if (isMax) {
      best = -Infinity;
      for (i = 0; i < moves.length; i++) {
        game.move(moves[i]); s = minimax(game, depth - 1, alpha, beta, false, deadline, counter); game.undo();
        if (s > best) best = s;
        if (best > alpha) alpha = best;
        if (beta <= alpha) break;
      }
    } else {
      best = Infinity;
      for (i = 0; i < moves.length; i++) {
        game.move(moves[i]); s = minimax(game, depth - 1, alpha, beta, true, deadline, counter); game.undo();
        if (s < best) best = s;
        if (best < beta) beta = best;
        if (beta <= alpha) break;
      }
    }
    return best;
  }

  /* Returns the SAN of the chosen move, or null when there is none. */
  function search(game, opts) {
    var maxDepth = opts.depth || 3;
    var deadline = Date.now() + (opts.timeMs || 1500);
    var white = game.turn() === 'w';
    var root = game.moves().sort(function () { return Math.random() - 0.5; }); /* variety between games */
    if (!root.length) return null;
    var best = root[0], counter = { n: 0 };

    for (var depth = 1; depth <= maxDepth; depth++) {
      var depthBest = null, depthScore = white ? -Infinity : Infinity, timedOut = false;
      try {
        for (var i = 0; i < root.length; i++) {
          game.move(root[i]);
          var s;
          /* Window from the best score so far: a move that can't beat it is cut off early */
          try { s = white ? minimax(game, depth - 1, depthScore, Infinity, false, deadline, counter)
                          : minimax(game, depth - 1, -Infinity, depthScore, true, deadline, counter); }
          finally { game.undo(); }
          if (white ? s > depthScore : s < depthScore) { depthScore = s; depthBest = root[i]; }
        }
      } catch (e) {
        if (!(e instanceof Timeout)) throw e;
        timedOut = true;
      }
      /* The previous best is always searched first, so a partly finished depth
         still yields a move at least as well founded as the last full one. */
      if (depthBest) best = depthBest;
      if (timedOut) break;
      root.splice(root.indexOf(best), 1); root.unshift(best); /* search it first next time */
      if (Math.abs(depthScore) >= MATE) break; /* forced mate found */
    }
    return best;
  }

  return { search: search };
})();
