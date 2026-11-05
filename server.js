const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// ===================== CONFIGURAÇÕES =====================
const SHIP_TYPES = {
  porta_avioes: { size: 6, move: 1, name: 'Porta-aviões' },
  couracado:    { size: 5, move: 1, name: 'Couraçado' },
  cruzador:     { size: 4, move: 1, name: 'Cruzador' },
  destroyer:    { size: 2, move: 2, name: 'Destroyer' },
  submarino:    { size: 1, move: 2, name: 'Submarino' }
};

const DURATIONS = { '10': 600, '20': 1200, '30': 1800, '45': 2700, '60': 3600 };

// ===================== ESTADO DO JOGO =====================
let gameState = {
  phase: 'lobby',           // lobby | playing | finished
  adminId: null,
  players: {},              // socketId -> player
  teams: { blue: [], red: [] },
  spectators: [],
  randomTeams: false,
  duration: 1200,
  boardSize: { cols: 10, rows: 10 },
  boards: { blue: null, red: null },   // boards[team] = { ships: [], shots: Map }
  turnQueue: [],            // fila de socketIds intercalada
  currentTurnIndex: 0,
  currentPlayer: null,
  turnPhase: null,          // 'ask_move' | 'move' | 'shoot' | 'done'
  movesLeft: 0,
  shotsLeft: 0,
  turnTimer: null,
  turnStartTime: null,
  gameTimer: null,
  gameStartTime: null,
  timeLeft: 0,
  hitBoost: {},             // socketId -> true se pode passar na frente
  hitBoostUsed: {},         // socketId -> true se já usou o boost
  log: [],
  winner: null,
  stats: {},                // socketId -> { shipsSunk: 0, partsHit: 0 }
  shipIdCounter: 0
};

// ===================== HELPERS =====================
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function getPlayer(socketId) {
  return gameState.players[socketId];
}

function getOpponentTeam(team) {
  return team === 'blue' ? 'red' : 'blue';
}

function boardDimensions(numPlayers) {
  // numPlayers = maior time
  if (numPlayers <= 1) return { cols: 10, rows: 10 };
  if (numPlayers === 2) return { cols: 10, rows: 10 };
  if (numPlayers <= 4) return { cols: 14, rows: 15 };
  // para 5+: aproximar de centenas
  const target = Math.ceil(numPlayers / 2) * 100 + 100;
  // proporção aproximada 17:18
  let best = { cols: 17, rows: 18 };
  let bestDiff = Math.abs(17 * 18 - target);
  for (let cols = 10; cols <= 40; cols++) {
    for (let rows = 10; rows <= 40; rows++) {
      const diff = Math.abs(cols * rows - target);
      const ratioDiff = Math.abs(cols / rows - 17 / 18);
      if (diff < bestDiff || (diff === bestDiff && ratioDiff < 0.05)) {
        bestDiff = diff;
        best = { cols, rows };
      }
    }
  }
  return best;
}

function createEmptyBoard() {
  return {
    ships: [],   // { id, type, owner, cells: [{x,y}], hits: Set, destroyed, orientation }
    shots: new Map(), // "x,y" -> { result: 'hit'|'miss', playerId, shipId? }
    revealed: new Set()
  };
}

function cellsOverlap(cells1, cells2) {
  const set = new Set(cells1.map(c => `${c.x},${c.y}`));
  return cells2.some(c => set.has(`${c.x},${c.y}`));
}

function isValidPlacement(board, cells, cols, rows) {
  for (const c of cells) {
    if (c.x < 0 || c.y < 0 || c.x >= cols || c.y >= rows) return false;
  }
  for (const ship of board.ships) {
    if (cellsOverlap(ship.cells, cells)) return false;
  }
  return true;
}

function placeShip(board, type, owner, cols, rows, clusterCenter) {
  const size = SHIP_TYPES[type].size;
  const horizontal = Math.random() < 0.5;
  let attempts = 0;
  while (attempts < 500) {
    attempts++;
    let x, y;
    if (clusterCenter && Math.random() < 0.7) {
      // tenta agrupar perto do centro do cluster
      x = Math.max(0, Math.min(cols - 1, clusterCenter.x + Math.floor((Math.random() - 0.5) * 8)));
      y = Math.max(0, Math.min(rows - 1, clusterCenter.y + Math.floor((Math.random() - 0.5) * 8)));
    } else {
      x = Math.floor(Math.random() * cols);
      y = Math.floor(Math.random() * rows);
    }
    const cells = [];
    for (let i = 0; i < size; i++) {
      cells.push(horizontal ? { x: x + i, y } : { x, y: y + i });
    }
    if (isValidPlacement(board, cells, cols, rows)) {
      const ship = {
        id: ++gameState.shipIdCounter,
        type,
        owner,
        cells,
        hits: new Set(),
        destroyed: false,
        orientation: horizontal ? 'h' : 'v'
      };
      board.ships.push(ship);
      return ship;
    }
  }
  // fallback: qualquer lugar válido
  for (let fx = 0; fx < cols; fx++) {
    for (let fy = 0; fy < rows; fy++) {
      const cells = [];
      for (let i = 0; i < size; i++) {
        cells.push(horizontal ? { x: fx + i, y: fy } : { x: fx, y: fy + i });
      }
      if (isValidPlacement(board, cells, cols, rows)) {
        const ship = {
          id: ++gameState.shipIdCounter,
          type,
          owner,
          cells,
          hits: new Set(),
          destroyed: false,
          orientation: horizontal ? 'h' : 'v'
        };
        board.ships.push(ship);
        return ship;
      }
    }
  }
  return null;
}

function buildFleetForPlayer(board, playerId, hasCarrier, cols, rows) {
  const clusterCenter = {
    x: Math.floor(Math.random() * cols),
    y: Math.floor(Math.random() * rows)
  };
  const fleet = [];
  if (hasCarrier) {
    const s = placeShip(board, 'porta_avioes', playerId, cols, rows, clusterCenter);
    if (s) fleet.push(s);
  }
  placeShip(board, 'couracado', playerId, cols, rows, clusterCenter);
  for (let i = 0; i < 2; i++) placeShip(board, 'cruzador', playerId, cols, rows, clusterCenter);
  for (let i = 0; i < 3; i++) placeShip(board, 'destroyer', playerId, cols, rows, clusterCenter);
  for (let i = 0; i < 3; i++) placeShip(board, 'submarino', playerId, cols, rows, clusterCenter);
  return fleet;
}

function countTeamShips(team) {
  const board = gameState.boards[team];
  if (!board) return 0;
  return board.ships.filter(s => !s.destroyed).length;
}

function addLog(msg) {
  gameState.log.push({ time: Date.now(), msg });
  if (gameState.log.length > 100) gameState.log.shift();
  io.emit('log', gameState.log.slice(-20));
}

// ===================== VISÃO DO CLIENTE =====================
function getClientView(socketId) {
  const player = getPlayer(socketId);
  const isSpec = !player || player.spectator;
  const myTeam = player ? player.team : null;

  const view = {
    phase: gameState.phase,
    you: player ? {
      id: socketId,
      name: player.name,
      team: player.team,
      color: player.color,
      spectator: player.spectator,
      isAdmin: socketId === gameState.adminId,
      alive: player.alive
    } : null,
    players: Object.values(gameState.players).map(p => ({
      id: p.id, name: p.name, team: p.team, color: p.color,
      spectator: p.spectator, alive: p.alive,
      isAdmin: p.id === gameState.adminId
    })),
    teams: {
      blue: gameState.teams.blue.map(id => gameState.players[id]?.name),
      red: gameState.teams.red.map(id => gameState.players[id]?.name)
    },
    randomTeams: gameState.randomTeams,
    duration: gameState.duration,
    boardSize: gameState.boardSize,
    currentPlayer: gameState.currentPlayer,
    currentPlayerName: gameState.currentPlayer ? gameState.players[gameState.currentPlayer]?.name : null,
    currentTeam: gameState.currentPlayer ? gameState.players[gameState.currentPlayer]?.team : null,
    turnPhase: gameState.turnPhase,
    movesLeft: gameState.movesLeft,
    shotsLeft: gameState.shotsLeft,
    timeLeft: gameState.timeLeft,
    queue: gameState.turnQueue.map(id => ({
      id, name: gameState.players[id]?.name, team: gameState.players[id]?.team
    })),
    winner: gameState.winner,
    stats: gameState.stats,
    log: gameState.log.slice(-20)
  };

  if (gameState.phase === 'playing' || gameState.phase === 'finished') {
    // campo inimigo: só revela onde já houve tiro
    const enemyTeam = myTeam ? getOpponentTeam(myTeam) : null;
    const enemyBoard = enemyTeam ? gameState.boards[enemyTeam] : null;

    view.enemyBoard = enemyBoard ? {
      cols: gameState.boardSize.cols,
      rows: gameState.boardSize.rows,
      shots: Array.from(enemyBoard.shots.entries()).map(([key, val]) => {
        const [x, y] = key.split(',').map(Number);
        return { x, y, result: val.result, playerName: gameState.players[val.playerId]?.name || '?' };
      }),
      ships: isSpec ? [] : enemyBoard.ships.filter(s => s.destroyed).map(s => ({
        type: s.type, size: SHIP_TYPES[s.type].size, owner: gameState.players[s.owner]?.name,
        cells: s.cells, orientation: s.orientation, destroyed: true
      })),
      aliveShips: isSpec ? [] : enemyBoard.ships.filter(s => !s.destroyed).map(s => ({
        type: s.type, size: SHIP_TYPES[s.type].size
      }))
    } : null;

    // campo aliado: mostra tudo para o time
    const allyBoard = myTeam ? gameState.boards[myTeam] : null;
    view.allyBoard = allyBoard ? {
      cols: gameState.boardSize.cols,
      rows: gameState.boardSize.rows,
      ships: isSpec ? [] : allyBoard.ships.map(s => ({
        id: s.id, type: s.type, owner: gameState.players[s.owner]?.name,
        cells: s.cells, hits: Array.from(s.hits), destroyed: s.destroyed,
        orientation: s.orientation, size: SHIP_TYPES[s.type].size
      })),
      shots: Array.from(allyBoard.shots.entries()).map(([key, val]) => {
        const [x, y] = key.split(',').map(Number);
        return { x, y, result: val.result };
      })
    } : null;
  }

  return view;
}

function broadcast() {
  for (const socketId of Object.keys(gameState.players)) {
    io.to(socketId).emit('state', getClientView(socketId));
  }
  for (const socketId of gameState.spectators) {
    io.to(socketId).emit('state', getClientView(socketId));
  }
}

// ===================== LÓGICA DE TURNO =====================
function buildQueue() {
  const blue = gameState.teams.blue.filter(id => gameState.players[id]?.alive);
  const red = gameState.teams.red.filter(id => gameState.players[id]?.alive);
  const queue = [];
  const max = Math.max(blue.length, red.length);
  for (let i = 0; i < max; i++) {
    if (blue[i]) queue.push(blue[i]);
    if (red[i]) queue.push(red[i]);
  }
  gameState.turnQueue = queue;
}

function nextTurn() {
  clearTimeout(gameState.turnTimer);
  if (gameState.phase !== 'playing') return;

  // verifica fim de jogo
  const blueShips = countTeamShips('blue');
  const redShips = countTeamShips('red');
  if (blueShips === 0 || redShips === 0) {
    endGame(blueShips === 0 ? 'red' : 'blue');
    return;
  }

  // remove jogadores mortos da fila
  gameState.turnQueue = gameState.turnQueue.filter(id => gameState.players[id]?.alive);

  if (gameState.turnQueue.length === 0) {
    endGame(null);
    return;
  }

  gameState.currentTurnIndex = (gameState.currentTurnIndex + 1) % gameState.turnQueue.length;
  const pid = gameState.turnQueue[gameState.currentTurnIndex];
  gameState.currentPlayer = pid;
  gameState.turnPhase = 'ask_move';
  gameState.movesLeft = 0;
  gameState.shotsLeft = 0;
  gameState.turnStartTime = Date.now();

  const p = gameState.players[pid];
  addLog(`Vez de ${p.name} (${p.team === 'blue' ? 'Azul' : 'Vermelho'})`);

  // 20 segundos para começar a agir
  gameState.turnTimer = setTimeout(() => {
    addLog(`${p.name} não agiu e foi para o fim da fila.`);
    // manda para o fim da fila
    gameState.turnQueue = gameState.turnQueue.filter(id => id !== pid);
    gameState.turnQueue.push(pid);
    nextTurn();
  }, 20000);

  broadcast();
}

function startTurnAction() {
  clearTimeout(gameState.turnTimer);
  const pid = gameState.currentPlayer;
  const p = gameState.players[pid];
  gameState.turnPhase = 'move';
  gameState.movesLeft = 2;
  gameState.shotsLeft = 3;
  addLog(`${p.name} começou a agir.`);
  // 1:30 para finalizar
  gameState.turnTimer = setTimeout(() => {
    addLog(`Tempo esgotado para ${p.name}.`);
    gameState.turnPhase = 'done';
    nextTurn();
  }, 90000);
  broadcast();
}

function applyHitBoost(hitPlayerId) {
  // Se o jogador atingido ainda não usou o boost, ele passa na frente
  if (!gameState.hitBoostUsed[hitPlayerId] && gameState.players[hitPlayerId]?.alive) {
    gameState.hitBoost[hitPlayerId] = true;
    gameState.hitBoostUsed[hitPlayerId] = true;
    // remove da posição atual e coloca na frente do próximo do mesmo time
    const team = gameState.players[hitPlayerId].team;
    const queue = gameState.turnQueue;
    const idx = queue.indexOf(hitPlayerId);
    if (idx !== -1) {
      queue.splice(idx, 1);
      // encontra o próximo da fila do mesmo time depois da posição atual
      const currentIdx = queue.indexOf(gameState.currentPlayer);
      let insertIdx = currentIdx + 1;
      for (let i = currentIdx + 1; i < queue.length; i++) {
        if (gameState.players[queue[i]]?.team === team) {
          insertIdx = i;
          break;
        }
        insertIdx = i + 1;
      }
      queue.splice(insertIdx, 0, hitPlayerId);
      addLog(`${gameState.players[hitPlayerId].name} passou na frente da fila para se defender!`);
    }
  }
}

function processShot(shooterId, x, y) {
  const shooter = getPlayer(shooterId);
  if (!shooter || shooter.spectator || !shooter.alive) return { error: 'Você não pode atirar.' };
  if (gameState.currentPlayer !== shooterId) return { error: 'Não é sua vez.' };
  if (gameState.turnPhase !== 'shoot') return { error: 'Agora não é hora de atirar.' };
  if (gameState.shotsLeft <= 0) return { error: 'Sem disparos restantes.' };

  const enemyTeam = getOpponentTeam(shooter.team);
  const board = gameState.boards[enemyTeam];
  const key = `${x},${y}`;

  if (x < 0 || y < 0 || x >= gameState.boardSize.cols || y >= gameState.boardSize.rows) {
    return { error: 'Fora do mapa.' };
  }

  gameState.shotsLeft--;

  if (board.shots.has(key)) {
    // já tinha tiro aqui
    const existing = board.shots.get(key);
    addLog(`${shooter.name} atirou em (${x},${y}) — já havia sido atingido. ${existing.result === 'hit' ? 'Parte revelada novamente.' : 'Errou.'}`);
    broadcast();
    return { ok: true, result: existing.result, already: true };
  }

  // verifica se acertou algum navio
  let hitShip = null;
  for (const ship of board.ships) {
    if (ship.destroyed) continue;
    if (ship.cells.some(c => c.x === x && c.y === y)) {
      hitShip = ship;
      break;
    }
  }

  if (hitShip) {
    hitShip.hits.add(key);
    board.shots.set(key, { result: 'hit', playerId: shooterId, shipId: hitShip.id });
    // estatísticas
    if (!gameState.stats[shooterId]) gameState.stats[shooterId] = { shipsSunk: 0, partsHit: 0, partialHits: {} };
    gameState.stats[shooterId].partsHit++;
    if (!gameState.stats[shooterId].partialHits[hitShip.id]) gameState.stats[shooterId].partialHits[hitShip.id] = 0;
    gameState.stats[shooterId].partialHits[hitShip.id]++;

    const ownerName = gameState.players[hitShip.owner]?.name || '?';
    addLog(`${shooter.name} ACERTOU em (${x},${y})! Navio de ${ownerName} atingido!`);

    // boost de fila
    applyHitBoost(hitShip.owner);

    // verifica destruição
    if (hitShip.hits.size >= hitShip.cells.length) {
      hitShip.destroyed = true;
      addLog(`🚢 NAVIO DESTRUÍDO! ${shooter.name} destruiu um ${SHIP_TYPES[hitShip.type].name} de ${ownerName}!`);
      // crédito de destruição
      creditShipDestruction(hitShip, enemyTeam);
      // verifica se o dono perdeu todos
      const ownerBoard = gameState.boards[enemyTeam];
      const ownerShips = ownerBoard.ships.filter(s => s.owner === hitShip.owner && !s.destroyed);
      if (ownerShips.length === 0) {
        gameState.players[hitShip.owner].alive = false;
        addLog(`💀 ${ownerName} perdeu todos os navios e está fora!`);
        buildQueue();
      }
    }
  } else {
    board.shots.set(key, { result: 'miss', playerId: shooterId });
    addLog(`${shooter.name} errou em (${x},${y}).`);
  }

  if (gameState.shotsLeft <= 0) {
    gameState.turnPhase = 'done';
    setTimeout(nextTurn, 1500);
  }

  broadcast();
  return { ok: true, result: hitShip ? 'hit' : 'miss' };
}

function creditShipDestruction(ship, enemyTeam) {
  // quem acertou mais partes leva o crédito
  const board = gameState.boards[enemyTeam];
  const hitCounts = {};
  for (const [key, val] of board.shots.entries()) {
    if (val.shipId === ship.id && val.result === 'hit') {
      hitCounts[val.playerId] = (hitCounts[val.playerId] || 0) + 1;
    }
  }
  let max = 0;
  let winners = [];
  for (const [pid, count] of Object.entries(hitCounts)) {
    if (count > max) { max = count; winners = [pid]; }
    else if (count === max) { winners.push(pid); }
  }
  for (const pid of winners) {
    if (!gameState.stats[pid]) gameState.stats[pid] = { shipsSunk: 0, partsHit: 0, partialHits: {} };
    gameState.stats[pid].shipsSunk += 1 / winners.length;
  }
}

function processMove(playerId, shipId, direction) {
  const player = getPlayer(playerId);
  if (!player || player.spectator || !player.alive) return { error: 'Você não pode mover.' };
  if (gameState.currentPlayer !== playerId) return { error: 'Não é sua vez.' };
  if (gameState.turnPhase !== 'move') return { error: 'Não é fase de movimentação.' };
  if (gameState.movesLeft <= 0) return { error: 'Sem movimentos restantes.' };

  const board = gameState.boards[player.team];
  const ship = board.ships.find(s => s.id === shipId && s.owner === playerId);
  if (!ship) return { error: 'Navio não encontrado.' };
  if (ship.destroyed) return { error: 'Navio destruído.' };

  const moveDist = SHIP_TYPES[ship.type].move;
  const dx = direction === 'left' ? -moveDist : direction === 'right' ? moveDist : 0;
  const dy = direction === 'up' ? -moveDist : direction === 'down' ? moveDist : 0;

  const newCells = ship.cells.map(c => ({ x: c.x + dx, y: c.y + dy }));

  // limites
  for (const c of newCells) {
    if (c.x < 0 || c.y < 0 || c.x >= gameState.boardSize.cols || c.y >= gameState.boardSize.rows) {
      return { error: 'Fora dos limites do mapa.' };
    }
  }

  // colisão com outros navios
  for (const other of board.ships) {
    if (other.id === ship.id || other.destroyed) continue;
    if (cellsOverlap(other.cells, newCells)) return { error: 'Colisão com outro navio.' };
  }

  // não pode atravessar posições com disparos (exceto as que o próprio navio ocupa)
  const currentKeys = new Set(ship.cells.map(c => `${c.x},${c.y}`));
  for (const c of newCells) {
    const key = `${c.x},${c.y}`;
    if (board.shots.has(key) && !currentKeys.has(key)) {
      return { error: 'Não pode atravessar área bombardeada.' };
    }
  }

  ship.cells = newCells;
  gameState.movesLeft--;
  addLog(`${player.name} moveu um ${SHIP_TYPES[ship.type].name}.`);

  if (gameState.movesLeft <= 0) {
    gameState.turnPhase = 'shoot';
  }

  broadcast();
  return { ok: true };
}

// ===================== FIM DE JOGO =====================
function computeRanking() {
  const ranking = [];
  for (const [pid, st] of Object.entries(gameState.stats)) {
    const p = gameState.players[pid];
    if (!p) continue;
    ranking.push({
      id: pid, name: p.name, team: p.team,
      shipsSunk: st.shipsSunk,
      partsHit: st.partsHit
    });
  }
  ranking.sort((a, b) => b.shipsSunk - a.shipsSunk || b.partsHit - a.partsHit);
  return ranking;
}

function endGame(winnerTeam) {
  clearTimeout(gameState.turnTimer);
  clearInterval(gameState.gameTimer);
  gameState.phase = 'finished';
  gameState.winner = winnerTeam;
  gameState.ranking = computeRanking();
  addLog(winnerTeam ? `🏆 Fim de jogo! Time ${winnerTeam === 'blue' ? 'Azul' : 'Vermelho'} venceu!` : '🏆 Fim de jogo! Empate!');
  broadcast();
}

// ===================== SOCKET.IO =====================
io.on('connection', (socket) => {
  const pid = socket.id;

  socket.on('join', ({ name, color, spectator }) => {
    if (gameState.players[pid]) return;
    const isAdmin = !gameState.adminId;
    if (isAdmin) gameState.adminId = pid;

    gameState.players[pid] = {
      id: pid,
      name: name || `Jogador ${Object.keys(gameState.players).length + 1}`,
      color: color || '#4a9eff',
      team: null,
      spectator: !!spectator,
      alive: true
    };

    if (spectator) {
      gameState.spectators.push(pid);
    } else if (gameState.randomTeams && gameState.phase === 'lobby') {
      // distribui aleatoriamente
      const blueCount = gameState.teams.blue.length;
      const redCount = gameState.teams.red.length;
      const team = blueCount <= redCount ? 'blue' : 'red';
      gameState.players[pid].team = team;
      gameState.teams[team].push(pid);
    }

    if (!gameState.stats[pid]) gameState.stats[pid] = { shipsSunk: 0, partsHit: 0, partialHits: {} };

    broadcast();
  });

  socket.on('choose_team', ({ team }) => {
    const p = getPlayer(pid);
    if (!p || p.spectator || gameState.phase !== 'lobby') return;
    if (gameState.randomTeams) return;
    // remove de times anteriores
    gameState.teams.blue = gameState.teams.blue.filter(id => id !== pid);
    gameState.teams.red = gameState.teams.red.filter(id => id !== pid);
    if (team === 'blue' || team === 'red') {
      gameState.teams[team].push(pid);
      p.team = team;
    } else {
      p.team = null;
      if (!gameState.spectators.includes(pid)) gameState.spectators.push(pid);
      p.spectator = true;
    }
    broadcast();
  });

  socket.on('admin_config', ({ randomTeams, duration }) => {
    if (pid !== gameState.adminId || gameState.phase !== 'lobby') return;
    gameState.randomTeams = !!randomTeams;
    if (DURATIONS[duration]) gameState.duration = DURATIONS[duration];
    broadcast();
  });

  socket.on('start_game', () => {
    if (pid !== gameState.adminId || gameState.phase !== 'lobby') return;

    // separa jogadores de espectadores
    const players = Object.values(gameState.players).filter(p => !p.spectator);
    if (players.length < 2) {
      socket.emit('error_msg', 'É preciso pelo menos 2 jogadores.');
      return;
    }

    // se aleatório, distribui
    if (gameState.randomTeams) {
      gameState.teams.blue = [];
      gameState.teams.red = [];
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      shuffled.forEach((p, i) => {
        const team = i % 2 === 0 ? 'blue' : 'red';
        p.team = team;
        gameState.teams[team].push(p.id);
      });
    }

    // garante que todos têm time
    for (const p of players) {
      if (!p.team) {
        const team = gameState.teams.blue.length <= gameState.teams.red.length ? 'blue' : 'red';
        p.team = team;
        gameState.teams[team].push(p.id);
      }
    }

    const maxPlayers = Math.max(gameState.teams.blue.length, gameState.teams.red.length);
    gameState.boardSize = boardDimensions(maxPlayers);
    const { cols, rows } = gameState.boardSize;

    gameState.boards.blue = createEmptyBoard();
    gameState.boards.red = createEmptyBoard();

    // porta-aviões: 1 em cada 5 partidas em média
    const hasCarrier = Math.random() < 0.2;

    // frotas base
    for (const team of ['blue', 'red']) {
      const board = gameState.boards[team];
      for (const pid2 of gameState.teams[team]) {
        buildFleetForPlayer(board, pid2, false, cols, rows);
      }
    }

    // balanceamento: time menor recebe embarcações extras
    const blueCount = gameState.teams.blue.length;
    const redCount = gameState.teams.red.length;
    if (blueCount !== redCount) {
      const smallerTeam = blueCount < redCount ? 'blue' : 'red';
      const biggerTeam = blueCount < redCount ? 'red' : 'blue';
      const diff = Math.abs(blueCount - redCount) * 9; // embarcações extras aproximadas
      const extraTypes = ['cruzador', 'destroyer', 'destroyer', 'submarino', 'submarino', 'couracado', 'cruzador', 'destroyer', 'submarino'];
      const board = gameState.boards[smallerTeam];
      const smallerPlayers = gameState.teams[smallerTeam];
      for (let i = 0; i < diff && i < extraTypes.length; i++) {
        const owner = smallerPlayers[Math.floor(Math.random() * smallerPlayers.length)];
        placeShip(board, extraTypes[i], owner, cols, rows);
      }
    }

    // distribui porta-aviões se aparecer
    if (hasCarrier) {
      for (const team of ['blue', 'red']) {
        const board = gameState.boards[team];
        const owners = gameState.teams[team];
        const owner = owners[Math.floor(Math.random() * owners.length)];
        placeShip(board, 'porta_avioes', owner, cols, rows);
      }
      addLog('🛩️ Porta-aviões em campo nesta partida!');
    }

    // fase de jogo
    gameState.phase = 'playing';
    gameState.timeLeft = gameState.duration;
    gameState.gameStartTime = Date.now();

    buildQueue();
    gameState.currentTurnIndex = -1;

    gameState.gameTimer = setInterval(() => {
      gameState.timeLeft--;
      if (gameState.timeLeft <= 0) {
        // fim por tempo: vence quem tem mais navios
        const bs = countTeamShips('blue');
        const rs = countTeamShips('red');
        endGame(bs === rs ? null : (bs > rs ? 'blue' : 'red'));
      } else if (gameState.timeLeft % 10 === 0) {
        broadcast();
      }
    }, 1000);

    addLog('⚓ A batalha começou!');
    nextTurn();
  });

  // ---- ações do jogador ----
  socket.on('want_move', ({ want }) => {
    if (pid !== gameState.currentPlayer) return;
    if (gameState.turnPhase !== 'ask_move') return;
    clearTimeout(gameState.turnTimer);
    if (want) {
      startTurnAction();
    } else {
      gameState.turnPhase = 'shoot';
      gameState.shotsLeft = 3;
      gameState.movesLeft = 0;
      // reinicia timer de 1:30
      gameState.turnTimer = setTimeout(() => {
        addLog(`Tempo esgotado.`);
        nextTurn();
      }, 90000);
      broadcast();
    }
  });

  socket.on('move_ship', ({ shipId, direction }) => {
    const res = processMove(pid, shipId, direction);
    if (res.error) socket.emit('error_msg', res.error);
  });

  socket.on('shoot', ({ x, y }) => {
    const res = processShot(pid, x, y);
    if (res.error) socket.emit('error_msg', res.error);
  });

  socket.on('skip_shoot', () => {
    if (pid !== gameState.currentPlayer) return;
    if (gameState.turnPhase !== 'shoot') return;
    addLog(`${gameState.players[pid].name} pulou os disparos.`);
    gameState.turnPhase = 'done';
    nextTurn();
  });

  socket.on('get_rules', () => {
    socket.emit('rules', RULES_TEXT);
  });

  socket.on('disconnect', () => {
    const p = getPlayer(pid);
    if (!p) return;
    addLog(`${p.name} saiu. Navios removidos.`);
    // remove navios do jogador
    if (p.team && gameState.boards[p.team]) {
      gameState.boards[p.team].ships = gameState.boards[p.team].ships.filter(s => s.owner !== pid);
    }
    // remove de times e fila
    gameState.teams.blue = gameState.teams.blue.filter(id => id !== pid);
    gameState.teams.red = gameState.teams.red.filter(id => id !== pid);
    gameState.turnQueue = gameState.turnQueue.filter(id => id !== pid);
    gameState.spectators = gameState.spectators.filter(id => id !== pid);
    delete gameState.players[pid];

    // se o ADM saiu, transfere
    if (gameState.adminId === pid) {
      const remaining = Object.keys(gameState.players);
      gameState.adminId = remaining[0] || null;
    }

    // se não há mais jogadores, encerra
    const remainingPlayers = Object.values(gameState.players).filter(pl => !pl.spectator);
    if (remainingPlayers.length === 0) {
      clearTimeout(gameState.turnTimer);
      clearInterval(gameState.gameTimer);
      gameState.phase = 'lobby';
      gameState.boards = { blue: null, red: null };
      gameState.turnQueue = [];
      gameState.currentPlayer = null;
      gameState.log = [];
      gameState.winner = null;
      gameState.stats = {};
      addLog('Todos abandonaram. Jogo encerrado.');
    } else if (gameState.phase === 'playing') {
      buildQueue();
      if (gameState.turnQueue.length === 0) {
        endGame(null);
      } else {
        broadcast();
      }
    } else {
      broadcast();
    }
  });
});

const RULES_TEXT = `
REGRAS DA BATALHA NAVAL EM TIMES

🎯 OBJETIVO
Destrua todos os navios do time inimigo ou tenha mais navios quando o tempo acabar.

⚓ EMBARCAÇÕES
• Porta-aviões: 6 blocos (move 1)
• Couraçado: 5 blocos (move 1)
• Cruzador: 4 blocos (move 1)
• Destroyer: 2 blocos (move 2)
• Submarino: 1 bloco (move 2)

🎮 SUA VEZ
1. Você tem 20s para começar a agir
2. Escolha se quer mover navios (até 2) ou ir direto para os disparos
3. Você tem 3 disparos (sempre 3, acerte ou erre)
4. Tem 1:30min para terminar tudo

🚢 MOVIMENTAÇÃO
• Navios não podem girar, só mover nas 4 direções
• Não pode sair do mapa, colidir com outros navios ou atravessar áreas bombardeadas
• Navio só é destruído quando TODOS os blocos forem atingidos
• Se mover para área não bombardeada, volta a ficar oculto

🔫 DISPAROS
• Acertou ou errou: sempre 3 disparos
• O jogo informa se acertou e qual jogador foi atingido
• Não mostra o tipo nem a orientação do navio atingido

⏱️ FILA
• Turnos intercalados: Azul, Vermelho, Azul, Vermelho...
• Se seu navio for atingido, você passa na frente da fila para se defender
• Se não agir em 20s, vai para o fim da fila

🏆 FIM DE JOGO
• Vitória: destruir todos os navios inimigos ou ter mais navios no tempo
• Ranking por navios afundados (quem acertou mais partes leva o crédito)
`;

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`⚓ Batalha Naval Times rodando na porta ${PORT}`);
});
