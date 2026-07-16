/* =========================================================
   ETHOS CRONO — app.js
   Lógica del Pomodoro, Speedcubing, Audio y Estadísticas
   ========================================================= */

// --- ESTADOS Y CONFIGURACIÓN GLOBAL ---
const state = {
  mode: 'standard', // 'standard', 'speedcuber', 'custom'
  phase: 'focus',   // 'focus', 'shortBreak', 'longBreak'
  isRunning: false,
  duration: 25 * 60, // en segundos
  timeLeft: 25 * 60,
  round: 1,
  totalRounds: 4,
  
  // Ajustes por defecto
  settings: {
    focusMin: 25,
    shortMin: 5,
    longMin: 15,
    rounds: 4,
    autoStart: false,
    strictMode: false,
    alarmSound: 'bell',
    alarmVolume: 0.7,
    ambientSound: 'none',
    ambientVolume: 0.35,
    theme: 'cyberpunk',
    customBg: null
  },

  // Speedcuber State
  scramble: '',
  solves: [],
  inspectionActive: false,
  inspectionTime: 15,
  isHoldingSpace: false,
  spaceHoldTimeout: null,
  spacePressStart: null,
  isSolving: false,
  solveStart: null,
  solveInterval: null,

  // Estadísticas del día
  stats: {
    focusSessions: 0,
    focusMinutes: 0,
    breaks: 0,
    streak: 0,
    history: [] // { type: 'Foco'|'Descanso', date: '12:34', duration: '25m' }
  }
};

// --- NODOS DEL DOM ---
const nodes = {
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  statsToggleBtn: document.getElementById('statsToggleBtn'),
  sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
  statsPanel: document.getElementById('statsPanel'),
  sidebar: document.getElementById('sidebar'),
  overlay: document.getElementById('overlay'),
  
  // Timer Display
  sessionBadge: document.getElementById('sessionBadge'),
  sessionCount: document.getElementById('sessionCount'),
  inspectionWrap: document.getElementById('inspectionWrap'),
  inspectionTime: document.getElementById('inspectionTime'),
  timerRingProgress: document.getElementById('timerRingProgress'),
  timeReadout: document.getElementById('timeReadout'),
  cubeReadout: document.getElementById('cubeReadout'),
  microState: document.getElementById('microState'),
  timerPanel: document.querySelector('.timer-panel'),

  // Controles Timer
  resetBtn: document.getElementById('resetBtn'),
  startPauseBtn: document.getElementById('startPauseBtn'),
  startPauseLabel: document.getElementById('startPauseLabel'),
  skipBtn: document.getElementById('skipBtn'),

  // Speedcuber
  cubePanel: document.getElementById('cubePanel'),
  scrambleText: document.getElementById('scrambleText'),
  newScrambleBtn: document.getElementById('newScrambleBtn'),
  clearTimesBtn: document.getElementById('clearTimesBtn'),
  solveList: document.getElementById('solveList'),
  bestSolve: document.getElementById('bestSolve'),
  ao5Solve: document.getElementById('ao5Solve'),
  ao12Solve: document.getElementById('ao12Solve'),
  miniCubeNet: document.getElementById('miniCubeNet'),

  // Ajustes del DOM
  bgUploadInput: document.getElementById('bgUploadInput'),
  removeBgBtn: document.getElementById('removeBgBtn'),
  bgStatus: document.getElementById('bgStatus'),
  customFocus: document.getElementById('customFocus'),
  customShort: document.getElementById('customShort'),
  customLong: document.getElementById('customLong'),
  customRounds: document.getElementById('customRounds'),
  customAmbient: document.getElementById('customAmbient'),
  applyCustomBtn: document.getElementById('applyCustomBtn'),
  autoStartToggle: document.getElementById('autoStartToggle'),
  strictModeToggle: document.getElementById('strictModeToggle'),
  alarmSelect: document.getElementById('alarmSelect'),
  alarmVolume: document.getElementById('alarmVolume'),
  ambientSelect: document.getElementById('ambientSelect'),
  ambientVolume: document.getElementById('ambientVolume'),
  muteAllBtn: document.getElementById('muteAllBtn'),

  // Stats en pantalla
  statFocusSessions: document.getElementById('statFocusSessions'),
  statFocusMinutes: document.getElementById('statFocusMinutes'),
  statBreaks: document.getElementById('statBreaks'),
  statStreak: document.getElementById('statStreak'),
  historyList: document.getElementById('historyList'),
  resetStatsBtn: document.getElementById('resetStatsBtn')
};

// --- AUDIO SINTETIZADO (Web Audio API) ---
let audioCtx = null;
let ambientSource = null;
let ambientGainNode = null;
let isMuted = false;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Generador de Ruido Blanco / Marrón
function createNoiseBuffer(type) {
  const bufferSize = 2 * audioCtx.sampleRate;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  let lastOut = 0.0;

  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    if (type === 'brown') {
      // Filtro de Brown Noise
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5; // Compensación de volumen
    } else {
      output[i] = white;
    }
  }
  return noiseBuffer;
}

// Sintetizar lluvia
function playSynthesizedRain() {
  stopAmbient();
  initAudio();
  
  // Combinar ruido rosa/marrón con impulsos aleatorios para simular gotas
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer('brown');
  
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(800, audioCtx.currentTime);

  ambientGainNode = audioCtx.createGain();
  ambientGainNode.gain.setValueAtTime(isMuted ? 0 : state.settings.ambientVolume, audioCtx.currentTime);

  noise.connect(lowpass);
  lowpass.connect(ambientGainNode);
  ambientGainNode.connect(audioCtx.destination);
  
  noise.loop = true;
  noise.start(0);
  ambientSource = noise;
}

function startAmbient() {
  if (isMuted || state.settings.ambientSound === 'none') {
    stopAmbient();
    return;
  }
  initAudio();
  stopAmbient();

  const type = state.settings.ambientSound;
  if (type === 'rain') {
    playSynthesizedRain();
    return;
  }

  const noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = createNoiseBuffer(type);
  
  ambientGainNode = audioCtx.createGain();
  ambientGainNode.gain.setValueAtTime(state.settings.ambientVolume, audioCtx.currentTime);

  noiseNode.connect(ambientGainNode);
  ambientGainNode.connect(audioCtx.destination);
  
  noiseNode.loop = true;
  noiseNode.start(0);
  ambientSource = noiseNode;
}

function stopAmbient() {
  if (ambientSource) {
    try { ambientSource.stop(); } catch(e){}
    ambientSource = null;
  }
}

// Sintetizar Alarma
function playAlarm() {
  if (isMuted || state.settings.alarmSound === 'none') return;
  initAudio();

  const now = audioCtx.currentTime;
  const type = state.settings.alarmSound;
  const vol = state.settings.alarmVolume;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === 'bell') {
    // Campana Tibetana (Sintetizador FM Simple con decaimiento largo)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 3);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 3.5);
    
    osc.start(now);
    osc.stop(now + 4);
  } else if (type === 'synth') {
    // Pitido Synth Elegante (Arpegio rápido de ondas triangulares)
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.15); // A5
    osc.frequency.setValueAtTime(1174.66, now + 0.3); // D6
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    
    osc.start(now);
    osc.stop(now + 1);
  } else if (type === 'chime') {
    // Carillón Digital
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(987.77, now + 0.1);
    osc.frequency.setValueAtTime(1318.51, now + 0.2);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc.start(now);
    osc.stop(now + 1.5);
  }
}

// --- ALMACENAMIENTO LOCAL (LocalStorage) ---
function loadData() {
  const localSettings = localStorage.getItem('ethos_settings');
  const localStats = localStorage.getItem('ethos_stats');
  const localSolves = localStorage.getItem('ethos_solves');

  if (localSettings) {
    state.settings = { ...state.settings, ...JSON.parse(localSettings) };
  }
  if (localStats) {
    state.stats = { ...state.stats, ...JSON.parse(localStats) };
  }
  if (localSolves) {
    state.solves = JSON.parse(localSolves);
  }

  // Comprobar racha diaria
  const today = new Date().toDateString();
  const lastActive = localStorage.getItem('ethos_last_active');
  if (lastActive && lastActive !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (lastActive === yesterday.toDateString()) {
      state.stats.streak += 1;
    } else {
      state.stats.streak = 1;
    }
    localStorage.setItem('ethos_last_active', today);
  } else if (!lastActive) {
    state.stats.streak = 1;
    localStorage.setItem('ethos_last_active', today);
  }
}

function saveData() {
  localStorage.setItem('ethos_settings', JSON.stringify(state.settings));
  localStorage.setItem('ethos_stats', JSON.stringify(state.stats));
  localStorage.setItem('ethos_solves', JSON.stringify(state.solves));
}

// --- CONTROL DEL TEMPORIZADOR POMODORO ---
let timerInterval = null;

function updateTimerDisplay() {
  const m = Math.floor(state.timeLeft / 60).toString().padStart(2, '0');
  const s = (state.timeLeft % 60).toString().padStart(2, '0');
  nodes.timeReadout.textContent = `${m}:${s}`;

  // Actualizar anillo de progreso
  let totalPhaseSeconds = state.duration;
  const progress = totalPhaseSeconds > 0 ? (state.timeLeft / totalPhaseSeconds) : 0;
  const strokeDashOffset = 848.23 * (1 - progress);
  nodes.timerRingProgress.style.strokeDashoffset = strokeDashOffset;

  // Clases urgentes
  if (state.timeLeft < 30 && state.isRunning) {
    nodes.timeReadout.classList.add('is-urgent');
  } else {
    nodes.timeReadout.classList.remove('is-urgent');
  }
}

function setPhase(phase) {
  state.phase = phase;
  nodes.timerPanel.classList.remove('is-break');

  if (phase === 'focus') {
    state.duration = state.settings.focusMin * 60;
    nodes.sessionBadge.textContent = 'Enfoque';
    nodes.sessionBadge.style.background = 'var(--focus-grad)';
    nodes.microState.textContent = 'Concéntrate en tu tarea';
  } else if (phase === 'shortBreak') {
    state.duration = state.settings.shortMin * 60;
    nodes.sessionBadge.textContent = 'Descanso Corto';
    nodes.sessionBadge.style.background = 'var(--break-grad)';
    nodes.timerPanel.classList.add('is-break');
    nodes.microState.textContent = 'Estira un poco tus músculos';
  } else if (phase === 'longBreak') {
    state.duration = state.settings.longMin * 60;
    nodes.sessionBadge.textContent = 'Descanso Largo';
    nodes.sessionBadge.style.background = 'var(--break-grad)';
    nodes.timerPanel.classList.add('is-break');
    nodes.microState.textContent = 'Un buen respiro para reiniciar tu mente';
  }

  state.timeLeft = state.duration;
  updateTimerDisplay();
  updateSessionInfo();
}

function updateSessionInfo() {
  nodes.sessionCount.textContent = `Ronda ${state.round} / ${state.settings.rounds}`;
}

function startTimer() {
  if (state.isRunning) return;
  initAudio();
  state.isRunning = true;
  nodes.startPauseBtn.classList.add('ctrl-btn--active');
  nodes.startPauseLabel.textContent = 'Pausar';
  nodes.startPauseBtn.querySelector('i').setAttribute('data-lucide', 'pause');
  lucide.createIcons();

  startAmbient();

  timerInterval = setInterval(() => {
    if (state.timeLeft > 0) {
      state.timeLeft--;
      updateTimerDisplay();
    } else {
      endPhase();
    }
  }, 1000);
}

function pauseTimer() {
  if (!state.isRunning) return;
  
  if (state.settings.strictMode && state.phase === 'focus') {
    showToast('¡Modo estricto activo! No puedes pausar durante el foco.', 'shield-alert');
    return;
  }

  state.isRunning = false;
  nodes.startPauseLabel.textContent = 'Reanudar';
  nodes.startPauseBtn.querySelector('i').setAttribute('data-lucide', 'play');
  lucide.createIcons();
  clearInterval(timerInterval);
  stopAmbient();
}

function resetTimer() {
  pauseTimer();
  state.timeLeft = state.duration;
  updateTimerDisplay();
  nodes.startPauseLabel.textContent = 'Iniciar';
  nodes.microState.textContent = 'Listo para empezar';
}

function endPhase() {
  pauseTimer();
  playAlarm();

  // Registrar estadísticas en memoria
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (state.phase === 'focus') {
    state.stats.focusSessions++;
    state.stats.focusMinutes += state.settings.focusMin;
    state.stats.history.unshift({ type: 'Enfoque', time: timestamp, duration: `${state.settings.focusMin}m` });
    
    showToast('¡Gran trabajo de enfoque completado!', 'award');
    
    // Siguiente fase de descanso
    if (state.round >= state.settings.rounds) {
      state.round = 1;
      setPhase('longBreak');
    } else {
      setPhase('shortBreak');
    }
  } else {
    state.stats.breaks++;
    state.stats.history.unshift({ type: 'Descanso', time: timestamp, duration: `${state.phase === 'shortBreak' ? state.settings.shortMin : state.settings.longMin}m` });
    
    showToast('Tiempo de descanso terminado. ¡A trabajar!', 'brain');
    
    state.round++;
    setPhase('focus');
  }

  if (state.stats.history.length > 20) state.stats.history.pop();

  saveData();
  renderStats();

  if (state.settings.autoStart) {
    setTimeout(startTimer, 1000);
  }
}

// --- MODO SPEEDCUBER (WCA SOLVER) ---
const SCRAMBLE_MOVES = ["U", "D", "R", "L", "F", "B"];
const SCRAMBLE_MODIFIERS = ["", "'", "2"];

function generateScramble() {
  let scramble = [];
  let lastMove = "";
  
  for (let i = 0; i < 20; i++) {
    let move;
    do {
      move = SCRAMBLE_MOVES[Math.floor(Math.random() * SCRAMBLE_MOVES.length)];
    } while (move === lastMove);
    
    let modifier = SCRAMBLE_MODIFIERS[Math.floor(Math.random() * SCRAMBLE_MODIFIERS.length)];
    scramble.push(move + modifier);
    lastMove = move;
  }
  
  state.scramble = scramble.join(" ");
  nodes.scrambleText.textContent = state.scramble;
  drawMiniCubeNet();
}

// Dibujo decorativo y pseudo-aleatorio de una vista en 2D desplegada de Rubik
function drawMiniCubeNet() {
  const colors = ["#ffffff", "#ff5800", "#009b48", "#cc0000", "#0046ad", "#ffd500"]; // U L F R B D
  let netHtml = '';
  
  const drawFace = (x, y) => {
    let faceSvg = '';
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const randColor = colors[Math.floor(Math.random() * colors.length)];
        faceSvg += `<rect x="${x + col*10}" y="${y + row*10}" width="9" height="9" rx="1.5" fill="${randColor}" stroke="rgba(0,0,0,0.4)" stroke-width="0.8"/>`;
      }
    }
    return faceSvg;
  };

  // Coordenadas de red WCA estándar
  netHtml += drawFace(40, 5);   // UP
  netHtml += drawFace(5, 38);   // LEFT
  netHtml += drawFace(40, 38);  // FRONT
  netHtml += drawFace(75, 38);  // RIGHT
  netHtml += drawFace(110, 38); // BACK
  netHtml += drawFace(40, 71);  // DOWN

  nodes.miniCubeNet.innerHTML = netHtml;
}

function handleSpaceDown(e) {
  if (e.repeat) return;
  
  if (state.mode === 'speedcuber' && !state.isSolving) {
    e.preventDefault();
    initAudio();

    if (!state.inspectionActive) {
      // Iniciar inspección WCA
      state.inspectionActive = true;
      state.inspectionTime = 15;
      nodes.inspectionWrap.classList.remove('hidden');
      nodes.inspectionTime.textContent = state.inspectionTime;
      nodes.timeReadout.classList.add('hidden');
      
      state.spaceHoldTimeout = setInterval(() => {
        if (state.inspectionTime > 0) {
          state.inspectionTime--;
          nodes.inspectionTime.textContent = state.inspectionTime;
        } else {
          // Si pasa la inspección (DNF o arranque obligado)
          triggerInspectionFinished();
        }
      }, 1000);
    } else {
      // Si la inspección ya corre y mantenemos presionado espacio para arrancar el cronómetro
      nodes.microState.textContent = '¡Suelta para iniciar!';
      nodes.inspectionTime.style.color = 'var(--accent-1)';
    }
  } else if (state.mode === 'speedcuber' && state.isSolving) {
    // Parar el resolver inmediatamente
    stopSolving();
  }
}

function handleSpaceUp(e) {
  if (state.mode === 'speedcuber' && state.inspectionActive && !state.isSolving) {
    triggerInspectionFinished();
  }
}

function triggerInspectionFinished() {
  clearInterval(state.spaceHoldTimeout);
  nodes.inspectionWrap.classList.add('hidden');
  nodes.timeReadout.classList.remove('hidden');
  nodes.inspectionTime.style.color = '';
  state.inspectionActive = false;

  // Iniciar Cronómetro Exacto
  startSolving();
}

function startSolving() {
  state.isSolving = true;
  state.solveStart = performance.now();
  nodes.timeReadout.classList.add('hidden');
  nodes.cubeReadout.classList.remove('hidden');
  nodes.microState.textContent = 'Resolviendo...';

  state.solveInterval = setInterval(() => {
    const elapsed = (performance.now() - state.solveStart) / 1000;
    nodes.cubeReadout.textContent = elapsed.toFixed(2);
  }, 10);
}

function stopSolving() {
  clearInterval(state.solveInterval);
  state.isSolving = false;
  const finalTime = ((performance.now() - state.solveStart) / 1000).toFixed(2);
  
  nodes.cubeReadout.textContent = finalTime;
  nodes.microState.textContent = '¡Hecho!';
  
  // Registrar solve
  state.solves.unshift(parseFloat(finalTime));
  if (state.solves.length > 50) state.solves.pop();

  saveData();
  renderSolves();
  generateScramble();
}

function renderSolves() {
  nodes.solveList.innerHTML = '';
  if (state.solves.length === 0) {
    nodes.solveList.innerHTML = '<li class="solve-list__empty">Aún no hay resoluciones registradas.</li>';
    nodes.bestSolve.textContent = '—';
    nodes.ao5Solve.textContent = '—';
    nodes.ao12Solve.textContent = '—';
    return;
  }

  state.solves.forEach((solve, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>#${state.solves.length - i}</span> <strong>${solve.toFixed(2)}s</strong>`;
    nodes.solveList.appendChild(li);
  });

  // Calcular mejores marcas
  const best = Math.min(...state.solves);
  nodes.bestSolve.textContent = `${best.toFixed(2)}s`;

  // Calcular Average of 5 (Ao5) y Ao12
  nodes.ao5Solve.textContent = calculateAoN(5);
  nodes.ao12Solve.textContent = calculateAoN(12);
}

function calculateAoN(n) {
  if (state.solves.length < n) return '—';
  // Tomar las últimas N resoluciones (que están al principio de array)
  const lastN = state.solves.slice(0, n);
  const max = Math.max(...lastN);
  const min = Math.min(...lastN);
  
  // Descartar el mejor y peor tiempo (promedio WCA)
  const sum = lastN.reduce((a, b) => a + b, 0) - max - min;
  return `${(sum / (n - 2)).toFixed(2)}s`;
}

// --- SISTEMA DE ESTADÍSTICAS ---
function renderStats() {
  nodes.statFocusSessions.textContent = state.stats.focusSessions;
  nodes.statFocusMinutes.textContent = `${state.stats.focusMinutes}m`;
  nodes.statBreaks.textContent = state.stats.breaks;
  nodes.statStreak.textContent = state.stats.streak;

  nodes.historyList.innerHTML = '';
  if (state.stats.history.length === 0) {
    nodes.historyList.innerHTML = '<li class="history-list__empty">Todavía no hay sesiones registradas hoy.</li>';
    return;
  }

  state.stats.history.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `<div><strong>${item.type}</strong> <em>(${item.time})</em></div> <span>${item.duration}</span>`;
    nodes.historyList.appendChild(li);
  });
}

// --- AJUSTES Y COMPORTAMIENTO ---
function applyCustomSettings() {
  state.settings.focusMin = parseInt(nodes.customFocus.value) || 25;
  state.settings.shortMin = parseInt(nodes.customShort.value) || 5;
  state.settings.longMin = parseInt(nodes.customLong.value) || 15;
  state.settings.rounds = parseInt(nodes.customRounds.value) || 4;
  state.settings.ambientSound = nodes.customAmbient.value;

  nodes.ambientSelect.value = state.settings.ambientSound;

  saveData();
  setPhase('focus');
  showToast('Ajustes personalizados aplicados con éxito', 'check');
}

// --- TEMAS VISUALES ---
const THEMES = ['cyberpunk', 'liquid', 'matrix', 'nordic'];

function changeTheme(themeName) {
  if (!THEMES.includes(themeName)) return;
  document.body.removeAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', themeName);
  state.settings.theme = themeName;
  saveData();

  // Actualizar indicadores activos en el panel de temas
  document.querySelectorAll('.theme-swatch').forEach(btn => {
    if (btn.dataset.themeChoice === themeName) {
      btn.classList.add('is-active');
    } else {
      btn.classList.remove('is-active');
    }
  });
}

function cycleThemes() {
  const currentIndex = THEMES.indexOf(state.settings.theme);
  const nextIndex = (currentIndex + 1) % THEMES.length;
  changeTheme(THEMES[nextIndex]);
}

// Imagen de fondo de pantalla personalizada
nodes.bgUploadInput.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(event) {
      const url = event.target.result;
      document.body.style.setProperty('--custom-bg-img', `url('${url}')`);
      document.body.classList.add('has-custom-bg');
      state.settings.customBg = url;
      nodes.bgStatus.textContent = 'Fondo de pantalla activo.';
      saveData();
    };
    reader.readAsDataURL(file);
  }
});

nodes.removeBgBtn.addEventListener('click', () => {
  document.body.style.removeProperty('--custom-bg-img');
  document.body.classList.remove('has-custom-bg');
  state.settings.customBg = null;
  nodes.bgStatus.textContent = 'Sin fondo personalizado activo.';
  saveData();
});

// --- TOASTS / NOTIFICACIONES ---
function showToast(message, iconName = 'bell') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `<i data-lucide="${iconName}"></i> <span>${message}</span>`;
  lucide.createIcons();
  
  toast.classList.add('is-visible');
  setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 3500);
}

// --- INTERFAZ, TOGGLES Y EVENTOS DE INTERRUPCIÓN ---
function initEventListeners() {
  // Mode switcher
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');

      const mode = btn.dataset.mode;
      state.mode = mode;

      if (mode === 'speedcuber') {
        nodes.cubePanel.classList.remove('hidden');
        nodes.timeReadout.classList.add('hidden');
        nodes.cubeReadout.classList.remove('hidden');
        generateScramble();
        renderSolves();
      } else {
        nodes.cubePanel.classList.add('hidden');
        nodes.timeReadout.classList.remove('hidden');
        nodes.cubeReadout.classList.add('hidden');
        setPhase('focus');
      }
    });
  });

  // Toggles de paneles laterales
  const closeAllPanels = () => {
    nodes.sidebar.classList.remove('is-open', 'hidden');
    nodes.statsPanel.classList.remove('is-open', 'hidden');
    nodes.sidebar.classList.add('hidden');
    nodes.statsPanel.classList.add('hidden');
    nodes.overlay.classList.remove('is-open');
    nodes.overlay.classList.add('hidden');
  };

  const openPanel = (panel) => {
    closeAllPanels();
    panel.classList.remove('hidden');
    panel.classList.add('is-open');
    nodes.overlay.classList.remove('hidden');
    nodes.overlay.classList.add('is-open');
  };

  nodes.sidebarToggleBtn.addEventListener('click', () => {
    if (nodes.sidebar.classList.contains('is-open')) closeAllPanels();
    else openPanel(nodes.sidebar);
  });

  nodes.statsToggleBtn.addEventListener('click', () => {
    if (nodes.statsPanel.classList.contains('is-open')) closeAllPanels();
    else openPanel(nodes.statsPanel);
  });

  document.querySelectorAll('.panel-close-btn, .overlay').forEach(el => {
    el.addEventListener('click', closeAllPanels);
  });

  // Botones Pomodoro
  nodes.startPauseBtn.addEventListener('click', () => {
    if (state.isRunning) pauseTimer();
    else startTimer();
  });

  nodes.resetBtn.addEventListener('click', resetTimer);

  nodes.skipBtn.addEventListener('click', () => {
    if (confirm('¿Seguro que quieres saltar esta fase?')) {
      endPhase();
    }
  });

  // Controles de Audio y Comportamiento en Sidebar
  nodes.autoStartToggle.addEventListener('change', (e) => {
    state.settings.autoStart = e.target.checked;
    saveData();
  });

  nodes.strictModeToggle.addEventListener('change', (e) => {
    state.settings.strictMode = e.target.checked;
    saveData();
  });

  nodes.alarmSelect.addEventListener('change', (e) => {
    state.settings.alarmSound = e.target.value;
    saveData();
    playAlarm();
  });

  nodes.alarmVolume.addEventListener('input', (e) => {
    state.settings.alarmVolume = parseFloat(e.target.value) / 100;
    saveData();
  });

  nodes.ambientSelect.addEventListener('change', (e) => {
    state.settings.ambientSound = e.target.value;
    saveData();
    if (state.isRunning) startAmbient();
  });

  nodes.ambientVolume.addEventListener('input', (e) => {
    state.settings.ambientVolume = parseFloat(e.target.value) / 100;
    saveData();
    if (ambientGainNode && !isMuted) {
      ambientGainNode.gain.setValueAtTime(state.settings.ambientVolume, audioCtx.currentTime);
    }
  });

  nodes.muteAllBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    if (isMuted) {
      nodes.muteAllBtn.innerHTML = '<i data-lucide="volume"></i> Activar sonido (M)';
      stopAmbient();
    } else {
      nodes.muteAllBtn.innerHTML = '<i data-lucide="volume-x"></i> Silenciar todo (M)';
      if (state.isRunning) startAmbient();
    }
    lucide.createIcons();
  });

  // Aplicar Personalización
  nodes.applyCustomBtn.addEventListener('click', applyCustomSettings);

  // Speedcuber auxiliares
  nodes.newScrambleBtn.addEventListener('click', generateScramble);
  
  nodes.clearTimesBtn.addEventListener('click', () => {
    if (confirm('¿Quieres borrar todos tus tiempos de resolución de hoy?')) {
      state.solves = [];
      saveData();
      renderSolves();
    }
  });

  // Botón tema cíclico rápido
  nodes.themeToggleBtn.addEventListener('click', cycleThemes);

  // Selector visual de temas
  document.querySelectorAll('.theme-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      changeTheme(btn.dataset.themeChoice);
    });
  });

  // Limpiar historial de estadísticas del día
  nodes.resetStatsBtn.addEventListener('click', () => {
    if (confirm('¿Seguro que quieres borrar el historial de hoy?')) {
      state.stats.focusSessions = 0;
      state.stats.focusMinutes = 0;
      state.stats.breaks = 0;
      state.stats.history = [];
      saveData();
      renderStats();
    }
  });

  // --- SHORTCUTS DE TECLADO ---
  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement.tagName;
    if (activeEl === 'INPUT' || activeEl === 'SELECT' || activeEl === 'TEXTAREA') return;

    if (e.code === 'Space') {
      if (state.mode === 'speedcuber') {
        handleSpaceDown(e);
      } else {
        e.preventDefault();
        if (state.isRunning) pauseTimer();
        else startTimer();
      }
    }

    if (e.key === 'r' || e.key === 'R') {
      if (state.mode !== 'speedcuber') resetTimer();
    }

    if (e.key === 'm' || e.key === 'M') {
      nodes.muteAllBtn.click();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && state.mode === 'speedcuber') {
      handleSpaceUp(e);
    }
  });
}

// --- ARRANCAR APLICACIÓN ---
function init() {
  loadData();
  initEventListeners();
  
  // Sincronizar UI de Ajustes según LocalStorage
  nodes.customFocus.value = state.settings.focusMin;
  nodes.customShort.value = state.settings.shortMin;
  nodes.customLong.value = state.settings.longMin;
  nodes.customRounds.value = state.settings.rounds;
  nodes.customAmbient.value = state.settings.ambientSound;
  nodes.autoStartToggle.checked = state.settings.autoStart;
  nodes.strictModeToggle.checked = state.settings.strictMode;
  nodes.alarmSelect.value = state.settings.alarmSound;
  nodes.alarmVolume.value = state.settings.alarmVolume * 100;
  nodes.ambientSelect.value = state.settings.ambientSound;
  nodes.ambientVolume.value = state.settings.ambientVolume * 100;

  // Restaurar fondo personalizado si existiese
  if (state.settings.customBg) {
    document.body.style.setProperty('--custom-bg-img', `url('${state.settings.customBg}')`);
    document.body.classList.add('has-custom-bg');
    nodes.bgStatus.textContent = 'Fondo de pantalla activo.';
  }

  // Cargar estado inicial del temporizador
  changeTheme(state.settings.theme);
  setPhase('focus');
  renderStats();

  // Asegurar iconos renderizados
  lucide.createIcons();
}

window.addEventListener('DOMContentLoaded', init);