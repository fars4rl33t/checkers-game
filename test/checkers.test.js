'use strict';

/**
 * Регрессионные тесты игровой логики "Русских шашек".
 *
 * Запуск игры устроен как классический браузерный скрипт (замыкание без
 * экспортов, работа напрямую с DOM), поэтому тесты используют jsdom и
 * взаимодействуют с игрой ТАК ЖЕ, как это делал бы реальный пользователь —
 * кликами по клеткам доски, — вместо обращения к внутреннему состоянию.
 * Это гарантирует, что тесты проверяют именно то поведение, которое
 * действительно увидит игрок в браузере.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
const JS = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf-8');

/**
 * Создаёт свежий экземпляр игры в jsdom: выполняет инлайн-скрипт темы
 * из <head> (как это сделал бы реальный браузер до загрузки script.js),
 * затем сам script.js. Возвращает window и массив перехваченных
 * console.error (в норме должен оставаться пустым на протяжении всего теста).
 */
function loadGame() {
  const dom = new JSDOM(HTML, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://example.com/'
  });
  const { window } = dom;
  const errors = [];
  window.console.error = (...args) => errors.push(args.join(' '));
  window.confirm = () => true;

  Array.from(window.document.querySelectorAll('head script')).forEach((s) => {
    if (!s.src) dom.window.eval(s.textContent);
  });
  dom.window.eval(JS);

  return { dom, window, errors };
}

function clickCell(window, row, col) {
  const cell = window.document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
  if (cell) cell.dispatchEvent(new window.Event('click', { bubbles: true }));
}

function setMode(window, mode) {
  const input = window.document.getElementById(mode === 'pvp' ? 'modePvp' : 'modePvc');
  input.checked = true;
  input.dispatchEvent(new window.Event('change'));
}

function statusText(window) {
  return window.document.getElementById('statusText').textContent;
}

function isGameOver(window) {
  return /победили|Ничья/.test(statusText(window));
}

/** Кликает случайную свою фигуру и случайную доступную для неё цель. */
function playRandomHalfMove(window) {
  const status = statusText(window);
  const isWhiteTurn = status.includes('белых');
  const pieceSel = isWhiteTurn ? '.piece.white' : '.piece.black';
  const cells = Array.from(window.document.querySelectorAll('.cell.dark'));
  const movable = cells.filter((c) => c.querySelector(pieceSel) && !c.querySelector('.piece.hit'));
  if (movable.length === 0) return false;

  const piece = movable[Math.floor(Math.random() * movable.length)];
  clickCell(window, Number(piece.dataset.row), Number(piece.dataset.col));

  const targets = Array.from(window.document.querySelectorAll('.cell.legal-move, .cell.legal-capture'));
  if (targets.length === 0) return true; // фигура без ходов — просто сброс выбора, это не ошибка
  const target = targets[Math.floor(Math.random() * targets.length)];
  clickCell(window, Number(target.dataset.row), Number(target.dataset.col));
  return true;
}

/** Ждёт (реальными таймерами), пока predicate() не станет истинным, или до истечения таймаута. */
function waitFor(predicate, { timeoutMs = 4000, intervalMs = 15 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) { resolve(); return; }
      if (Date.now() - start > timeoutMs) { reject(new Error('waitFor: таймаут')); return; }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

// =====================================================================
// 1. Начальная расстановка
// =====================================================================

test('начальная расстановка: 12 белых и 12 чёрных строго на тёмных клетках', () => {
  const { window, errors } = loadGame();

  const whitePieces = window.document.querySelectorAll('.piece.white');
  const blackPieces = window.document.querySelectorAll('.piece.black');
  assert.equal(whitePieces.length, 12, 'должно быть ровно 12 белых шашек');
  assert.equal(blackPieces.length, 12, 'должно быть ровно 12 чёрных шашек');

  const allPieceCells = window.document.querySelectorAll('.cell .piece');
  allPieceCells.forEach((pieceEl) => {
    const cell = pieceEl.closest('.cell');
    assert.ok(cell.classList.contains('dark'), 'все фигуры должны стоять только на тёмных клетках');
  });

  // Дамок в начале быть не должно
  assert.equal(window.document.querySelectorAll('.piece.king').length, 0);

  // Средние ряды (3-4) должны быть полностью пустыми
  for (const row of [3, 4]) {
    for (let col = 0; col < 8; col++) {
      const cell = window.document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
      assert.ok(!cell.querySelector('.piece'), `клетка (${row},${col}) должна быть пустой`);
    }
  }

  assert.equal(errors.length, 0, 'не должно быть ошибок консоли: ' + errors.join('; '));
});

// =====================================================================
// 2. Простые ходы — только по диагонали вперёд
// =====================================================================

test('простой ход: только по диагонали вперёд, на свободную тёмную клетку', () => {
  const { window, errors } = loadGame();

  // Белая шашка (5,4) в старте не заблокирована и должна иметь ровно
  // 2 диагональных хода вперёд: (4,3) и (4,5).
  clickCell(window, 5, 4);
  const targets = Array.from(window.document.querySelectorAll('.cell.legal-move'))
    .map((c) => `${c.dataset.row},${c.dataset.col}`)
    .sort();
  assert.deepEqual(targets, ['4,3', '4,5']);

  // Ход "назад" для простой шашки в принципе невозможен: у шашек в ряду 6/7,
  // заблокированных своим же рядом 5, ходов быть не должно вовсе.
  clickCell(window, 6, 1); // снимаем прошлый выбор
  clickCell(window, 7, 0);
  assert.equal(window.document.querySelectorAll('.cell.legal-move').length, 0);

  assert.equal(errors.length, 0);
});

// =====================================================================
// 3. Обязательное взятие и серийные (мульти-прыжковые) взятия
// =====================================================================

test('обязательное взятие: простой ход недоступен, пока есть срубание', async () => {
  const { window, errors } = loadGame();
  setMode(window, 'pvp'); // без бота — оба хода делаем сами, синхронно, без задержек

  let foundMandatory = false;
  for (let i = 0; i < 400 && !foundMandatory; i++) {
    if (isGameOver(window)) break;
    if (statusText(window).includes('обязательное взятие')) {
      foundMandatory = true;
      break;
    }
    playRandomHalfMove(window);
  }

  assert.ok(foundMandatory, 'за 400 полуходов должна была встретиться ситуация обязательного взятия');

  // В этой ситуации: у фигуры, которая обязана бить, доступны ТОЛЬКО
  // клетки со взятием (.legal-capture), простых ходов (.legal-move) нет.
  const isWhiteTurn = statusText(window).includes('белых');
  const pieceSel = isWhiteTurn ? '.piece.white' : '.piece.black';
  const captureCellBefore = Array.from(window.document.querySelectorAll('.cell.dark'))
    .find((c) => c.querySelector(pieceSel) && !c.querySelector('.no-drag'));
  assert.ok(captureCellBefore, 'должна найтись доступная для выбора бьющая фигура');

  clickCell(window, Number(captureCellBefore.dataset.row), Number(captureCellBefore.dataset.col));
  const legalMoveCells = window.document.querySelectorAll('.cell.legal-move');
  const legalCaptureCells = window.document.querySelectorAll('.cell.legal-capture');
  assert.equal(legalMoveCells.length, 0, 'при обязательном взятии простых ходов быть не должно');
  assert.ok(legalCaptureCells.length > 0, 'должна быть хотя бы одна клетка взятия');

  assert.equal(errors.length, 0);
});

test('серийное взятие: бот доводит цепочку прыжков до конца автоматически', async () => {
  const { window, errors } = loadGame();
  setMode(window, 'pvc');
  const difficultySelect = window.document.getElementById('difficultySelect');
  difficultySelect.value = 'medium';
  difficultySelect.dispatchEvent(new window.Event('change'));

  // Играем случайными ходами за белых до конца партии (или до разумного
  // предела полуходов). После КАЖДОГО завершённого хода бота — даже если
  // это была серия из нескольких прыжков подряд — управление обязано
  // вернуться к белым (или игра завершиться); "зависшего" выбора фигуры
  // бота на середине серии остаться не должно.
  const graveyardBlack = window.document.getElementById('graveyardBlack');
  for (let i = 0; i < 150 && !isGameOver(window) && graveyardBlack.children.length === 0; i++) {
    const played = playRandomHalfMove(window);
    if (!played) break;

    if (statusText(window).includes('чёрных') || statusText(window).includes('Бот')) {
      await waitFor(() => statusText(window).includes('белых') || isGameOver(window), { timeoutMs: 3000 });
      // Ход бота (в т.ч. вся серия взятий) полностью завершён —
      // выбранной фигуры "в подвешенном" состоянии остаться не должно.
      assert.equal(window.document.querySelectorAll('.cell.selected').length, 0);
    }
  }

  // За партию бот (чёрные) должен был хотя бы раз срубить белую фигуру —
  // это отражается в его "кладбище" трофеев (панель graveyardBlack).
  const blackTrophies = graveyardBlack.children.length;
  assert.ok(blackTrophies > 0, 'бот должен был срубить хотя бы одну фигуру за партию (кладбище пусто)');

  assert.equal(errors.length, 0);
});

// =====================================================================
// 4. Превращение в дамку и ход "летающей" дамки
// =====================================================================

test('превращение в дамку и движение дамки на любое число клеток по диагонали', async () => {
  const { window, errors } = loadGame();
  setMode(window, 'pvp');

  let king = null;
  let hasLongJump = false;

  outer: for (let attempt = 0; attempt < 6 && !hasLongJump; attempt++) {
    for (let i = 0; i < 300 && !hasLongJump; i++) {
      if (isGameOver(window)) {
        // Партия завершилась раньше, чем подвернулся подходящий момент —
        // начинаем новую попытку вместо того, чтобы считать тест проваленным.
        window.document.getElementById('restartBtn').click();
        continue outer;
      }
      playRandomHalfMove(window);
      const isWhiteTurn = statusText(window).includes('белых');
      // ВАЖНО: ограничиваем поиск клетками доски (#board) — иначе тот же
      // селектор случайно матчит миниатюрные копии дамок в панели "кладбища"
      // (у них те же классы piece/color/king, просто плюс mini/graveyard-piece).
      const ownKingSel = isWhiteTurn ? '#board .piece.white.king' : '#board .piece.black.king';
      const found = window.document.querySelector(ownKingSel);
      if (!found || found.classList.contains('no-drag')) continue;

      const cell = found.closest('.cell');
      clickCell(window, Number(cell.dataset.row), Number(cell.dataset.col));
      const targets = Array.from(window.document.querySelectorAll('.cell.legal-move, .cell.legal-capture'));
      const fromRow = Number(cell.dataset.row);
      const fromCol = Number(cell.dataset.col);
      const longJumpTarget = targets.find((t) => {
        const dist = Math.max(
          Math.abs(Number(t.dataset.row) - fromRow),
          Math.abs(Number(t.dataset.col) - fromCol)
        );
        return dist > 1;
      });

      if (longJumpTarget) {
        king = found;
        hasLongJump = true;
      } else {
        // Дамка сейчас окружена/зажата — снимаем выбор и продолжаем игру
        // в поисках другого момента с доступным дальним ходом.
        clickCell(window, fromRow, fromCol);
      }
    }
  }

  assert.ok(king, 'за отведённое число попыток должна была появиться дамка с доступным дальним ходом (летающая дамка)');

  // У дамки должна быть настоящая SVG-корона (не эмодзи/текст)
  const crown = king.querySelector('.king-crown');
  assert.ok(crown, 'у дамки должна быть SVG-иконка короны');
  assert.equal(crown.tagName.toLowerCase(), 'svg');

  assert.ok(hasLongJump, 'среди ходов дамки должен быть хотя бы один "дальний" (больше 1 клетки) — признак летающей дамки');

  assert.equal(errors.length, 0);
});

// =====================================================================
// 5. Алгоритмы бота (все уровни сложности) и сброс состояния
// =====================================================================

for (const difficulty of ['easy', 'medium', 'hard']) {
  test(`бот уровня "${difficulty}" делает ход без ошибок консоли`, async () => {
    const { window, errors } = loadGame();
    setMode(window, 'pvc');
    const difficultySelect = window.document.getElementById('difficultySelect');
    difficultySelect.value = difficulty;
    difficultySelect.dispatchEvent(new window.Event('change'));

    const whiteCountBefore = window.document.querySelectorAll('.piece.white').length;
    const blackCountBefore = window.document.querySelectorAll('.piece.black').length;

    // Ход белых, чтобы передать очередь боту
    let played = false;
    for (let i = 0; i < 20 && !played; i++) {
      played = playRandomHalfMove(window);
    }
    assert.ok(played, 'должен был найтись доступный ход белых');

    await waitFor(() => statusText(window).includes('белых') || isGameOver(window), { timeoutMs: 3000 });

    // Бот должен был сходить: суммарное число фигур на доске не увеличилось,
    // а после его хода управление снова у белых (или игра завершилась).
    const totalBefore = whiteCountBefore + blackCountBefore;
    const totalAfter = window.document.querySelectorAll('.piece.white').length
      + window.document.querySelectorAll('.piece.black').length;
    assert.ok(totalAfter <= totalBefore, 'общее число фигур не должно увеличиваться');
    assert.ok(statusText(window).includes('белых') || isGameOver(window));

    assert.equal(errors.length, 0, `ошибки консоли для уровня "${difficulty}": ` + errors.join('; '));
  });
}

test('кнопка "Перезапуск" полностью очищает состояние партии', () => {
  const { window, errors } = loadGame();
  setMode(window, 'pvp');

  // Делаем реальные ходы, пока история ходов действительно не пополнится
  // (одного вызова playRandomHalfMove недостаточно: он может лишь снять
  // выбор с фигуры без доступных ходов, ничего при этом не "сыграв").
  const historyList = window.document.getElementById('historyList');
  for (let i = 0; i < 50 && historyList.children.length === 0; i++) {
    playRandomHalfMove(window);
  }
  assert.ok(historyList.children.length > 0, 'история должна была пополниться после хода');

  window.document.getElementById('restartBtn').click();

  assert.equal(statusText(window), 'Ход белых');
  assert.equal(window.document.querySelectorAll('.piece.white').length, 12);
  assert.equal(window.document.querySelectorAll('.piece.black').length, 12);
  assert.equal(window.document.getElementById('historyList').children.length, 0, 'история ходов должна быть очищена');
  assert.equal(window.document.getElementById('graveyardWhite').children.length, 0, '"кладбище" белых должно быть очищено');
  assert.equal(window.document.getElementById('graveyardBlack').children.length, 0, '"кладбище" чёрных должно быть очищено');
  assert.equal(window.document.querySelectorAll('.cell.selected').length, 0);
  assert.equal(window.document.querySelectorAll('.cell.last-move').length, 0);

  assert.equal(errors.length, 0);
});
