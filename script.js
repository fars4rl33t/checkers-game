(() => {
  'use strict';

  const SIZE = 8;

  // Значения клеток доски:
  // 0 — пусто, 1 — белая простая, 2 — чёрная простая, 3 — белая дамка, 4 — чёрная дамка
  const EMPTY = 0;
  const WHITE_MAN = 1;
  const BLACK_MAN = 2;
  const WHITE_KING = 3;
  const BLACK_KING = 4;

  const boardEl = document.getElementById('board');
  const statusText = document.getElementById('statusText');
  const turnIndicator = document.getElementById('turnIndicator');
  const whiteCountEl = document.getElementById('whiteCount');
  const blackCountEl = document.getElementById('blackCount');
  const restartBtn = document.getElementById('restartBtn');
  const modePvpRadio = document.getElementById('modePvp');
  const modePvcRadio = document.getElementById('modePvc');
  const themeSelect = document.getElementById('themeSelect');
  const historyListEl = document.getElementById('historyList');

  /**
   * Двумерный массив 8x8, представляющий состояние доски.
   * 0 — пусто, 1 — белая простая, 2 — чёрная простая, 3 — белая дамка, 4 — чёрная дамка.
   * @type {number[][]}
   */
  let board = [];
  let currentPlayer = 'white';

  /** Выбранная в данный момент фигура: {row, col} или null. */
  let selected = null;

  /**
   * Доступные ходы/бои для выбранной фигуры:
   * [{row, col, captured: {row,col}|null}, ...]
   */
  let legalTargets = [];

  /** Фигуры currentPlayer, у которых есть доступное взятие в начале хода (обязательное взятие). */
  let mustCapturePieces = [];

  /** {row, col} фигуры, которая находится в процессе серийного взятия (должна продолжать бить). */
  let activeChainPiece = null;

  let gameOver = false;

  /** Правило ничьей: если у обеих сторон остались только дамки, партия
   *  завершается вничью после DRAW_PLIES_LIMIT ходов подряд без взятия. */
  const DRAW_PLIES_LIMIT = 15;

  /** Счётчик полуходов подряд без взятия в эндшпиле "дамка против дамки". */
  let noCaptureKingsOnlyPlies = 0;

  /** true, если хотя бы одно взятие произошло в рамках текущего хода (включая цепочку). */
  let turnHasCaptured = false;

  /** true, если фигурой, которой начат текущий ход, была простая шашка (не дамка). */
  let turnMovedPieceWasMan = false;

  /** Координаты клетки, с которой начался текущий ход (первый прыжок серии). */
  let moveOrigin = null;

  /** Подсветка последнего хода: {from:{row,col}, to:{row,col}} или null. */
  let lastMove = null;

  /** true, если в текущей партии уже сделан хотя бы один ход (для подтверждения рестарта). */
  let moveMadeThisGame = false;

  /**
   * "Турецкий удар": координаты фигур, срубленных В РАМКАХ ТЕКУЩЕГО ХОДА,
   * но ещё физически не убранных с доски (доска хранит их исходное значение).
   * Хранится как Set строк "row,col". Очищается (с реальным удалением
   * фигур из board) только по завершении ВСЕГО хода — endTurn().
   */
  let hitCells = new Set();

  /** Режим игры: 'pvp' — 2 игрока за экраном, 'pvc' — игрок (белые) против бота (чёрные). */
  let gameMode = 'pvc';

  /** true, пока бот "думает" или совершает свой ход — блокирует клики пользователя. */
  let botThinking = false;

  /** Идентификатор setTimeout хода бота — нужен, чтобы отменить фантомный ход при рестарте/смене режима. */
  let botMoveTimeoutId = null;

  /**
   * История ходов в шахматно-шашечной нотации: [{player:'white'|'black', notation:string}, ...].
   * Пара (белые, чёрные) отображается в панели "История ходов" одной строкой с номером хода.
   */
  let moveHistory = [];

  /**
   * Клетки, через которые прошла фигура В РАМКАХ ТЕКУЩЕГО ХОДА (начиная с
   * исходной), в порядке посещения — используется для построения нотации
   * хода целиком (включая серию взятий).
   */
  let currentMoveSquares = [];

  /**
   * {fromRow, fromCol, toRow, toCol} последнего применённого прыжка, для
   * которого нужно проиграть плавную FLIP-анимацию при следующей отрисовке.
   * Сбрасывается сразу после использования в renderBoard().
   */
  let pendingAnimation = null;

  // ---------- Вспомогательные функции по типу фигуры ----------

  function isWhite(piece) {
    return piece === WHITE_MAN || piece === WHITE_KING;
  }

  function isBlack(piece) {
    return piece === BLACK_MAN || piece === BLACK_KING;
  }

  function isKing(piece) {
    return piece === WHITE_KING || piece === BLACK_KING;
  }

  /** Возвращает 'white' | 'black' | null для значения клетки board. */
  function colorOf(piece) {
    if (isWhite(piece)) return 'white';
    if (isBlack(piece)) return 'black';
    return null;
  }

  /** Тёмная клетка — та, где (row + col) нечётно (единая шахматная раскладка). */
  function isDark(row, col) {
    return (row + col) % 2 === 1;
  }

  /** Проверяет, что координаты (row, col) находятся в пределах доски 8x8. */
  function inBounds(row, col) {
    return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
  }

  /** Строковый ключ клетки для Set hitCells. */
  function cellKey(row, col) {
    return row + ',' + col;
  }

  /**
   * true, если фигура на (row, col) уже срублена в рамках ТЕКУЩЕГО хода
   * ("турецкий удар" — ещё физически на доске, но недоступна как цель
   * для повторного взятия и действует как обычное препятствие).
   */
  function isHit(row, col) {
    return hitCells.has(cellKey(row, col));
  }

  /** Направление "вперёд" для простой шашки: белые к row 0, чёрные к row 7. */
  function forwardDir(color) {
    return color === 'white' ? -1 : 1;
  }

  /**
   * Шашечная нотация клетки в стиле "a1"-"h8": колонки a-h слева направо,
   * ряды 1-8 снизу вверх (со стороны белых) — совпадает со стандартной
   * записью ходов в русских шашках, напр. "e3-d4".
   */
  function squareNotation(row, col) {
    return String.fromCharCode(97 + col) + (SIZE - row);
  }

  /**
   * Строит нотацию целого хода (простого или серии взятий) по списку
   * посещённых клеток: "e3-d4" для простого хода, "b4xd6xf8" для серии боя.
   */
  function buildMoveNotation(squares, wasCapture) {
    return squares.map(s => squareNotation(s.row, s.col)).join(wasCapture ? 'x' : '-');
  }

  /** Создаёт независимую копию доски для "проб" ходов (используется ИИ бота). */
  function cloneBoard(b) {
    return b.map(row => row.slice());
  }

  const DIAGONALS = [
    [-1, -1], [-1, 1], [1, -1], [1, 1]
  ];

  /** Создаёт стартовую расстановку доски 8x8 по правилам русских шашек. */
  function setupBoard() {
    const b = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (!isDark(row, col)) continue;
        if (row <= 2) {
          b[row][col] = BLACK_MAN;
        } else if (row >= 5) {
          b[row][col] = WHITE_MAN;
        }
      }
    }
    return b;
  }

  /** Подсчитывает количество фигур цвета color ('white' | 'black'), включая дамки. */
  function countPieces(b, color) {
    let n = 0;
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (colorOf(b[row][col]) === color) n++;
      }
    }
    return n;
  }

  /**
   * Проверяет условие для правила ничьей: у ОБЕИХ сторон есть хотя бы
   * одна фигура, и все фигуры на доске (у обоих цветов) — дамки,
   * простых шашек не осталось ни у кого.
   */
  function boardHasOnlyKings(b) {
    let whiteCount = 0;
    let blackCount = 0;
    let hasAnyMan = false;

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const piece = b[row][col];
        if (piece === EMPTY) continue;
        if (piece === WHITE_MAN || piece === BLACK_MAN) hasAnyMan = true;
        if (colorOf(piece) === 'white') whiteCount++;
        else if (colorOf(piece) === 'black') blackCount++;
      }
    }

    return whiteCount > 0 && blackCount > 0 && !hasAnyMan;
  }

  // ---------- Генерация простых (некапительных) ходов ----------

  /**
   * Простые ходы для фигуры на (row, col), без взятия.
   * Простая шашка — 1 клетка по диагонали ВПЕРЁД на пустую тёмную клетку.
   * Дамка — любое число свободных клеток по диагонали в любом из 4 направлений.
   */
  function getSimpleMoves(b, row, col) {
    const piece = b[row][col];
    if (piece === EMPTY) return [];

    const moves = [];

    if (isKing(piece)) {
      for (const [dr, dc] of DIAGONALS) {
        let r = row + dr;
        let c = col + dc;
        while (inBounds(r, c) && isDark(r, c) && b[r][c] === EMPTY) {
          moves.push({ row: r, col: c });
          r += dr;
          c += dc;
        }
      }
    } else {
      const dr = forwardDir(colorOf(piece));
      for (const dc of [-1, 1]) {
        const toRow = row + dr;
        const toCol = col + dc;
        if (inBounds(toRow, toCol) && isDark(toRow, toCol) && b[toRow][toCol] === EMPTY) {
          moves.push({ row: toRow, col: toCol });
        }
      }
    }
    return moves;
  }

  // ---------- Генерация ходов со взятием ----------

  /**
   * Взятия простой шашкой: перепрыгивает через одну вражескую фигуру,
   * стоящую на соседней диагональной клетке, на свободную клетку сразу за ней.
   * Разрешено по диагонали в любом из 4 направлений — и вперёд, и назад.
   */
  function getManCaptureMoves(b, row, col) {
    const piece = b[row][col];
    if (piece === EMPTY || isKing(piece)) return [];

    const color = colorOf(piece);
    const captures = [];

    for (const [dr, dc] of DIAGONALS) {
      const midRow = row + dr;
      const midCol = col + dc;
      const toRow = row + dr * 2;
      const toCol = col + dc * 2;

      if (!inBounds(toRow, toCol) || !isDark(toRow, toCol)) continue;

      const midPiece = b[midRow] && b[midRow][midCol];
      if (
        midPiece !== undefined &&
        midPiece !== EMPTY &&
        colorOf(midPiece) !== color &&
        !isHit(midRow, midCol) && // "турецкий удар": уже срубленную в этом ходе фигуру рубить повторно нельзя
        b[toRow][toCol] === EMPTY
      ) {
        captures.push({ row: toRow, col: toCol, captured: { row: midRow, col: midCol } });
      }
    }

    return captures;
  }

  /**
   * Взятия дамкой: бьёт на любую свободную клетку по диагонали ЗА одиночной
   * вражеской фигурой, в любом из 4 направлений (вперёд и назад).
   */
  function getKingCaptureMoves(b, row, col) {
    const piece = b[row][col];
    if (piece === EMPTY || !isKing(piece)) return [];

    const color = colorOf(piece);
    const captures = [];

    for (const [dr, dc] of DIAGONALS) {
      let r = row + dr;
      let c = col + dc;

      // Идём по пустым клеткам до первой занятой
      while (inBounds(r, c) && isDark(r, c) && b[r][c] === EMPTY) {
        r += dr;
        c += dc;
      }

      if (!inBounds(r, c) || !isDark(r, c)) continue;

      const enemyPiece = b[r][c];
      // Своя фигура ИЛИ уже срубленная в этом ходе ("побитая") фигура блокирует
      // направление: побитая фигура физически ещё на доске, но повторно её
      // рубить нельзя — для дамки это обычное непроходимое препятствие.
      if (enemyPiece === EMPTY || colorOf(enemyPiece) === color || isHit(r, c)) continue;

      // Нашли вражескую фигуру — клетки посадки сразу за ней, пока свободны
      let landR = r + dr;
      let landC = c + dc;
      while (inBounds(landR, landC) && isDark(landR, landC) && b[landR][landC] === EMPTY) {
        captures.push({ row: landR, col: landC, captured: { row: r, col: c } });
        landR += dr;
        landC += dc;
      }
    }

    return captures;
  }

  /** Возвращает взятия для фигуры на (row, col) в зависимости от её типа. */
  function getCaptureMoves(b, row, col) {
    const piece = b[row][col];
    if (piece === EMPTY) return [];
    return isKing(piece) ? getKingCaptureMoves(b, row, col) : getManCaptureMoves(b, row, col);
  }

  /** Список фигур игрока color, у которых есть хотя бы одно доступное взятие. */
  function getPiecesWithCaptures(b, color) {
    const list = [];
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (colorOf(b[row][col]) === color && getCaptureMoves(b, row, col).length > 0) {
          list.push({ row, col });
        }
      }
    }
    return list;
  }

  /** Есть ли у фигуры на (row, col) хотя бы один ход (простой или бой). */
  function pieceHasAnyMove(b, row, col) {
    return getSimpleMoves(b, row, col).length > 0 || getCaptureMoves(b, row, col).length > 0;
  }

  /** Есть ли у игрока color хотя бы один возможный ход какой-либо фигурой. */
  function playerHasAnyMove(b, color) {
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (colorOf(b[row][col]) === color && pieceHasAnyMove(b, row, col)) {
          return true;
        }
      }
    }
    return false;
  }

  /** Пересчитывает список фигур с обязательным взятием для текущего игрока. */
  function computeMustCapture() {
    mustCapturePieces = getPiecesWithCaptures(board, currentPlayer);
  }

  // ---------- Логика бота (режим "Игрок против Компьютера") ----------

  /**
   * Рекурсивно вычисляет максимальное число ДОПОЛНИТЕЛЬНЫХ взятий, которое
   * можно совершить фигурой на (row, col), продолжая серию боя из текущего
   * положения на клоне доски b. Используется, чтобы бот выбирал ход,
   * ведущий к самой длинной серии срубаний.
   */
  function maxCaptureCount(b, row, col) {
    const caps = getCaptureMoves(b, row, col);
    if (caps.length === 0) return 0;

    let best = 0;
    for (const cap of caps) {
      const clone = cloneBoard(b);
      const piece = clone[row][col];
      clone[row][col] = EMPTY;
      clone[cap.captured.row][cap.captured.col] = EMPTY;
      clone[cap.row][cap.col] = piece;
      promoteIfNeeded(clone, cap.row, cap.col);

      const further = maxCaptureCount(clone, cap.row, cap.col);
      if (1 + further > best) best = 1 + further;
    }
    return best;
  }

  /**
   * Приоритет 1 бота: среди ВСЕХ чёрных фигур с обязательным взятием находит
   * пару (фигура, первый прыжок), которая ведёт к максимально длинной серии
   * срубаний в целом по доске.
   */
  function chooseBotCaptureStart() {
    let best = { length: -1, piece: null, target: null };

    for (const p of mustCapturePieces) {
      const caps = getCaptureMoves(board, p.row, p.col);
      for (const cap of caps) {
        const clone = cloneBoard(board);
        const piece = clone[p.row][p.col];
        clone[p.row][p.col] = EMPTY;
        clone[cap.captured.row][cap.captured.col] = EMPTY;
        clone[cap.row][cap.col] = piece;
        promoteIfNeeded(clone, cap.row, cap.col);

        const total = 1 + maxCaptureCount(clone, cap.row, cap.col);
        if (total > best.length) {
          best = { length: total, piece: p, target: cap };
        }
      }
    }
    return best;
  }

  /**
   * Внутри уже идущей серии взятий выбирает следующий прыжок из доступных
   * legalTargets, максимизирующий оставшуюся длину серии.
   */
  function chooseBestContinuation(fromRow, fromCol) {
    let bestTarget = null;
    let bestLen = -1;

    for (const t of legalTargets) {
      const clone = cloneBoard(board);
      const piece = clone[fromRow][fromCol];
      clone[fromRow][fromCol] = EMPTY;
      clone[t.captured.row][t.captured.col] = EMPTY;
      clone[t.row][t.col] = piece;
      promoteIfNeeded(clone, t.row, t.col);

      const len = 1 + maxCaptureCount(clone, t.row, t.col);
      if (len > bestLen) {
        bestLen = len;
        bestTarget = t;
      }
    }
    return bestTarget;
  }

  /** Проверяет, окажется ли фигура на (row, col) под боем белых после хода (клон доски b). */
  function moveExposesCapture(b, row, col) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (colorOf(b[r][c]) === 'white') {
          const caps = getCaptureMoves(b, r, c);
          if (caps.some(cap => cap.captured.row === row && cap.captured.col === col)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /** Грубая оценка "активности" позиции для дамки — чем ближе к центру доски, тем выше. */
  function centralityScore(row, col) {
    return -(Math.abs(row - 3.5) + Math.abs(col - 3.5));
  }

  /**
   * Приоритет 2/3 бота: выбирает лучший простой (некапительный) ход среди
   * всех доступных чёрных фигур.
   * - Исключает ходы, которые сразу подставляют фигуру под взятие белыми (Приоритет 2).
   * - Среди безопасных ходов предпочитает те, что продвигают простую шашку
   *   ближе к дамке (row 7) или ставят дамку на более активную (центральную) клетку.
   * - Если безопасных ходов нет — берёт случайный из всех доступных (Приоритет 3, фоллбэк).
   */
  function chooseBotSimpleMove() {
    const allMoves = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (colorOf(board[r][c]) === 'black') {
          for (const m of getSimpleMoves(board, r, c)) {
            allMoves.push({ from: { row: r, col: c }, to: m });
          }
        }
      }
    }
    if (allMoves.length === 0) return null;

    const scored = allMoves.map(mv => {
      const clone = cloneBoard(board);
      const piece = clone[mv.from.row][mv.from.col];
      clone[mv.from.row][mv.from.col] = EMPTY;
      clone[mv.to.row][mv.to.col] = piece;
      promoteIfNeeded(clone, mv.to.row, mv.to.col);

      const safe = !moveExposesCapture(clone, mv.to.row, mv.to.col);
      const advanceScore = isKing(piece) ? centralityScore(mv.to.row, mv.to.col) : mv.to.row;
      return { ...mv, safe, advanceScore };
    });

    const safeMoves = scored.filter(m => m.safe);
    const pool = safeMoves.length > 0 ? safeMoves : scored; // Приоритет 3: фоллбэк на любой валидный ход

    const maxScore = Math.max(...pool.map(m => m.advanceScore));
    const bestMoves = pool.filter(m => m.advanceScore === maxScore);
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  /**
   * Выполняет весь ход бота (чёрных): обязательное взятие с максимальной
   * серией срубаний (Приоритет 1), либо безопасный продвигающий простой
   * ход (Приоритет 2), либо случайный валидный ход (Приоритет 3).
   * Серия взятий доводится до конца автоматически, без участия пользователя.
   */
  function performBotTurn() {
    if (gameOver) {
      botThinking = false;
      return;
    }

    if (mustCapturePieces.length > 0) {
      const choice = chooseBotCaptureStart();
      if (choice.piece && choice.target) {
        selectPiece(choice.piece.row, choice.piece.col);
        let target = legalTargets.find(t => t.row === choice.target.row && t.col === choice.target.col);
        if (target) applyMove(target);

        // Автоматически доводим серию взятий до конца
        while (activeChainPiece) {
          const next = chooseBestContinuation(activeChainPiece.row, activeChainPiece.col);
          if (!next) break; // защита от несогласованного состояния — не должно происходить
          applyMove(next);
        }
      }
    } else {
      const chosen = chooseBotSimpleMove();
      if (chosen) {
        selectPiece(chosen.from.row, chosen.from.col);
        const target = legalTargets.find(t => t.row === chosen.to.row && t.col === chosen.to.col);
        if (target) applyMove(target);
      }
    }

    botThinking = false;
    renderBoard();
  }

  /**
   * Если сейчас ход чёрных в режиме "против компьютера" — запускает ход бота
   * с искусственной задержкой 500–800 мс, блокируя клики пользователя на это время.
   */
  function scheduleBotMoveIfNeeded() {
    if (gameMode !== 'pvc' || gameOver || currentPlayer !== 'black') return;

    botThinking = true;
    renderBoard(); // сразу отражаем "бот думает" и блокируем клики

    const delay = 500 + Math.random() * 300; // 500-800 мс
    botMoveTimeoutId = setTimeout(() => {
      botMoveTimeoutId = null;
      performBotTurn();
    }, delay);
  }

  // ---------- Выбор фигуры и выполнение хода ----------

  function clearSelection() {
    selected = null;
    legalTargets = [];
  }

  /**
   * Выбирает фигуру на (row, col) и вычисляет для неё доступные цели.
   * Если у игрока есть обязательное взятие — цели ограничены боем (никаких
   * простых ходов). Иначе — обычные ходы этой фигуры.
   */
  function selectPiece(row, col) {
    selected = { row, col };
    if (mustCapturePieces.length > 0) {
      legalTargets = getCaptureMoves(board, row, col).map(m => ({
        row: m.row, col: m.col, captured: m.captured
      }));
    } else {
      legalTargets = getSimpleMoves(board, row, col).map(m => ({
        row: m.row, col: m.col, captured: null
      }));
    }
  }

  /**
   * Перемещает выбранную фигуру на цель target, снимает срубленную фигуру
   * (если была), проверяет превращение в дамку. Если после взятия та же
   * фигура может бить ещё раз — ход НЕ завершается (серийное взятие);
   * иначе передаёт ход сопернику.
   */
  function applyMove(target) {
    const { row: fromRow, col: fromCol } = selected;
    const piece = board[fromRow][fromCol];

    // Первый прыжок хода (не продолжение серии) — фиксируем начало хода
    // и тип фигуры, которой он начат (для правила ничьей и нотации).
    if (!activeChainPiece) {
      moveOrigin = { row: fromRow, col: fromCol };
      turnMovedPieceWasMan = !isKing(piece);
      currentMoveSquares = [{ row: fromRow, col: fromCol }];
    }

    // Запоминаем прыжок для плавной FLIP-анимации при следующей отрисовке.
    pendingAnimation = { fromRow, fromCol, toRow: target.row, toCol: target.col };

    board[fromRow][fromCol] = EMPTY;
    if (target.captured) {
      // "Турецкий удар": срубленную фигуру НЕ удаляем немедленно — только
      // помечаем клетку как "побитую". Физическое удаление произойдёт
      // после завершения ВСЕГО хода, в endTurn(). До этого момента фигура
      // остаётся на доске как непроходимое препятствие и не может быть
      // срублена повторно (см. isHit() в getManCaptureMoves/getKingCaptureMoves).
      hitCells.add(cellKey(target.captured.row, target.captured.col));
      turnHasCaptured = true;
    }
    board[target.row][target.col] = piece;

    promoteIfNeeded(board, target.row, target.col);
    currentMoveSquares.push({ row: target.row, col: target.col });

    const wasCapture = !!target.captured;

    if (wasCapture) {
      const furtherCaptures = getCaptureMoves(board, target.row, target.col);
      if (furtherCaptures.length > 0) {
        // Серийное взятие: та же фигура обязана продолжить бить
        activeChainPiece = { row: target.row, col: target.col };
        selected = { row: target.row, col: target.col };
        legalTargets = furtherCaptures.map(m => ({ row: m.row, col: m.col, captured: m.captured }));
        renderBoard();
        return;
      }
    }

    lastMove = { from: moveOrigin, to: { row: target.row, col: target.col } };
    moveMadeThisGame = true;
    endTurn();
  }

  /** Завершает ход: сбрасывает выбор/цепочку, передаёт ход сопернику, проверяет конец игры. */
  function endTurn() {
    // "Турецкий удар": ход полностью завершён — теперь физически убираем
    // с доски все фигуры, срубленные в рамках этого хода. Делаем это ДО
    // расчёта правила ничьей и любых подсчётов, чтобы board отражал
    // истинное итоговое состояние.
    for (const key of hitCells) {
      const [r, c] = key.split(',').map(Number);
      board[r][c] = EMPTY;
    }
    hitCells.clear();

    // Запись хода в историю (шашечная нотация) — используем turnHasCaptured
    // и currentPlayer ДО их сброса/переключения ниже.
    if (currentMoveSquares.length > 1) {
      moveHistory.push({
        player: currentPlayer,
        notation: buildMoveNotation(currentMoveSquares, turnHasCaptured)
      });
      renderMoveHistory();
    }
    currentMoveSquares = [];

    // Правило ничьей: считаем полуходы без взятия в эндшпиле "дамка против дамки".
    // Счётчик сбрасывается ЛЮБЫМ взятием, ходом простой шашки, либо если на доске
    // ещё остались простые шашки хотя бы у одной из сторон (условие "только дамки" не выполнено).
    const onlyKingsNow = boardHasOnlyKings(board);
    if (turnHasCaptured || turnMovedPieceWasMan || !onlyKingsNow) {
      noCaptureKingsOnlyPlies = 0;
    } else {
      noCaptureKingsOnlyPlies++;
    }
    turnHasCaptured = false;
    turnMovedPieceWasMan = false;

    activeChainPiece = null;
    clearSelection();
    currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
    computeMustCapture();
    checkGameOver();
    renderBoard();
    scheduleBotMoveIfNeeded();
  }

  /** Превращает простую шашку в дамку при достижении противоположного края доски (на доске b). */
  function promoteIfNeeded(b, row, col) {
    const piece = b[row][col];
    if (piece === WHITE_MAN && row === 0) {
      b[row][col] = WHITE_KING;
    } else if (piece === BLACK_MAN && row === SIZE - 1) {
      b[row][col] = BLACK_KING;
    }
  }

  /**
   * Проверяет условия окончания игры после смены хода:
   * у currentPlayer не осталось фигур, зафиксирована ничья, или нет
   * ни одного доступного хода.
   */
  function checkGameOver() {
    const whiteCount = countPieces(board, 'white');
    const blackCount = countPieces(board, 'black');

    if (whiteCount === 0) {
      gameOver = true;
      statusText.textContent = 'Чёрные победили! У белых не осталось фигур.';
      return;
    }
    if (blackCount === 0) {
      gameOver = true;
      statusText.textContent = 'Белые победили! У чёрных не осталось фигур.';
      return;
    }
    if (noCaptureKingsOnlyPlies >= DRAW_PLIES_LIMIT) {
      gameOver = true;
      statusText.textContent = `Ничья! ${DRAW_PLIES_LIMIT} ходов подряд без взятия — на доске остались только дамки.`;
      return;
    }
    if (!playerHasAnyMove(board, currentPlayer)) {
      gameOver = true;
      const winner = currentPlayer === 'white' ? 'Чёрные' : 'Белые';
      const loser = currentPlayer === 'white' ? 'у белых' : 'у чёрных';
      statusText.textContent = `${winner} победили! Нет доступных ходов (${loser}).`;
      return;
    }
  }

  // ---------- Обработка кликов ----------

  function flashMandatoryCapture() {
    statusText.classList.add('shake');
    statusText.textContent = 'Есть обязательное взятие — выберите шашку, которая бьёт';
    setTimeout(() => {
      statusText.classList.remove('shake');
      updateStatusText();
    }, 1200);
  }

  function updateStatusText() {
    if (gameOver) return;
    if (gameMode === 'pvc' && currentPlayer === 'black') {
      statusText.textContent = botThinking ? 'Бот думает…' : 'Ход чёрных (бот)';
      return;
    }
    const label = currentPlayer === 'white' ? 'белых' : 'чёрных';
    statusText.textContent = mustCapturePieces.length > 0
      ? `Ход ${label} — обязательное взятие`
      : `Ход ${label}`;
  }

  function handleCellClick(row, col) {
    if (gameOver) return;
    if (botThinking) return; // ход бота ещё выполняется — клики игнорируем
    if (gameMode === 'pvc' && currentPlayer === 'black') return; // чёрными управляет только бот

    if (!isDark(row, col)) {
      if (!activeChainPiece) {
        clearSelection();
        renderBoard();
      }
      return;
    }

    // Мид-цепочка серийного взятия: можно кликать ТОЛЬКО по доступным целям боя
    if (activeChainPiece) {
      const target = legalTargets.find(t => t.row === row && t.col === col);
      if (target) {
        applyMove(target);
      }
      return; // любой другой клик игнорируется — фигура обязана продолжить бить
    }

    // Клик по подсвеченной клетке-цели выбранной фигуры
    if (selected) {
      const target = legalTargets.find(t => t.row === row && t.col === col);
      if (target) {
        applyMove(target);
        return;
      }
    }

    const piece = board[row][col];

    // Повторный клик по уже выбранной фигуре снимает выбор
    if (selected && selected.row === row && selected.col === col) {
      clearSelection();
      renderBoard();
      return;
    }

    // Клик по своей фигуре — выбираем её (с учётом обязательного взятия)
    if (colorOf(piece) === currentPlayer) {
      if (mustCapturePieces.length > 0) {
        const allowed = mustCapturePieces.some(p => p.row === row && p.col === col);
        if (!allowed) {
          flashMandatoryCapture();
          return;
        }
      }
      selectPiece(row, col);
      renderBoard();
      return;
    }

    // Пустая нецелевая клетка или фигура соперника — сброс выбора без ошибок
    clearSelection();
    renderBoard();
  }

  // ---------- Отрисовка ----------

  function pieceCssClass(piece) {
    const color = colorOf(piece);
    return `piece ${color}${isKing(piece) ? ' king' : ''}`;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Строит настоящую векторную SVG-иконку короны для дамки (вместо текста
   * или эмодзи). Заливка ссылается на общий градиент #crownGradient,
   * объявленный один раз в index.html и подхватывающий цвета текущей
   * темы через CSS-переменные — при смене темы перерисовывать иконку не нужно.
   */
  function buildCrownSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'king-crown');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M3 18.4h18l-1.3-9.1-4.4 4.1-3.3-6.6-3.3 6.6-4.4-4.1L3 18.4z');
    path.setAttribute('fill', 'url(#crownGradient)');
    path.setAttribute('stroke', 'rgba(0,0,0,0.35)');
    path.setAttribute('stroke-width', '0.6');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    const base = document.createElementNS(SVG_NS, 'rect');
    base.setAttribute('x', '3');
    base.setAttribute('y', '18.1');
    base.setAttribute('width', '18');
    base.setAttribute('height', '2');
    base.setAttribute('rx', '0.6');
    base.setAttribute('fill', 'url(#crownGradient)');
    base.setAttribute('stroke', 'rgba(0,0,0,0.35)');
    base.setAttribute('stroke-width', '0.4');
    svg.appendChild(base);

    [[4.6, 8.5, 1.15], [12, 5.3, 1.3], [19.4, 8.5, 1.15]].forEach(([cx, cy, r]) => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', String(r));
      circle.setAttribute('fill', 'url(#crownGradient)');
      circle.setAttribute('stroke', 'rgba(0,0,0,0.3)');
      circle.setAttribute('stroke-width', '0.4');
      svg.appendChild(circle);
    });

    return svg;
  }

  /**
   * Отрисовывает доску 8x8 в DOM на основе текущего массива board.
   * Подсвечивает выбранную фигуру, доступные простые ходы (жёлтая точка)
   * и клетки взятия (красная точка), рисует корону и двойной контур у дамок.
   * Если задан pendingAnimation (сразу после хода), проигрывает плавную
   * FLIP-анимацию перемещения фигуры от старой клетки к новой вместо
   * мгновенной перерисовки.
   */
  function renderBoard() {
    // FLIP-анимация, шаг 1 ("First"): запоминаем экранные координаты
    // фигуры на ЕЁ СТАРОЙ позиции, пока старый DOM ещё не уничтожен.
    let flipStartRect = null;
    if (pendingAnimation) {
      const fromCell = boardEl.querySelector(
        `.cell[data-row="${pendingAnimation.fromRow}"][data-col="${pendingAnimation.fromCol}"]`
      );
      const fromPieceEl = fromCell && fromCell.querySelector('.piece');
      if (fromPieceEl && typeof fromPieceEl.getBoundingClientRect === 'function') {
        flipStartRect = fromPieceEl.getBoundingClientRect();
      }
    }

    boardEl.innerHTML = '';

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const cell = document.createElement('div');
        cell.className = `cell ${isDark(row, col) ? 'dark' : 'light'}`;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);

        if (isDark(row, col)) {
          const isSelected = selected && selected.row === row && selected.col === col;
          const target = legalTargets.find(t => t.row === row && t.col === col);
          const isLastMoveSquare = lastMove && (
            (lastMove.from.row === row && lastMove.from.col === col) ||
            (lastMove.to.row === row && lastMove.to.col === col)
          );

          if (isLastMoveSquare) cell.classList.add('last-move');
          if (isSelected) cell.classList.add('selected');
          if (target) {
            cell.classList.add(target.captured ? 'legal-capture' : 'legal-move');
          }

          const piece = board[row][col];
          if (piece !== EMPTY) {
            const hit = isHit(row, col);
            const canSelect = !hit && !gameOver && !botThinking && colorOf(piece) === currentPlayer &&
              !(gameMode === 'pvc' && currentPlayer === 'black') &&
              (!activeChainPiece || (activeChainPiece.row === row && activeChainPiece.col === col)) &&
              (mustCapturePieces.length === 0 || mustCapturePieces.some(p => p.row === row && p.col === col));

            const pieceEl = document.createElement('div');
            pieceEl.className = pieceCssClass(piece) + (canSelect ? '' : ' no-drag') + (hit ? ' hit' : '');
            if (isKing(piece)) {
              pieceEl.appendChild(buildCrownSvg());
            }
            cell.appendChild(pieceEl);
          }

          cell.addEventListener('click', () => handleCellClick(row, col));
        }

        boardEl.appendChild(cell);
      }
    }

    // FLIP-анимация, шаги 2-4 ("Last, Invert, Play"): сравниваем новую
    // позицию фигуры со старой и плавно "доигрываем" разницу через transform,
    // вместо мгновенного визуального скачка при перерисовке доски.
    if (pendingAnimation && flipStartRect) {
      const toCell = boardEl.querySelector(
        `.cell[data-row="${pendingAnimation.toRow}"][data-col="${pendingAnimation.toCol}"]`
      );
      const toPieceEl = toCell && toCell.querySelector('.piece');
      if (toPieceEl && typeof toPieceEl.getBoundingClientRect === 'function') {
        const endRect = toPieceEl.getBoundingClientRect();
        const dx = flipStartRect.left - endRect.left;
        const dy = flipStartRect.top - endRect.top;
        if (dx !== 0 || dy !== 0) {
          toPieceEl.style.transition = 'none';
          toPieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
          // Форсируем reflow, чтобы браузер применил стартовое положение
          // ДО того, как мы включим transition обратно.
          void toPieceEl.offsetWidth;
          toPieceEl.style.transition = '';
          toPieceEl.style.transform = '';
        }
      }
    }
    pendingAnimation = null;

    whiteCountEl.textContent = `Белые: ${countPieces(board, 'white')}`;
    blackCountEl.textContent = `Чёрные: ${countPieces(board, 'black')}`;
    turnIndicator.classList.toggle('black', currentPlayer === 'black');
    updateStatusText();
  }

  /**
   * Перерисовывает панель "История ходов": группирует ходы парами
   * (белые + чёрные) под общим номером хода, например "1. e3-d4 d6-c5".
   * Автоматически прокручивает список к последнему добавленному ходу.
   */
  function renderMoveHistory() {
    historyListEl.innerHTML = '';

    for (let i = 0; i < moveHistory.length; i += 2) {
      const moveNumber = i / 2 + 1;
      const whiteEntry = moveHistory[i];
      const blackEntry = moveHistory[i + 1];

      const li = document.createElement('li');

      const numSpan = document.createElement('span');
      numSpan.className = 'history-move-num';
      numSpan.textContent = `${moveNumber}.`;
      li.appendChild(numSpan);

      const whiteSpan = document.createElement('span');
      whiteSpan.className = 'history-white';
      whiteSpan.textContent = whiteEntry ? whiteEntry.notation : '';
      li.appendChild(whiteSpan);

      if (blackEntry) {
        const blackSpan = document.createElement('span');
        blackSpan.className = 'history-black';
        blackSpan.textContent = blackEntry.notation;
        li.appendChild(blackSpan);
      }

      historyListEl.appendChild(li);
    }

    historyListEl.scrollTop = historyListEl.scrollHeight;
  }

  function restart() {
    // Отменяем возможный отложенный (ещё не выполненный) ход бота, чтобы
    // избежать "фантомного" хода компьютера после сброса партии.
    if (botMoveTimeoutId !== null) {
      clearTimeout(botMoveTimeoutId);
      botMoveTimeoutId = null;
    }
    botThinking = false;

    board = setupBoard();
    currentPlayer = 'white';
    gameOver = false;
    activeChainPiece = null;
    noCaptureKingsOnlyPlies = 0;
    turnHasCaptured = false;
    turnMovedPieceWasMan = false;
    moveOrigin = null;
    lastMove = null;
    moveMadeThisGame = false;
    hitCells.clear();
    moveHistory = [];
    currentMoveSquares = [];
    pendingAnimation = null;
    statusText.classList.remove('shake');
    clearSelection();
    computeMustCapture();
    renderMoveHistory();
    renderBoard();
    // Партия всегда начинается ходом белых, поэтому бот здесь не запускается сразу.
  }

  /**
   * Обработчик кнопки "Перезапуск": если партия ещё не завершена и уже
   * сделан хотя бы один ход — запрашивает подтверждение, чтобы не сбросить
   * прогресс случайным кликом.
   */
  function handleRestartClick() {
    if (!gameOver && moveMadeThisGame) {
      const confirmed = window.confirm(
        'Игра ещё не завершена. Вы уверены, что хотите перезапустить партию? Весь прогресс будет потерян.'
      );
      if (!confirmed) return;
    }
    restart();
  }

  /** Переключение режима игры — можно в любой момент, партия автоматически сбрасывается. */
  function handleModeChange(newMode) {
    if (newMode === gameMode) return;
    gameMode = newMode;
    restart();
  }

  /**
   * Применяет тему оформления: обновляет data-атрибут на <html>
   * (CSS-переменные подхватываются автоматически) и сохраняет выбор
   * в localStorage, чтобы тема не сбрасывалась при перезагрузке страницы.
   */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('checkersTheme', theme);
    } catch (e) {
      // localStorage недоступен (приватный режим и т.п.) — тема просто не сохранится
    }
  }

  restartBtn.addEventListener('click', handleRestartClick);
  modePvpRadio.addEventListener('change', () => {
    if (modePvpRadio.checked) handleModeChange('pvp');
  });
  modePvcRadio.addEventListener('change', () => {
    if (modePvcRadio.checked) handleModeChange('pvc');
  });

  // Синхронизируем выпадающий список с темой, уже применённой инлайн-скриптом
  // в <head> (из localStorage или 'wood' по умолчанию), и подписываемся на смену.
  themeSelect.value = document.documentElement.dataset.theme || 'wood';
  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value);
  });

  restart();
})();
