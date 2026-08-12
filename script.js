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
  const difficultyPanel = document.getElementById('difficultyPanel');
  const difficultySelect = document.getElementById('difficultySelect');
  const themeSelect = document.getElementById('themeSelect');
  const historyListEl = document.getElementById('historyList');
  const whiteStatusEl = document.getElementById('whiteStatus');
  const blackStatusEl = document.getElementById('blackStatus');
  const blackPlayerNameEl = document.getElementById('blackPlayerName');
  const whitePlayerPanelEl = document.querySelector('.player-panel-white');
  const blackPlayerPanelEl = document.querySelector('.player-panel-black');
  const graveyardWhiteEl = document.getElementById('graveyardWhite');
  const graveyardBlackEl = document.getElementById('graveyardBlack');
  const victoryModalEl = document.getElementById('victoryModal');
  const modalTitleEl = document.getElementById('modalTitle');
  const modalSubtitleEl = document.getElementById('modalSubtitle');
  const modalMoveCountEl = document.getElementById('modalMoveCount');
  const modalWhiteCapturesEl = document.getElementById('modalWhiteCaptures');
  const modalBlackCapturesEl = document.getElementById('modalBlackCaptures');
  const modalRematchBtn = document.getElementById('modalRematchBtn');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const confettiCanvas = document.getElementById('confettiCanvas');

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

  /** Уровень сложности бота: 'easy' | 'medium' | 'hard'. Актуален только в режиме 'pvc'. */
  let botDifficulty = 'medium';

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

  /**
   * "Кладбище" срубленных фигур по игрокам: graveyard.white — фигуры,
   * СРУБЛЕННЫЕ БЕЛЫМИ (то есть чёрные трофеи в панели белого игрока), и
   * наоборот для graveyard.black. Каждая запись — {king: boolean}.
   */
  let graveyard = { white: [], black: [] };

  /**
   * Set ключей "row,col" тех "побитых" (см. hitCells) клеток, для которых
   * анимация уменьшения/растворения уже была проиграна — чтобы при
   * повторных перерисовках в рамках одной серии взятий анимация не
   * запускалась заново для уже скрытых фигур.
   */
  let hitCellsAnimated = new Set();

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
   * Приоритет 2/3 "Среднего" бота: выбирает лучший простой (некапительный)
   * ход среди всех доступных чёрных фигур.
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
   * УРОВЕНЬ "СРЕДНИЙ": обязательное взятие с максимальной серией срубаний
   * (Приоритет 1), либо безопасный продвигающий простой ход (Приоритет 2),
   * либо случайный валидный ход (Приоритет 3). Серия взятий доводится до
   * конца автоматически, без участия пользователя. Это исходная ("жадная")
   * логика бота из предыдущих шагов.
   */
  function performMediumBotMove() {
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
  }

  /**
   * УРОВЕНЬ "ЛЁГКИЙ": обязательное взятие выполняется (правила игры не
   * обходятся — это не опция бота), но БЕЗ поиска максимальной серии —
   * фигура и каждый следующий прыжок серии выбираются случайно среди
   * доступных вариантов. Если срубаний нет — полностью случайный
   * валидный простой ход, без оценки безопасности или стратегии.
   */
  function performEasyBotMove() {
    if (mustCapturePieces.length > 0) {
      const piece = mustCapturePieces[Math.floor(Math.random() * mustCapturePieces.length)];
      selectPiece(piece.row, piece.col);

      let target = legalTargets[Math.floor(Math.random() * legalTargets.length)];
      if (target) applyMove(target);

      while (activeChainPiece) {
        const next = legalTargets[Math.floor(Math.random() * legalTargets.length)];
        if (!next) break; // защита от несогласованного состояния — не должно происходить
        applyMove(next);
      }
    } else {
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
      if (allMoves.length > 0) {
        const chosen = allMoves[Math.floor(Math.random() * allMoves.length)];
        selectPiece(chosen.from.row, chosen.from.col);
        const target = legalTargets.find(t => t.row === chosen.to.row && t.col === chosen.to.col);
        if (target) applyMove(target);
      }
    }
  }

  // ---------- УРОВЕНЬ "СЛОЖНЫЙ": Minimax с альфа-бета отсечением ----------

  /** Глубина просчёта минимакса в "ходах" (сменах игрока), не в прыжках серии. */
  const HARD_MINIMAX_DEPTH = 4;

  /**
   * Жёсткий предохранитель от "зависания" вкладки: сколько бы ни было
   * реально исследовано узлов дерева, поиск гарантированно остановится
   * (вернёт эвристическую оценку вместо дальнейшего рекурсивного спуска)
   * после превышения этого бюджета, независимо от глубины и ветвления.
   */
  const HARD_NODE_BUDGET = 15000;
  let hardNodesVisited = 0;

  /**
   * Рекурсивно собирает ВСЕ возможные полные серии взятия для фигуры,
   * стартующей в (startRow, startCol) на доске b (в отличие от бота
   * "Средний", который ищет только максимально длинную серию — здесь
   * нужны ВСЕ варианты, чтобы минимакс мог сравнить их эвристически,
   * а не только по длине).
   */
  function collectCaptureSequences(b, row, col, path, results) {
    const caps = getCaptureMoves(b, row, col);
    if (caps.length === 0) {
      results.push({ path, boardAfter: b });
      return;
    }
    for (const cap of caps) {
      const clone = cloneBoard(b);
      const piece = clone[row][col];
      clone[row][col] = EMPTY;
      clone[cap.captured.row][cap.captured.col] = EMPTY;
      clone[cap.row][cap.col] = piece;
      promoteIfNeeded(clone, cap.row, cap.col);
      collectCaptureSequences(
        clone, cap.row, cap.col,
        path.concat([{ row: cap.row, col: cap.col, captured: cap.captured }]),
        results
      );
    }
  }

  /**
   * Генерирует ВСЕ полные легальные ходы (целиком — включая полные серии
   * взятия, если они обязательны) для игрока color на доске b. Каждый
   * результат содержит стартовую клетку, путь прыжков (для последующего
   * реального применения через selectPiece/applyMove) и итоговую доску
   * (для рекурсивного поиска минимакса).
   */
  function generateAllTurnMoves(b, color) {
    const moves = [];
    const withCaptures = getPiecesWithCaptures(b, color);

    if (withCaptures.length > 0) {
      for (const piece of withCaptures) {
        const results = [];
        collectCaptureSequences(b, piece.row, piece.col, [], results);
        for (const r of results) {
          moves.push({ startRow: piece.row, startCol: piece.col, path: r.path, boardAfter: r.boardAfter });
        }
      }
    } else {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (colorOf(b[r][c]) !== color) continue;
          for (const m of getSimpleMoves(b, r, c)) {
            const clone = cloneBoard(b);
            const piece = clone[r][c];
            clone[r][c] = EMPTY;
            clone[m.row][m.col] = piece;
            promoteIfNeeded(clone, m.row, m.col);
            moves.push({ startRow: r, startCol: c, path: [{ row: m.row, col: m.col, captured: null }], boardAfter: clone });
          }
        }
      }
    }
    return moves;
  }

  /**
   * Эвристическая оценка позиции с точки зрения ЧЁРНЫХ (бот): положительное
   * значение — позиция выгодна чёрным, отрицательное — выгодна белым.
   * Учитывает: баланс простых шашек (±1) и дамок (±3.5), контроль
   * центральных клеток, продвижение простых шашек к дамке, и защиту
   * собственного заднего ряда (клетки, откуда соперник мог бы провести
   * дамку) — классический комплект эвристик для шашек.
   */
  function evaluateBoard(b) {
    let score = 0;

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const piece = b[row][col];
        if (piece === EMPTY) continue;

        const color = colorOf(piece);
        const sign = color === 'black' ? 1 : -1;

        // Баланс материала: простая шашка ±1, дамка ±3.5
        score += sign * (isKing(piece) ? 3.5 : 1);

        // Контроль центра доски — небольшой бонус, чем ближе к центру
        const centrality = 3.5 - (Math.abs(row - 3.5) + Math.abs(col - 3.5));
        score += sign * centrality * 0.04;

        // Продвижение простых шашек к превращению в дамку
        if (!isKing(piece)) {
          const advancement = color === 'black' ? row : (SIZE - 1 - row);
          score += sign * advancement * 0.03;
        }

        // Защита заднего ряда: свои фигуры на собственном исходном ряду
        // мешают сопернику провести туда дамку — небольшой бонус за каждую.
        if (color === 'black' && row === 0) score += 0.5;
        if (color === 'white' && row === SIZE - 1) score -= 0.5;
      }
    }

    return score;
  }

  /**
   * Минимакс с альфа-бета отсечением. Ход считается ОДНИМ узлом дерева
   * целиком (вся серия взятия — это один ход одного игрока), что
   * соответствует реальной смене хода в игре. color — чей ход в данном узле.
   */
  function minimax(b, depth, alpha, beta, color) {
    hardNodesVisited++;
    if (depth === 0 || hardNodesVisited > HARD_NODE_BUDGET) {
      return evaluateBoard(b);
    }

    const moves = generateAllTurnMoves(b, color);
    if (moves.length === 0) {
      // У игрока color нет ходов — это поражение color в реальной игре;
      // отражаем это как экстремальную (но не бесконечную) оценку.
      return color === 'black' ? -1000 + depth : 1000 - depth;
    }

    if (color === 'black') {
      let value = -Infinity;
      for (const m of moves) {
        value = Math.max(value, minimax(m.boardAfter, depth - 1, alpha, beta, 'white'));
        alpha = Math.max(alpha, value);
        if (alpha >= beta || hardNodesVisited > HARD_NODE_BUDGET) break;
      }
      return value;
    }

    let value = Infinity;
    for (const m of moves) {
      value = Math.min(value, minimax(m.boardAfter, depth - 1, alpha, beta, 'black'));
      beta = Math.min(beta, value);
      if (alpha >= beta || hardNodesVisited > HARD_NODE_BUDGET) break;
    }
    return value;
  }

  /**
   * УРОВЕНЬ "СЛОЖНЫЙ": полноценный минимакс с альфа-бета отсечением на
   * глубину HARD_MINIMAX_DEPTH ходов вперёд (ограничено бюджетом узлов
   * HARD_NODE_BUDGET, чтобы гарантированно не подвесить вкладку). Среди
   * ходов с одинаковой лучшей оценкой выбирается случайный — для
   * разнообразия партий при одинаковой силе игры.
   */
  function performHardBotMove() {
    hardNodesVisited = 0;
    const moves = generateAllTurnMoves(board, 'black');
    if (moves.length === 0) return;

    let bestScore = -Infinity;
    let bestMoves = [];
    for (const m of moves) {
      const score = minimax(m.boardAfter, HARD_MINIMAX_DEPTH - 1, -Infinity, Infinity, 'white');
      if (score > bestScore + 1e-9) {
        bestScore = score;
        bestMoves = [m];
      } else if (Math.abs(score - bestScore) < 1e-9) {
        bestMoves.push(m);
      }
    }

    const chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    selectPiece(chosen.startRow, chosen.startCol);
    for (const step of chosen.path) {
      const target = legalTargets.find(t => t.row === step.row && t.col === step.col);
      if (target) applyMove(target);
    }
  }

  /**
   * Выполняет весь ход бота (чёрных) согласно выбранному уровню сложности
   * (botDifficulty): "Лёгкий" — случайные ходы, "Средний" — жадная
   * эвристика (макс. серия взятий + безопасное продвижение), "Сложный" —
   * минимакс с альфа-бета отсечением. Серия взятий в любом случае
   * доводится до конца автоматически, без участия пользователя.
   */
  function performBotTurn() {
    if (gameOver) {
      botThinking = false;
      return;
    }

    if (botDifficulty === 'easy') {
      performEasyBotMove();
    } else if (botDifficulty === 'hard') {
      performHardBotMove();
    } else {
      performMediumBotMove();
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
      const capturedValue = board[target.captured.row][target.captured.col];
      hitCells.add(cellKey(target.captured.row, target.captured.col));
      turnHasCaptured = true;

      // Кладбище: трофей добавляется в панель ТЕКУЩЕГО игрока (мовера) —
      // currentPlayer здесь ещё не переключён на соперника.
      graveyard[currentPlayer].push({ king: isKing(capturedValue) });
      appendGraveyardPiece(currentPlayer, isKing(capturedValue));
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
    hitCellsAnimated.clear();

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
      finishGame({ type: 'win', winner: 'black', reason: 'no-pieces' });
      return;
    }
    if (blackCount === 0) {
      finishGame({ type: 'win', winner: 'white', reason: 'no-pieces' });
      return;
    }
    if (noCaptureKingsOnlyPlies >= DRAW_PLIES_LIMIT) {
      finishGame({ type: 'draw', reason: 'kings-draw' });
      return;
    }
    if (!playerHasAnyMove(board, currentPlayer)) {
      const winner = currentPlayer === 'white' ? 'black' : 'white';
      finishGame({ type: 'win', winner, reason: 'stalemate' });
      return;
    }
  }

  /** Строит текст для основной статус-строки по итогу игры (win/draw). */
  function buildResultStatusText(result) {
    if (result.type === 'draw') {
      return `Ничья! ${DRAW_PLIES_LIMIT} ходов подряд без взятия — на доске остались только дамки.`;
    }
    const winnerLabel = result.winner === 'white' ? 'Белые' : 'Чёрные';
    const loserPhrase = result.winner === 'white' ? 'у чёрных' : 'у белых';
    if (result.reason === 'no-pieces') {
      const loserSubjectCapitalized = result.winner === 'white' ? 'У чёрных' : 'У белых';
      return `${winnerLabel} победили! ${loserSubjectCapitalized} не осталось фигур.`;
    }
    return `${winnerLabel} победили! Нет доступных ходов (${loserPhrase}).`;
  }

  /**
   * Единая точка завершения партии: помечает игру завершённой, обновляет
   * основную статус-строку и открывает праздничное модальное окно
   * (вместо alert()) со статистикой и конфетти.
   */
  function finishGame(result) {
    gameOver = true;
    statusText.textContent = buildResultStatusText(result);
    openVictoryModal(result);
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
   * Добавляет миниатюрную 3D-копию срубленной фигуры в панель "кладбища"
   * соответствующего игрока. capturerColor — цвет игрока, который срубил
   * (панель, куда добавляется трофей); сама фигура — цвета СОПЕРНИКА.
   */
  function appendGraveyardPiece(capturerColor, wasKing) {
    const container = capturerColor === 'white' ? graveyardWhiteEl : graveyardBlackEl;
    if (!container) return;
    const capturedColor = capturerColor === 'white' ? 'black' : 'white';

    const el = document.createElement('div');
    el.className = `graveyard-piece piece ${capturedColor}${wasKing ? ' king' : ''} mini`;
    if (wasKing) {
      el.appendChild(buildCrownSvg());
    }
    container.appendChild(el);
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
            const key = cellKey(row, col);
            const alreadyAnimated = hitCellsAnimated.has(key);
            const canSelect = !hit && !gameOver && !botThinking && colorOf(piece) === currentPlayer &&
              !(gameMode === 'pvc' && currentPlayer === 'black') &&
              (!activeChainPiece || (activeChainPiece.row === row && activeChainPiece.col === col)) &&
              (mustCapturePieces.length === 0 || mustCapturePieces.some(p => p.row === row && p.col === col));

            const pieceEl = document.createElement('div');
            // Класс "hit" здесь НЕ добавляем сразу: если фигуру срубили только
            // что (ещё не анимировали), сперва отрисовываем её в обычном виде,
            // чтобы браузеру было от чего анимировать переход. Если она уже
            // была анимирована на прошлой отрисовке (например, в середине
            // серии взятий) — сразу рисуем в конечном (скрытом) состоянии.
            pieceEl.className = pieceCssClass(piece) + (canSelect ? '' : ' no-drag') +
              (hit && alreadyAnimated ? ' hit' : '');
            if (isKing(piece)) {
              pieceEl.appendChild(buildCrownSvg());
            }
            cell.appendChild(pieceEl);

            if (hit && !alreadyAnimated) {
              // Форсируем reflow, чтобы браузер зафиксировал "обычный" вид
              // ДО применения класса .hit — иначе CSS-переход не проиграется.
              void pieceEl.offsetWidth;
              pieceEl.classList.add('hit');
              hitCellsAnimated.add(key);
            }
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
    updatePlayerPanels();
  }

  /** Обновляет имя/статус чёрного игрока и подсветку активной панели дашборда. */
  function updatePlayerPanels() {
    if (blackPlayerNameEl) {
      blackPlayerNameEl.textContent = gameMode === 'pvc' ? 'Чёрные (Бот)' : 'Чёрные';
    }

    if (gameOver) {
      if (whiteStatusEl) whiteStatusEl.textContent = 'Игра окончена';
      if (blackStatusEl) blackStatusEl.textContent = 'Игра окончена';
      if (whitePlayerPanelEl) whitePlayerPanelEl.classList.remove('active');
      if (blackPlayerPanelEl) blackPlayerPanelEl.classList.remove('active');
      return;
    }

    const isWhiteTurn = currentPlayer === 'white';

    if (whiteStatusEl) {
      whiteStatusEl.textContent = isWhiteTurn
        ? (mustCapturePieces.length > 0 ? 'Обязан бить' : 'Ходит…')
        : 'Ожидает';
    }
    if (blackStatusEl) {
      if (isWhiteTurn) {
        blackStatusEl.textContent = 'Ожидает';
      } else if (gameMode === 'pvc') {
        blackStatusEl.textContent = botThinking ? 'Думает…' : 'Ходит…';
      } else {
        blackStatusEl.textContent = mustCapturePieces.length > 0 ? 'Обязан бить' : 'Ходит…';
      }
    }

    if (whitePlayerPanelEl) whitePlayerPanelEl.classList.toggle('active', isWhiteTurn);
    if (blackPlayerPanelEl) blackPlayerPanelEl.classList.toggle('active', !isWhiteTurn);
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
    hitCellsAnimated.clear();
    moveHistory = [];
    currentMoveSquares = [];
    pendingAnimation = null;
    graveyard = { white: [], black: [] };
    if (graveyardWhiteEl) graveyardWhiteEl.innerHTML = '';
    if (graveyardBlackEl) graveyardBlackEl.innerHTML = '';
    closeVictoryModal();
    statusText.classList.remove('shake');
    clearSelection();
    computeMustCapture();
    updateDifficultyPanelVisibility();
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

  /** Показывает панель сложности бота только в режиме "Игрок против Компьютера". */
  function updateDifficultyPanelVisibility() {
    if (difficultyPanel) {
      difficultyPanel.classList.toggle('hidden', gameMode !== 'pvc');
    }
  }

  /** Переключение уровня сложности бота — как и смена режима, сбрасывает партию. */
  function handleDifficultyChange(newDifficulty) {
    if (newDifficulty === botDifficulty) return;
    botDifficulty = newDifficulty;
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

  // ---------- Victory Modal (вместо alert()) + конфетти ----------

  let confettiAnimationId = null;

  /**
   * Открывает праздничное модальное окно по итогам партии: заголовок,
   * пояснение, статистика (число ходов, срублено каждой стороной) и запуск
   * конфетти на <canvas>. Используется вместо стандартного alert().
   */
  function openVictoryModal(result) {
    if (!victoryModalEl) return;

    if (modalTitleEl) {
      modalTitleEl.textContent = result.type === 'draw'
        ? 'Ничья!'
        : `Победа: ${result.winner === 'white' ? 'Белые' : 'Чёрные'}!`;
    }

    if (modalSubtitleEl) {
      if (result.type === 'draw') {
        modalSubtitleEl.textContent = `${DRAW_PLIES_LIMIT} ходов подряд без взятия — на доске остались только дамки.`;
      } else if (result.reason === 'no-pieces') {
        modalSubtitleEl.textContent = 'У соперника не осталось фигур на доске.';
      } else {
        modalSubtitleEl.textContent = 'У соперника не осталось доступных ходов.';
      }
    }

    if (modalMoveCountEl) modalMoveCountEl.textContent = String(moveHistory.length);
    if (modalWhiteCapturesEl) modalWhiteCapturesEl.textContent = String(graveyard.white.length);
    if (modalBlackCapturesEl) modalBlackCapturesEl.textContent = String(graveyard.black.length);

    victoryModalEl.classList.add('open');
    victoryModalEl.setAttribute('aria-hidden', 'false');
    startConfetti();
  }

  /** Закрывает модальное окно и останавливает конфетти (если оно ещё открыто). */
  function closeVictoryModal() {
    if (!victoryModalEl) return;
    victoryModalEl.classList.remove('open');
    victoryModalEl.setAttribute('aria-hidden', 'true');
    stopConfetti();
  }

  /**
   * Простая праздничная анимация конфетти на <canvas> через requestAnimationFrame.
   * Обёрнута в try/catch и проверки наличия canvas/2D-контекста, поскольку
   * это чисто декоративный эффект — его отсутствие (например, в headless-
   * окружениях без поддержки canvas) не должно ломать остальную игру.
   */
  function startConfetti() {
    try {
      if (!confettiCanvas || typeof confettiCanvas.getContext !== 'function') return;
      const ctx = confettiCanvas.getContext('2d');
      if (!ctx) return;

      stopConfetti();

      const width = window.innerWidth || 800;
      const height = window.innerHeight || 600;
      confettiCanvas.width = width;
      confettiCanvas.height = height;

      const colors = ['#e8c471', '#ff2e88', '#33e8ff', '#4ade80', '#f472b6', '#fbbf24'];
      const particles = [];
      const PARTICLE_COUNT = 130;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x: Math.random() * width,
          y: -20 - Math.random() * height * 0.5,
          w: 5 + Math.random() * 6,
          h: 8 + Math.random() * 10,
          color: colors[Math.floor(Math.random() * colors.length)],
          speedY: 2 + Math.random() * 3,
          speedX: (Math.random() - 0.5) * 2.4,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 12
        });
      }

      const raf = window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : (cb) => setTimeout(() => cb(Date.now()), 16);
      const caf = window.cancelAnimationFrame
        ? window.cancelAnimationFrame.bind(window)
        : (id) => clearTimeout(id);

      const startTime = Date.now();
      const DURATION_MS = 3200;

      const frame = () => {
        const elapsed = Date.now() - startTime;
        ctx.clearRect(0, 0, width, height);

        particles.forEach(p => {
          p.x += p.speedX;
          p.y += p.speedY;
          p.rotation += p.rotationSpeed;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        });

        if (elapsed < DURATION_MS) {
          confettiAnimationId = raf(frame);
        } else {
          ctx.clearRect(0, 0, width, height);
          confettiAnimationId = null;
        }
      };

      confettiAnimationId = raf(frame);
      // Сохраняем ссылку на caf, чтобы stopConfetti() могла её использовать
      startConfetti.__caf = caf;
    } catch (e) {
      // Конфетти — чисто декоративный эффект; ошибка здесь не должна ронять игру.
    }
  }

  /** Останавливает анимацию конфетти и очищает канвас. */
  function stopConfetti() {
    try {
      if (confettiAnimationId !== null) {
        const caf = startConfetti.__caf || (window.cancelAnimationFrame && window.cancelAnimationFrame.bind(window));
        if (caf) caf(confettiAnimationId);
        confettiAnimationId = null;
      }
      if (confettiCanvas && typeof confettiCanvas.getContext === 'function') {
        const ctx = confettiCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      }
    } catch (e) {
      // не критично
    }
  }

  restartBtn.addEventListener('click', handleRestartClick);
  modePvpRadio.addEventListener('change', () => {
    if (modePvpRadio.checked) handleModeChange('pvp');
  });
  modePvcRadio.addEventListener('change', () => {
    if (modePvcRadio.checked) handleModeChange('pvc');
  });

  if (difficultySelect) {
    difficultySelect.value = botDifficulty;
    difficultySelect.addEventListener('change', () => {
      handleDifficultyChange(difficultySelect.value);
    });
  }

  if (modalRematchBtn) {
    modalRematchBtn.addEventListener('click', () => {
      closeVictoryModal();
      restart();
    });
  }
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeVictoryModal);
  }

  // Синхронизируем выпадающий список с темой, уже применённой инлайн-скриптом
  // в <head> (из localStorage или 'wood' по умолчанию), и подписываемся на смену.
  themeSelect.value = document.documentElement.dataset.theme || 'wood';
  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value);
  });

  restart();
})();
