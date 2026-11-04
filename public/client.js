const socket = io();

let myState = null;
let selectedShip = null;
let currentScale = 1;
let panStart = null;

// ===================== ENTRADA =====================
function joinGame(spectator) {
  const name = document.getElementById('player-name').value.trim() || 'Jogador';
  const color = document.getElementById('player-color').value;
  socket.emit('join', { name, color, spectator });
}

// ===================== ADMIN =====================
function adminConfig() {
  const random = document.getElementById('cfg-random').value === 'true';
  const duration = document.getElementById('cfg-duration').value;
  socket.emit('admin_config', { randomTeams: random, duration });
}

function startGame() {
  socket.emit('start_game');
}

function chooseTeam(team) {
  socket.emit('choose_team', { team });
}

// ===================== AÇÕES =====================
function wantMove(want) {
  socket.emit('want_move', { want });
}

function moveSelected(direction) {
  if (!selectedShip) {
    showToast('Selecione um navio primeiro!');
    return;
  }
  socket.emit('move_ship', { shipId: selectedShip, direction });
}

function skipMove() {
  socket.emit('want_move', { want: false });
}

function skipShoot() {
  socket.emit('skip_shoot');
}

// ===================== UI =====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function showRules() {
  socket.emit('get_rules');
  document.getElementById('rules-modal').style.display = 'flex';
}

function hideRules() {
  document.getElementById('rules-modal').style.display = 'none';
}

socket.on('rules', (text) => {
  document.getElementById('rules-text').textContent = text;
});

function toggleShipList() {
  const modal = document.getElementById('ship-list-modal');
  modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
}

// ===================== RENDERIZAÇÃO =====================
function renderBoard(boardData, containerId, isEnemy, canShoot) {
  const container = document.getElementById(containerId);
  if (!boardData) {
    container.innerHTML = '<p style="padding:20px;text-align:center;color:#7f8c8d">Aguardando...</p>';
    return;
  }

  const cols = boardData.cols;
  const rows = boardData.rows;
  container.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;

  let html = '';
  const shotMap = {};
  if (boardData.shots) {
    boardData.shots.forEach(s => {
      shotMap[`${s.x},${s.y}`] = s.result;
    });
  }

  const shipCells = {};
  if (!isEnemy && boardData.ships) {
    boardData.ships.forEach(ship => {
      ship.cells.forEach(c => {
        const key = `${c.x},${c.y}`;
        shipCells[key] = ship;
      });
    });
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const key = `${x},${y}`;
      let cls = 'cell';
      let content = '';

      if (isEnemy) {
        const shot = shotMap[key];
        if (shot === 'hit') {
          cls += ' hit-marker';
        } else if (shot === 'miss') {
          cls += ' miss';
        } else if (canShoot) {
          cls += ' can-shoot';
        }
      } else {
        const ship = shipCells[key];
        const shot = shotMap[key];
        if (ship) {
          cls += ' ship';
          if (ship.destroyed) cls += ' destroyed';
          else if (ship.hits && ship.hits.includes(key)) cls += ' hit';
          if (selectedShip === ship.id) cls += ' selected';
        }
        if (shot === 'hit') cls += ' hit-marker';
        else if (shot === 'miss') cls += ' miss';
      }

      html += `<div class="${cls}" data-x="${x}" data-y="${y}">${content}</div>`;
    }
  }

  container.innerHTML = html;

  // cliques
  container.querySelectorAll('.cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      const x = parseInt(cell.dataset.x);
      const y = parseInt(cell.dataset.y);

      if (isEnemy) {
        if (canShoot) {
          socket.emit('shoot', { x, y });
        }
      } else {
        // selecionar navio
        const key = `${x},${y}`;
        const ship = shipCells[key];
        if (ship && !ship.destroyed) {
          selectedShip = selectedShip === ship.id ? null : ship.id;
          renderAll();
        }
      }
    });
  });
}

function renderQueue() {
  const bar = document.getElementById('queue-bar');
  if (!myState.queue) return;
  bar.innerHTML = myState.queue.map((q, i) => {
    const isCurrent = myState.currentPlayer === q.id;
    return `<div class="queue-item ${isCurrent ? 'current' : ''} team-${q.team}">${i + 1}. ${q.name}</div>`;
  }).join('');
}

function renderLog() {
  const panel = document.getElementById('log-panel');
  if (!myState.log) return;
  panel.innerHTML = myState.log.map(l => `<div>${l.msg}</div>`).join('');
  panel.scrollTop = panel.scrollHeight;
}

function renderShipList() {
  const list = document.getElementById('enemy-ships-list');
  if (!myState.enemyBoard) return;
  let html = '<h4 style="color:#e74c3c;margin:10px 0 5px">Destruídos</h4>';
  if (myState.enemyBoard.ships.length === 0) html += '<p style="color:#7f8c8d;font-size:0.85em">Nenhum ainda</p>';
  myState.enemyBoard.ships.forEach(s => {
    html += `<div class="ship-item destroyed"><span>${s.type}</span><span>${s.size} blocos</span></div>`;
  });
  html += '<h4 style="color:#2ecc71;margin:15px 0 5px">Em campo</h4>';
  if (myState.enemyBoard.aliveShips.length === 0) html += '<p style="color:#7f8c8d;font-size:0.85em">Todos destruídos!</p>';
  const grouped = {};
  myState.enemyBoard.aliveShips.forEach(s => {
    if (!grouped[s.type]) grouped[s.type] = { count: 0, size: s.size };
    grouped[s.type].count++;
  });
  Object.entries(grouped).forEach(([type, info]) => {
    html += `<div class="ship-item"><span>${info.count}x ${type}</span><span>${info.size} blocos</span></div>`;
  });
  list.innerHTML = html;
}

function renderActionPanel() {
  const panel = document.getElementById('action-panel');
  const isMyTurn = myState.you && myState.currentPlayer === myState.you.id && !myState.you.spectator && myState.you.alive !== false;

  document.getElementById('ask-move-panel').style.display = 'none';
  document.getElementById('move-panel').style.display = 'none';
  document.getElementById('shoot-panel').style.display = 'none';

  if (!isMyTurn || myState.phase !== 'playing') {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  if (myState.turnPhase === 'ask_move') {
    document.getElementById('ask-move-panel').style.display = 'block';
  } else if (myState.turnPhase === 'move') {
    document.getElementById('move-panel').style.display = 'block';
    document.getElementById('moves-left').textContent = myState.movesLeft;
  } else if (myState.turnPhase === 'shoot') {
    document.getElementById('shoot-panel').style.display = 'block';
    document.getElementById('shots-left').textContent = myState.shotsLeft;
  }
}

function renderAll() {
  if (!myState) return;

  // timer
  const mins = Math.floor(myState.timeLeft / 60);
  const secs = myState.timeLeft % 60;
  document.getElementById('timer-display').textContent = `⏱️ ${mins}:${secs.toString().padStart(2, '0')}`;

  // turno
  const header = document.getElementById('game-header');
  header.classList.remove('turn-blue', 'turn-red');
  if (myState.currentTeam) {
    header.classList.add(myState.currentTeam === 'blue' ? 'turn-blue' : 'turn-red');
    const teamName = myState.currentTeam === 'blue' ? '🔵 AZUL' : '🔴 VERMELHO';
    document.getElementById('turn-indicator').textContent = `Vez de: ${myState.currentPlayerName} (${teamName})`;
  }

  const isMyTurn = myState.you && myState.currentPlayer === myState.you.id;
  const canShoot = isMyTurn && myState.turnPhase === 'shoot' && myState.shotsLeft > 0;

  renderBoard(myState.enemyBoard, 'enemy-board', true, canShoot);
  renderBoard(myState.allyBoard, 'ally-board', false, false);
  renderQueue();
  renderLog();
  renderShipList();
  renderActionPanel();
}

// ===================== SOCKET EVENTS =====================
socket.on('state', (state) => {
  myState = state;

  if (state.phase === 'lobby') {
    showScreen('lobby-screen');
    renderLobby();
  } else if (state.phase === 'playing') {
    showScreen('game-screen');
    renderAll();
  } else if (state.phase === 'finished') {
    showScreen('end-screen');
    renderEnd();
  }
});

socket.on('log', (log) => {
  if (myState) {
    myState.log = log;
    renderLog();
  }
});

socket.on('error_msg', (msg) => {
  showToast(msg);
});

function renderLobby() {
  // admin panel
  const isAdmin = myState.you && myState.you.isAdmin;
  document.getElementById('admin-panel').style.display = isAdmin ? 'block' : 'none';

  if (isAdmin) {
    document.getElementById('cfg-random').value = myState.randomTeams ? 'true' : 'false';
    const durSelect = document.getElementById('cfg-duration');
    for (const opt of durSelect.options) {
      if (parseInt(opt.value) * 60 === myState.duration) durSelect.value = opt.value;
    }
  }

  // times
  const blueList = document.getElementById('team-blue-list');
  const redList = document.getElementById('team-red-list');
  blueList.innerHTML = myState.teams.blue.map(name => `<li><span class="color-dot" style="background:${getPlayerColor(name)}"></span>${name}</li>`).join('');
  redList.innerHTML = myState.teams.red.map(name => `<li><span class="color-dot" style="background:${getPlayerColor(name)}"></span>${name}</li>`).join('');

  // espectadores
  const specList = document.getElementById('spectators-list');
  const specs = myState.players.filter(p => p.spectator);
  specList.innerHTML = specs.map(p => `<li>${p.name}</li>`).join('');

  // botões de escolher time
  const showChoose = !myState.randomTeams && myState.you && !myState.you.spectator;
  document.getElementById('btn-join-blue').style.display = showChoose ? 'inline-block' : 'none';
  document.getElementById('btn-join-red').style.display = showChoose ? 'inline-block' : 'none';
}

function getPlayerColor(name) {
  const p = myState.players.find(p => p.name === name);
  return p ? p.color : '#95a5a6';
}

function renderEnd() {
  const winnerDiv = document.getElementById('end-winner');
  if (myState.winner) {
    const teamName = myState.winner === 'blue' ? '🔵 TIME AZUL' : '🔴 TIME VERMELHO';
    winnerDiv.textContent = `Vencedor: ${teamName}`;
    winnerDiv.className = myState.winner;
  } else {
    winnerDiv.textContent = '🤝 EMPATE!';
    winnerDiv.className = '';
  }

  // ranking
  const ranking = Object.entries(myState.stats)
    .map(([id, st]) => ({
      name: myState.players.find(p => p.id === id)?.name || '?',
      team: myState.players.find(p => p.id === id)?.team,
      shipsSunk: st.shipsSunk || 0,
      partsHit: st.partsHit || 0
    }))
    .sort((a, b) => b.shipsSunk - a.shipsSunk || b.partsHit - a.partsHit);

  const medals = ['🥇', '🥈', '🥉'];
  const list = document.getElementById('ranking-list');
  list.innerHTML = ranking.map((r, i) => {
    const medal = medals[i] || `${i + 1}º`;
    const salvo = i === 0 ? ' 👑' : i < 3 ? ' 🎖️' : '';
    return `<div class="ranking-item ${i === 0 ? 'first' : ''}">
      <span class="ranking-medal">${medal}</span>
      <div style="flex:1">
        <div style="font-weight:bold">${r.name}${salvo}</div>
        <div style="font-size:0.85em;color:#95a5a6">${r.team === 'blue' ? '🔵 Azul' : '🔴 Vermelho'}</div>
      </div>
      <div style="text-align:right">
        <div>🚢 ${r.shipsSunk.toFixed(1)}</div>
        <div style="font-size:0.8em;color:#95a5a6">${r.partsHit} acertos</div>
      </div>
    </div>`;
  }).join('');
}

// ===================== ZOOM E PAN =====================
function setupBoardInteraction(wrapperId) {
  const wrapper = document.getElementById(wrapperId);
  let scale = 1;
  let startDist = 0;
  let startX = 0, startY = 0;
  let scrollLeft = 0, scrollTop = 0;
  let isDragging = false;

  wrapper.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      startDist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
    } else if (e.touches.length === 1) {
      isDragging = true;
      startX = e.touches[0].pageX - wrapper.offsetLeft;
      startY = e.touches[0].pageY - wrapper.offsetTop;
      scrollLeft = wrapper.scrollLeft;
      scrollTop = wrapper.scrollTop;
    }
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      if (startDist > 0) {
        const newScale = scale * (dist / startDist);
        scale = Math.max(0.5, Math.min(3, newScale));
        wrapper.style.transform = `scale(${scale})`;
        wrapper.style.transformOrigin = '0 0';
      }
      startDist = dist;
    } else if (isDragging && e.touches.length === 1) {
      e.preventDefault();
      const x = e.touches[0].pageX - wrapper.offsetLeft;
      const y = e.touches[0].pageY - wrapper.offsetTop;
      wrapper.scrollLeft = scrollLeft - (x - startX);
      wrapper.scrollTop = scrollTop - (y - startY);
    }
  }, { passive: false });

  wrapper.addEventListener('touchend', () => {
    isDragging = false;
    startDist = 0;
  });

  // mouse
  wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.5, Math.min(3, scale * delta));
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = '0 0';
  }, { passive: false });

  let mouseDown = false;
  wrapper.addEventListener('mousedown', (e) => {
    mouseDown = true;
    startX = e.pageX - wrapper.offsetLeft;
    startY = e.pageY - wrapper.offsetTop;
    scrollLeft = wrapper.scrollLeft;
    scrollTop = wrapper.scrollTop;
  });

  wrapper.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    e.preventDefault();
    const x = e.pageX - wrapper.offsetLeft;
    const y = e.pageY - wrapper.offsetTop;
    wrapper.scrollLeft = scrollLeft - (x - startX);
    wrapper.scrollTop = scrollTop - (y - startY);
  });

  wrapper.addEventListener('mouseup', () => mouseDown = false);
  wrapper.addEventListener('mouseleave', () => mouseDown = false);
}

setupBoardInteraction('enemy-wrapper');
setupBoardInteraction('ally-wrapper');

// zoom por botões (acessibilidade)
let zoomLevel = 1;
function applyZoom() {
  document.querySelectorAll('.board-wrapper').forEach(w => {
    w.style.transform = `scale(${zoomLevel})`;
    w.style.transformOrigin = '0 0';
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === '+' || e.key === '=') {
    zoomLevel = Math.min(3, zoomLevel + 0.2);
    applyZoom();
  } else if (e.key === '-') {
    zoomLevel = Math.max(0.5, zoomLevel - 0.2);
    applyZoom();
  }
});
