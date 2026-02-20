const COLS = 10;
const ROWS = 20;
const CELL = 32;

const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const COLORS = {
  I: '#52f7ff',
  O: '#ffec59',
  T: '#ca89ff',
  S: '#56ff99',
  Z: '#ff5d82',
  J: '#6fa8ff',
  L: '#ffae57',
};

const boardCanvas = document.getElementById('board');
const nextCanvas = document.getElementById('next');
const holdCanvas = document.getElementById('hold');

const boardCtx = boardCanvas.getContext('2d');
const nextCtx = nextCanvas.getContext('2d');
const holdCtx = holdCanvas.getContext('2d');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const restartBtn = document.getElementById('restart');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');

const state = {
  board: [],
  score: 0,
  lines: 0,
  level: 1,
  bag: [],
  next: [],
  hold: null,
  canHold: true,
  current: null,
  dropMs: 900,
  dropAcc: 0,
  paused: false,
  gameOver: false,
  last: 0,
};

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function rotate(matrix, dir = 1) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const res = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (dir > 0) {
        res[x][rows - 1 - y] = matrix[y][x];
      } else {
        res[cols - 1 - x][y] = matrix[y][x];
      }
    }
  }
  return res;
}

function randomBag() {
  const keys = Object.keys(SHAPES);
  for (let i = keys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

function makePiece(type) {
  const shape = SHAPES[type].map((row) => [...row]);
  const x = Math.floor((COLS - shape[0].length) / 2);
  return { type, shape, x, y: -1 };
}

function queueRefill() {
  while (state.next.length < 5) {
    if (!state.bag.length) state.bag = randomBag();
    state.next.push(state.bag.pop());
  }
}

function spawnPiece(fromHold = false) {
  if (!fromHold) queueRefill();
  const type = fromHold ? fromHold : state.next.shift();
  queueRefill();
  state.current = makePiece(type);
  state.canHold = true;
  if (collides(state.current.shape, state.current.x, state.current.y)) {
    state.gameOver = true;
    state.paused = true;
    showOverlay('Game Over', 'Druk op Nieuwe ronde om opnieuw te spelen.');
  }
}

function collides(shape, ox, oy) {
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const px = ox + x;
      const py = oy + y;
      if (px < 0 || px >= COLS || py >= ROWS) return true;
      if (py >= 0 && state.board[py][px]) return true;
    }
  }
  return false;
}

function lockPiece() {
  const { shape, x: ox, y: oy, type } = state.current;
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const px = ox + x;
      const py = oy + y;
      if (py >= 0) state.board[py][px] = type;
    }
  }

  clearLines();
  spawnPiece();
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (state.board[y].every(Boolean)) {
      state.board.splice(y, 1);
      state.board.unshift(Array(COLS).fill(null));
      cleared += 1;
      y += 1;
    }
  }

  if (!cleared) return;

  const lineScore = [0, 100, 320, 560, 900][cleared] || 0;
  state.score += lineScore * state.level;
  state.lines += cleared;
  state.level = Math.floor(state.lines / 10) + 1;
  state.dropMs = Math.max(120, 900 - (state.level - 1) * 80);
  syncStats();
}

function move(dx) {
  const nextX = state.current.x + dx;
  if (!collides(state.current.shape, nextX, state.current.y)) {
    state.current.x = nextX;
  }
}

function softDrop() {
  const nextY = state.current.y + 1;
  if (!collides(state.current.shape, state.current.x, nextY)) {
    state.current.y = nextY;
    state.score += 1;
    syncStats();
  } else {
    lockPiece();
  }
}

function hardDrop() {
  let dist = 0;
  while (!collides(state.current.shape, state.current.x, state.current.y + 1)) {
    state.current.y += 1;
    dist += 1;
  }
  state.score += dist * 2;
  syncStats();
  lockPiece();
}

function tryRotate(dir) {
  const rotated = rotate(state.current.shape, dir);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    const nx = state.current.x + kick;
    if (!collides(rotated, nx, state.current.y)) {
      state.current.shape = rotated;
      state.current.x = nx;
      return;
    }
  }
}

function holdPiece() {
  if (!state.canHold) return;
  const currentType = state.current.type;
  if (!state.hold) {
    state.hold = currentType;
    spawnPiece();
  } else {
    const swap = state.hold;
    state.hold = currentType;
    spawnPiece(swap);
  }
  state.canHold = false;
}

function ghostY() {
  let y = state.current.y;
  while (!collides(state.current.shape, state.current.x, y + 1)) y += 1;
  return y;
}

function drawCell(ctx, x, y, color, size = CELL, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x + 4, y + 4, size - 10, 5);
  ctx.restore();
}

function drawBoardGrid() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      boardCtx.strokeStyle = 'rgba(255,255,255,0.05)';
      boardCtx.strokeRect(x * CELL, y * CELL, CELL, CELL);
      const t = state.board[y][x];
      if (t) drawCell(boardCtx, x * CELL, y * CELL, COLORS[t]);
    }
  }
}

function drawPiece(piece, oy = piece.y, alpha = 1, outline = false) {
  const { shape, x: ox, type } = piece;
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const px = (ox + x) * CELL;
      const py = (oy + y) * CELL;
      if (py < 0) continue;
      if (outline) {
        boardCtx.strokeStyle = COLORS[type];
        boardCtx.globalAlpha = 0.5;
        boardCtx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
        boardCtx.globalAlpha = 1;
      } else {
        drawCell(boardCtx, px, py, COLORS[type], CELL, alpha);
      }
    }
  }
}

function drawPreview(ctx, items, slots) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const unit = 24;
  items.slice(0, slots).forEach((type, i) => {
    const shape = SHAPES[type];
    const w = shape[0].length;
    const h = shape.length;
    const offsetX = (ctx.canvas.width - w * unit) / 2;
    const offsetY = i * 72 + (72 - h * unit) / 2;
    shape.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (!cell) return;
        drawCell(ctx, offsetX + x * unit, offsetY + y * unit, COLORS[type], unit);
      });
    });
  });
}

function draw() {
  drawBoardGrid();
  if (!state.current) return;
  drawPiece(state.current, ghostY(), 1, true);
  drawPiece(state.current);
  drawPreview(nextCtx, state.next, 5);
  drawPreview(holdCtx, state.hold ? [state.hold] : [], 1);
}

function syncStats() {
  scoreEl.textContent = state.score;
  levelEl.textContent = state.level;
  linesEl.textContent = state.lines;
}

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function togglePause() {
  if (state.gameOver) return;
  state.paused = !state.paused;
  if (state.paused) showOverlay('Pauze', 'Druk op P om verder te gaan.');
  else hideOverlay();
}

function resetGame() {
  state.board = createBoard();
  state.score = 0;
  state.lines = 0;
  state.level = 1;
  state.bag = [];
  state.next = [];
  state.hold = null;
  state.canHold = true;
  state.dropMs = 900;
  state.dropAcc = 0;
  state.paused = false;
  state.gameOver = false;
  state.last = 0;
  hideOverlay();
  queueRefill();
  spawnPiece();
  syncStats();
  draw();
}

function tick(ts) {
  if (!state.last) state.last = ts;
  const delta = ts - state.last;
  state.last = ts;

  if (!state.paused && !state.gameOver) {
    state.dropAcc += delta;
    if (state.dropAcc >= state.dropMs) {
      state.dropAcc = 0;
      softDrop();
    }
  }

  draw();
  requestAnimationFrame(tick);
}

document.addEventListener('keydown', (event) => {
  if (event.repeat) return;

  if (event.key.toLowerCase() === 'p') {
    togglePause();
    return;
  }

  if (state.paused || state.gameOver) return;

  switch (event.key) {
    case 'ArrowLeft':
      move(-1);
      break;
    case 'ArrowRight':
      move(1);
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
      tryRotate(1);
      break;
    case 'z':
    case 'Z':
      tryRotate(-1);
      break;
    case ' ':
      hardDrop();
      break;
    case 'c':
    case 'C':
      holdPiece();
      break;
    default:
      return;
  }

  draw();
});

restartBtn.addEventListener('click', resetGame);

resetGame();
requestAnimationFrame(tick);
