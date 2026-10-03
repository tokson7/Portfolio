/* Runs ChessAI.search off the main thread so the page stays responsive. */
importScripts('https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js', 'chess-ai.js');

self.onmessage = function (e) {
  var d = e.data;
  var game = new Chess(d.fen);
  self.postMessage({ id: d.id, san: ChessAI.search(game, { depth: d.depth, timeMs: d.timeMs }) });
};
