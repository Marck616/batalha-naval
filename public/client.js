const socket = io();

let myState = null;
let selectedShip = null;
let currentStep = 1;
let playerName = '';
let playerColor = '#4a9eff';

const SHIP_TYPES = {
  porta_avioes: {
    name: 'Porta-aviões',
    length: 6,
    svg: `
      <path d="M 1,2 L 55,2 L 59,5 L 55,8 L 1,8 Q 0,5 1,2 Z" fill="#4a5f6f" stroke="#1f2d3a" stroke-width="0.4"/>
      <rect x="2" y="3" width="55" height="4" fill="#7a8a99"/>
      <rect x="38" y="1.5" width="6" height="2.5" rx="0.4" fill="#34495e" stroke="#1a252f" stroke-width="0.2"/>
      <rect x="39.5" y="1" width="3" height="1" fill="#2c3e50"/>
      <line x1="6" y1="7" x2="42" y2="3" stroke="#ecf0f1" stroke-width="0.35" stroke-dasharray="1.5,1"/>
      <line x1="5" y1="5" x2="52" y2="5" stroke="#ecf0f1" stroke-width="0.2" stroke-dasharray="1,1"/>
      <polygon points="54,5 51,3.8 51,6.2" fill="#ecf0f1"/>
    `
  },
  couracado: {
    name: 'Couraçado',
    length: 5,
    svg: `
      <path d="M 1,3 L 45,2 L 49,5 L 45,8 L 1,7 Q 0,5 1,3 Z" fill="#4a5f6f" stroke="#1f2d3a" stroke-width="0.4"/>
      <rect x="19" y="2.5" width="12" height="5" rx="0.5" fill="#7a8a99" stroke="#34495e" stroke-width="0.2"/>
      <rect x="22" y="2" width="6" height="1" fill="#34495e"/>
      <rect x="22" y="1.7" width="2" height="1.5" fill="#2c3e50"/>
      <rect x="26" y="1.7" width="2" height="1.5" fill="#2c3e50"/>
      <rect x="38" y="3.5" width="6" height="3" rx="0.5" fill="#34495e"/>
      <circle cx="41" cy="5" r="0.9" fill="#1a252f"/>
      <rect x="43" y="4.5" width="2" height="1" fill="#1a252f"/>
      <rect x="5" y="3.5" width="6" height="3" rx="0.5" fill="#34495e"/>
      <circle cx="8" cy="5" r="0.9" fill="#1a252f"/>
      <rect x="14" y="4" width="3" height="2" rx="0.3" fill="#34495e"/>
      <rect x="33" y="4" width="3" height="2" rx="0.3" fill="#34495e"/>
    `
  },
  cruzador: {
    name: 'Cruzador',
    length: 4,
    svg: `
      <path d="M 1,3 L 35,2 L 39,5 L 35,8 L 1,7 Q 0,5 1,3 Z" fill="#4a5f6f" stroke="#1f2d3a" stroke-width="0.4"/>
      <rect x="14" y="2.8" width="10" height="4.4" rx="0.4" fill="#7a8a99" stroke="#34495e" stroke-width="0.2"/>
      <rect x="17" y="2.3" width="5" height="1" fill="#34495e"/>
      <rect x="15.5" y="2" width="1.8" height="1.3" fill="#2c3e50"/>
      <rect x="20" y="2" width="1.8" height="1.3" fill="#2c3e50"/>
      <rect x="29" y="3.8" width="4.5" height="2.4" rx="0.4" fill="#34495e"/>
      <rect x="32.5" y="4.5" width="2.5" height="1" fill="#1a252f"/>
      <rect x="5" y="3.8" width="4.5" height="2.4" rx="0.4" fill="#34495e"/>
      <circle cx="13" cy="5" r="0.6" fill="#2c3e50"/>
    `
  },
  destroyer: {
    name: 'Destroyer',
    length: 2,
    svg: `
      <path d="M 1,3 L 16,2 L 19,5 L 16,8 L 1,7 Q 0,5 1,3 Z" fill="#4a5f6f" stroke="#1f2d3a" stroke-width="0.4"/>
      <rect x="7" y="3.5" width="5" height="3" rx="0.3" fill="#7a8a99" stroke="#34495e" stroke-width="0.2"/>
      <rect x="9" y="3" width="2.5" height="0.8" fill="#34495e"/>
      <rect x="8" y="2.7" width="1.3" height="1.2" fill="#2c3e50"/>
      <rect x="14" y="4" width="3.5" height="2" rx="0.3" fill="#34495e"/>
      <rect x="16" y="4.7" width="2" height="0.6" fill="#1a252f"/>
      <rect x="2" y="4.3" width="2.5" height="1.4" rx="0.3" fill="#34495e"/>
    `
  },
  submarino: {
    name: 'Submarino',
    length: 1,
    svg: `
      <ellipse cx="5" cy="5" rx="4.5" ry="2.5" fill="#34495e" stroke="#1a252f" stroke-width="0.3"/>
      <ellipse cx="5" cy="5" rx="3.5" ry="1.5" fill="#5d6d7e"/>
      <rect x="3.8" y="3.2" width="2.4" height="3.6" rx="0.5" fill="#5d6d7e" stroke="#1a252f" stroke-width="0.2"/>
      <circle cx="5" cy="4" r="0.4" fill="#1a252f"/>
      <rect x="0.2" y="4.2" width="0.6" height="1.6" fill="#2c3e50"/>
    `
  }
};

function readBoardMetrics() {
  const styles = getComputedStyle(document.documentElement);
  const cellSize = parseFloat(styles.getPropertyValue('--cell-size')) || 28;
  return { cellSize, gap: 1, padding: 4, step: cellSize + 1 };
}

function buildShipSVG(ship) {
  const type = SHIP_TYPES[ship.type];
  if (!type) return null;

  const length = type.length;
  const { cellSize, gap, padding, step } = readBoardMetrics();
  const vertical = ship.orientation === 'v';
  const shipWidth = length * cellSize + (length - 1) * gap;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  svg.setAttribute('viewBox', vertical ? `0 0 10 ${length * 10}` : `0 0 ${length * 10} 10`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', `ship-svg${ship.destroyed ? ' destroyed' : ''}`);
  if (ship.ownerColor) {
    svg.style.filter = ship.destroyed
      ? `sepia(.65) brightness(.58) saturate(.55) drop-shadow(0 0 1.5px ${ship.ownerColor}) drop-shadow(0 0 1px ${ship.ownerColor})`
      : `drop-shadow(0 0 1px ${ship.ownerColor}) drop-shadow(0 0 1px ${ship.ownerColor})`;
  }
  svg.style.left = `${padding + ship.x * step}px`;
  svg.style.top = `${padding + ship.y * step}px`;
  svg.style.width = `${vertical ? cellSize : shipWidth}px`;
  svg.style.height = `${vertical ? shipWidth : cellSize}px`;
  svg.innerHTML = vertical
    ? `<g transform="translate(10,0) rotate(90)">${type.svg}</g>`
    : type.svg;
  return svg;
}

// ===================== SISTEMA DE ETAPAS =====================
function showStep(stepNumber) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  const step = typeof stepNumber === 'number'
    ? document.getElementById(`step-${stepNumber}`)
    : document.getElementById(stepNumber);
  if (step) {
    step.classList.add('active');
    currentStep = typeof stepNumber === 'number' ? stepNumber : currentStep;
  }
}

function goToStep2() {
  const nameInput = document.getElementById('player-name');
  playerName = nameInput.value.trim();
  
  if (!playerName) {
    showToast('Digite seu nome!');
    return;
  }
  
  playerColor = document.getElementById('player-color').value.toLowerCase();
  const usedColors = new Set((myState?.players || [])
    .filter(player => player.connected !== false)
    .map(player => String(player.color || '').toLowerCase()));
  if (usedColors.has(playerColor)) {
    showToast('Essa cor já foi escolhida por outro jogador!');
    return;
  }
  showStep(2);
}

function chooseMode(spectator) {
  if (spectator) {
    // Espectador: entra e vai para sala de espera
    socket.emit('join', { name: playerName, color: playerColor, spectator: true });
  } else {
    socket.emit('join', { name: playerName, color: playerColor, spectator: false });
  }
}

socket.on('join_ok', () => {
  showStep(4);
});

function chooseTeam(team) {
  socket.emit('choose_team', { team });
  showStep(4);
}

function goBack(step) {
  showStep(step);
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

// ===================== AÇÕES DO JOGO =====================
function wantMove(want) {
  if (want) {
    selectedShip = null;
  }
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
  if (!container) return;
  
  if (!boardData) {
    container.innerHTML = '<p style="padding:20px;text-align:center;color:#7f8c8d">Aguardando...</p>';
    return;
  }

  const cols = boardData.cols;
  const rows = boardData.rows;
  container.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;

  const ships = (boardData.ships || []).map(ship => {
    const firstCell = ship.cells && ship.cells[0];
    return {
      ...ship,
      x: firstCell ? firstCell.x : ship.x,
      y: firstCell ? firstCell.y : ship.y,
      destroyed: Boolean(ship.destroyed)
    };
  });

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

      html += `<div class="${cls}" data-x="${x}" data-y="${y}"></div>`;
    }
  }

  container.innerHTML = html;

  const shipsToDraw = isEnemy
    ? ships.filter(ship => ship.destroyed)
    : ships;
  shipsToDraw.forEach(ship => {
    const owner = (myState?.players || []).find(player => player.id === ship.owner);
    const svg = buildShipSVG({
      ...ship,
      ownerColor: isEnemy ? null : owner?.color
    });
    if (svg) container.appendChild(svg);
  });

  const { cellSize, gap, padding, step } = readBoardMetrics();
  Object.entries(shotMap).forEach(([key, result]) => {
    if (result !== 'hit') return;
    const [x, y] = key.split(',').map(Number);
    const marker = document.createElement('div');
    marker.className = 'hit-marker-overlay';
    marker.textContent = '💥';
    marker.style.left = `${padding + x * step}px`;
    marker.style.top = `${padding + y * step}px`;
    marker.style.width = `${cellSize}px`;
    marker.style.height = `${cellSize}px`;
    container.appendChild(marker);
  });

  // Cliques
  container.querySelectorAll('.cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const x = parseInt(cell.dataset.x);
      const y = parseInt(cell.dataset.y);

      if (isEnemy) {
        if (canShoot) {
          socket.emit('shoot', { x, y });
        }
      } else {
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
  if (!bar || !myState.queue) return;
  
  bar.innerHTML = myState.queue.map((q, i) => {
    const isCurrent = myState.currentPlayer === q.id;
    return `<div class="queue-item ${isCurrent ? 'current' : ''} team-${q.team}">${i + 1}. ${q.name}</div>`;
  }).join('');
}

function renderLog() {
  const panel = document.getElementById('log-panel');
  if (!panel || !myState.log) return;
  
  panel.innerHTML = myState.log.map(l => `<div>${l.msg}</div>`).join('');
  panel.scrollTop = panel.scrollHeight;
}

function renderShipList() {
  const list = document.getElementById('enemy-ships-list');
  if (!list || !myState.enemyBoard) return;
  
  let html = '<h4 style="color:#e74c3c;margin:10px 0 5px">Destruídos</h4>';
  
  if (myState.enemyBoard.ships.length === 0) {
    html += '<p style="color:#7f8c8d;font-size:0.85em">Nenhum ainda</p>';
  }
  
  myState.enemyBoard.ships.forEach(s => {
    html += `<div class="ship-item destroyed"><span>${s.type}</span><span>${s.size} blocos</span></div>`;
  });
  
  html += '<h4 style="color:#2ecc71;margin:15px 0 5px">Em campo</h4>';
  
  if (myState.enemyBoard.aliveShips.length === 0) {
    html += '<p style="color:#7f8c8d;font-size:0.85em">Todos destruídos!</p>';
  }
  
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
  if (!panel) return;
  
  const isMyTurn = myState.you && 
                   myState.currentPlayer === myState.you.id && 
                   !myState.you.spectator && 
                   myState.you.alive !== false;

  const askPanel = document.getElementById('ask-move-panel');
  const movePanel = document.getElementById('move-panel');
  const shootPanel = document.getElementById('shoot-panel');
  
  if (askPanel) askPanel.style.display = 'none';
  if (movePanel) movePanel.style.display = 'none';
  if (shootPanel) shootPanel.style.display = 'none';

  if (!isMyTurn || myState.phase !== 'playing') {
    panel.style.display = 'none';
    return;
  }

  panel.classList.remove('movement-panel', 'notification-panel');
  panel.style.display = 'flex';

  if (myState.turnPhase === 'ask_move' && askPanel) {
    askPanel.style.display = 'block';
    panel.classList.add('notification-panel');
  } else if (myState.turnPhase === 'move' && movePanel) {
    movePanel.style.display = selectedShip ? 'block' : 'none';
    document.getElementById('moves-left').textContent = myState.movesLeft;
    if (selectedShip) panel.classList.add('movement-panel');
  } else if (myState.turnPhase === 'shoot' && shootPanel) {
    shootPanel.style.display = 'block';
    document.getElementById('shots-left').textContent = myState.shotsLeft;
    panel.classList.add('notification-panel');
  }

  if (!panel.classList.contains('movement-panel') &&
      !panel.classList.contains('notification-panel')) {
    panel.style.display = 'none';
  }
}

function renderAll() {
  if (!myState) return;

  // Timer
  const timerEl = document.getElementById('timer-display');
  if (timerEl) {
    const mins = Math.floor(myState.timeLeft / 60);
    const secs = myState.timeLeft % 60;
    timerEl.textContent = `⏱️ ${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Turno
  const header = document.getElementById('game-header');
  if (header) {
    header.classList.remove('turn-blue', 'turn-red');
    if (myState.currentTeam) {
      header.classList.add(myState.currentTeam === 'blue' ? 'turn-blue' : 'turn-red');
      const teamName = myState.currentTeam === 'blue' ? '🔵 AZUL' : '🔴 VERMELHO';
      const turnEl = document.getElementById('turn-indicator');
      if (turnEl) {
        turnEl.textContent = `Vez de: ${myState.currentPlayerName} (${teamName})`;
      }
    }
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

// ===================== LOBBY =====================
function renderLobby() {
  if (!myState) return;
  
  // Painel admin
  const isAdmin = myState.you && myState.you.isAdmin;
  const adminPanel = document.getElementById('admin-panel');
  if (adminPanel) {
    adminPanel.style.display = isAdmin ? 'block' : 'none';
  }

  if (isAdmin) {
    const randomSelect = document.getElementById('cfg-random');
    const durSelect = document.getElementById('cfg-duration');
    
    if (randomSelect) randomSelect.value = myState.randomTeams ? 'true' : 'false';
    if (durSelect) {
      for (const opt of durSelect.options) {
        if (parseInt(opt.value) * 60 === myState.duration) {
          durSelect.value = opt.value;
        }
      }
    }
  }

  // Times
  const blueList = document.getElementById('team-blue-list');
  const redList = document.getElementById('team-red-list');
  
  if (blueList) {
    blueList.innerHTML = myState.teams.blue.map(name => 
      `<li><span class="color-dot" style="background:${getPlayerColor(name)}"></span>${name}</li>`
    ).join('');
  }
  
  if (redList) {
    redList.innerHTML = myState.teams.red.map(name => 
      `<li><span class="color-dot" style="background:${getPlayerColor(name)}"></span>${name}</li>`
    ).join('');
  }

  const blueButton = document.getElementById('join-blue-button');
  const redButton = document.getElementById('join-red-button');
  const myPlayer = myState.you;
  const canChooseTeam = !myState.randomTeams && myPlayer && !myPlayer.spectator;

  [blueButton, redButton].forEach(button => {
    if (!button) return;
    button.disabled = !canChooseTeam;
  });

  if (blueButton) {
    blueButton.textContent = myPlayer?.team === 'blue' ? 'Você está no Azul' : 'Entrar no Azul';
    blueButton.classList.toggle('selected-team', myPlayer?.team === 'blue');
  }
  if (redButton) {
    redButton.textContent = myPlayer?.team === 'red' ? 'Você está no Vermelho' : 'Entrar no Vermelho';
    redButton.classList.toggle('selected-team', myPlayer?.team === 'red');
  }

  // Espectadores
  const specList = document.getElementById('spectators-list');
  if (specList) {
    const specs = myState.players.filter(p => p.spectator);
    specList.innerHTML = specs.map(p => `<li>${p.name}</li>`).join('');
  }
}

function getPlayerColor(name) {
  const p = myState.players.find(p => p.name === name);
  return p ? p.color : '#95a5a6';
}

// ===================== FIM DE JOGO =====================
function renderEnd() {
  if (!myState) return;
  
  const winnerDiv = document.getElementById('end-winner');
  if (winnerDiv) {
    if (myState.winner) {
      const teamName = myState.winner === 'blue' ? '🔵 TIME AZUL' : '🔴 TIME VERMELHO';
      winnerDiv.textContent = `Vencedor: ${teamName}`;
      winnerDiv.className = myState.winner;
    } else {
      winnerDiv.textContent = '🤝 EMPATE!';
      winnerDiv.className = '';
    }
  }

  // Ranking
  const ranking = Object.entries(myState.stats || {})
    .map(([id, st]) => ({
      name: myState.players.find(p => p.id === id)?.name || '?',
      team: myState.players.find(p => p.id === id)?.team,
      shipsSunk: st.shipsSunk || 0,
      partsHit: st.partsHit || 0
    }))
    .sort((a, b) => b.shipsSunk - a.shipsSunk || b.partsHit - a.partsHit);

  const medals = ['🥇', '🥈', '🥉'];
  const list = document.getElementById('ranking-list');
  
  if (list) {
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
}

// ===================== SOCKET EVENTS =====================
socket.on('state', (state) => {
  myState = state;

  if (state.phase === 'lobby') {
    // Se ainda não escolheu nada, fica na etapa atual
    // Se já escolheu, mostra sala de espera
    if (currentStep >= 4) {
      showStep(4);
    }
    renderLobby();
  } else if (state.phase === 'playing') {
    showStep('game-screen');
    renderAll();
  } else if (state.phase === 'finished') {
    showStep('end-screen');
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

// ===================== ZOOM E PAN =====================
function setupBoardInteraction(wrapperId) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;
  
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

  // Mouse
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

// Inicializar interações dos tabuleiros
document.addEventListener('DOMContentLoaded', () => {
  setupBoardInteraction('enemy-wrapper');
  setupBoardInteraction('ally-wrapper');
  setupActionPanelDrag();
});

function setupActionPanelDrag() {
  const panel = document.getElementById('action-panel');
  const handle = panel?.querySelector('.panel-drag-handle');
  if (!panel || !handle) return;

  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragging = false;

  handle.addEventListener('pointerdown', (event) => {
    const bounds = panel.getBoundingClientRect();
    dragOffsetX = event.clientX - bounds.left;
    dragOffsetY = event.clientY - bounds.top;
    dragging = true;
    panel.style.transform = 'none';
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - panel.offsetHeight;
    const left = Math.max(0, Math.min(maxLeft, event.clientX - dragOffsetX));
    const top = Math.max(0, Math.min(maxTop, event.clientY - dragOffsetY));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  });

  handle.addEventListener('pointerup', () => {
    dragging = false;
  });

  handle.addEventListener('pointercancel', () => {
    dragging = false;
  });
}

// Zoom por teclado
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