/* =========================================================
   ETHOS CRONO — app.js
   Lógica completa: modos, timer, WCA speedcuber, audio síntesis,
   persistencia en localStorage y atajos de teclado.
   ========================================================= */

(function () {
  "use strict";

  /* ===================== CONSTANTES ===================== */

  const STORAGE_KEYS = {
    HISTORY: "ethosCrono.history",
    SETTINGS: "ethosCrono.settings",
    SOLVES: "ethosCrono.solves",
  };

  const MODE_PRESETS = {
    standard: { focus: 25, short: 5, long: 15, rounds: 4, label: "Estándar 25/5" },
    developer: { focus: 50, short: 10, long: 20, rounds: 3, label: "Programador 50/10" },
    speedcuber: { focus: 25, short: 5, long: 15, rounds: 4, label: "Speedcuber WCA" },
    custom: { focus: 25, short: 5, long: 15, rounds: 4, label: "Personalizado" },
  };

  const RING_CIRCUMFERENCE = 2 * Math.PI * 135; // r=135

  /* ===================== ESTADO ===================== */

  const state = {
    mode: "standard",
    phase: "focus", // focus | short | long
    round: 1,
    totalSeconds: MODE_PRESETS.standard.focus * 60,
    remainingSeconds: MODE_PRESETS.standard.focus * 60,
    isRunning: false,
    tickHandle: null,
    startTimestamp: null, // ms epoch when current run segment started
    accumulatedAtStart: 0, // seconds already elapsed before this run segment

    settings: {
      theme: "cyberpunk",
      autoStart: false,
      strictMode: false,
      alarmSound: "bell",
      alarmVolume: 70,
      ambientSound: "none",
      ambientVolume: 35,
      muted: false,
      custom: { focus: 25, short: 5, long: 15, rounds: 4 },
    },

    // Speedcuber
    cube: {
      inInspection: false,
      inspectionRemaining: 15,
      inspectionHandle: null,
      solving: false,
      solveStart: null,
      solveHandle: null,
      currentScramble: "",
      solves: [], // {time, scramble, date}
    },
  };

  /* ===================== DOM REFS ===================== */

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const el = {
    body: document.body,
    modeButtons: $$(".mode-btn"),
    sessionBadge: $("#sessionBadge"),
    sessionCount: $("#sessionCount"),
    timeReadout: $("#timeReadout"),
    cubeReadout: $("#cubeReadout"),
    microState: $("#microState"),
    timerPanel: $(".timer-panel"),
    ringProgress: $("#timerRingProgress"),
    startPauseBtn: $("#startPauseBtn"),
    startPauseLabel: $("#startPauseLabel"),
    resetBtn: $("#resetBtn"),
    skipBtn: $("#skipBtn"),

    inspectionWrap: $("#inspectionWrap"),
    inspectionTime: $("#inspectionTime"),

    cubePanel: $("#cubePanel"),
    scrambleText: $("#scrambleText"),
    newScrambleBtn: $("#newScrambleBtn"),
    solveList: $("#solveList"),
    clearTimesBtn: $("#clearTimesBtn"),
    bestSolve: $("#bestSolve"),
    ao5Solve: $("#ao5Solve"),
    ao12Solve: $("#ao12Solve"),

    statsPanel: $("#statsPanel"),
    sidebar: $("#sidebar"),
    overlay: $("#overlay"),
    statsToggleBtn: $("#statsToggleBtn"),
    sidebarToggleBtn: $("#sidebarToggleBtn"),
    themeToggleBtn: $("#themeToggleBtn"),

    statFocusSessions: $("#statFocusSessions"),
    statFocusMinutes: $("#statFocusMinutes"),
    statBreaks: $("#statBreaks"),
    statStreak: $("#statStreak"),
    historyList: $("#historyList"),
    resetStatsBtn: $("#resetStatsBtn"),

    themeSwatches: $$(".theme-swatch"),
    customFocus: $("#customFocus"),
    customShort: $("#customShort"),
    customLong: $("#customLong"),
    customRounds: $("#customRounds"),
    applyCustomBtn: $("#applyCustomBtn"),
    autoStartToggle: $("#autoStartToggle"),
    strictModeToggle: $("#strictModeToggle"),

    alarmSelect: $("#alarmSelect"),
    alarmVolume: $("#alarmVolume"),
    ambientSelect: $("#ambientSelect"),
    ambientVolume: $("#ambientVolume"),
    muteAllBtn: $("#muteAllBtn"),
  };

  el.ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

  /* ===================== UTILIDADES ===================== */

  function formatMMSS(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function formatSolveTime(ms) {
    const totalCentis = Math.round(ms / 10);
    const minutes = Math.floor(totalCentis / 6000);
    const seconds = Math.floor((totalCentis % 6000) / 100);
    const centis = totalCentis % 100;
    if (minutes > 0) {
      return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
    }
    return `${seconds}.${String(centis).padStart(2, "0")}`;
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function showToast(message, icon = "info") {
    let toast = $(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.innerHTML = `<i data-lucide="${icon}"></i><span></span>`;
      document.body.appendChild(toast);
    }
    toast.querySelector("span").textContent = message;
    if (window.lucide) window.lucide.createIcons();
    toast.classList.add("is-visible");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* almacenamiento no disponible: se ignora silenciosamente */
    }
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /* ===================== AUDIO ENGINE (Web Audio API) ===================== */

  const AudioEngine = (function () {
    let ctx = null;
    let ambientNodes = null; // { source, gain, filter? }
    let rainAudioEl = null;

    function getCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    function clamp01(v) {
      return Math.max(0, Math.min(1, v));
    }

    /* ---- Alarmas sintetizadas ---- */

    function playBell() {
      if (state.settings.muted || state.settings.alarmSound === "none") return;
      const c = getCtx();
      const now = c.currentTime;
      const master = c.createGain();
      master.gain.value = clamp01(state.settings.alarmVolume / 100) * 0.5;
      master.connect(c.destination);

      // Campana tibetana: suma de parciales inarmónicos con decaimiento largo
      const partials = [1, 2.01, 3.03, 4.2, 5.4];
      partials.forEach((mult, i) => {
        const osc = c.createOscillator();
        osc.type = "sine";
        osc.frequency.value = 220 * mult;
        const g = c.createGain();
        const peak = 0.9 / (i + 1);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(peak, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0008, now + 3.2 + i * 0.15);
        osc.connect(g);
        g.connect(master);
        osc.start(now);
        osc.stop(now + 3.6 + i * 0.15);
      });
    }

    function playSynth() {
      if (state.settings.muted || state.settings.alarmSound === "none") return;
      const c = getCtx();
      const now = c.currentTime;
      const master = c.createGain();
      master.gain.value = clamp01(state.settings.alarmVolume / 100) * 0.6;
      master.connect(c.destination);

      const notes = [880, 1108.73, 1318.51]; // A5, C#6, E6 — arpegio elegante
      notes.forEach((freq, i) => {
        const start = now + i * 0.11;
        const osc = c.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const g = c.createGain();
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.8, start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
        osc.connect(g);
        g.connect(master);
        osc.start(start);
        osc.stop(start + 0.6);
      });
    }

    function playChime() {
      if (state.settings.muted || state.settings.alarmSound === "none") return;
      const c = getCtx();
      const now = c.currentTime;
      const master = c.createGain();
      master.gain.value = clamp01(state.settings.alarmVolume / 100) * 0.55;
      master.connect(c.destination);

      const notes = [1318.51, 1567.98, 2093.0, 1760.0]; // carillón digital
      notes.forEach((freq, i) => {
        const start = now + i * 0.16;
        const osc = c.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const filter = c.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 300;
        const g = c.createGain();
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(0.7, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, start + 1.1);
        osc.connect(filter);
        filter.connect(g);
        g.connect(master);
        osc.start(start);
        osc.stop(start + 1.2);
      });
    }

    function playAlarm() {
      switch (state.settings.alarmSound) {
        case "bell":
          playBell();
          break;
        case "synth":
          playSynth();
          break;
        case "chime":
          playChime();
          break;
        default:
          break;
      }
    }

    /* ---- Ruido de fondo sintetizado ---- */

    function makeNoiseBuffer(kind) {
      const c = getCtx();
      const bufferSize = 2 * c.sampleRate;
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);

      if (kind === "white") {
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      } else if (kind === "brown") {
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          lastOut = (lastOut + 0.02 * white) / 1.02;
          data[i] = lastOut * 3.5; // compensar la pérdida de amplitud
        }
      }
      return buffer;
    }

    function stopAmbient() {
      if (ambientNodes) {
        try {
          ambientNodes.source.stop();
        } catch (e) {
          /* ya detenido */
        }
        ambientNodes = null;
      }
      if (rainAudioEl) {
        rainAudioEl.pause();
        rainAudioEl = null;
      }
    }

    function startAmbient(kind) {
      stopAmbient();
      if (kind === "none" || state.settings.muted) return;

      if (kind === "rain") {
        // Streaming público estable de sonido ambiente de lluvia
        rainAudioEl = new Audio(
          "https://cdn.pixabay.com/audio/2022/03/10/audio_c8e70c5f42.mp3"
        );
        rainAudioEl.loop = true;
        rainAudioEl.volume = clamp01(state.settings.ambientVolume / 100);
        rainAudioEl.crossOrigin = "anonymous";
        rainAudioEl.play().catch(() => {
          // Si el streaming falla (bloqueo de red/CORS), recurrimos a
          // ruido marrón sintetizado como sustituto de la lluvia.
          startAmbient("brown");
          showToast("No se pudo cargar la lluvia en streaming, usando síntesis local", "cloud-rain");
        });
        return;
      }

      const c = getCtx();
      const buffer = makeNoiseBuffer(kind);
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = c.createGain();
      gain.gain.value = clamp01(state.settings.ambientVolume / 100) * 0.5;

      let filter = null;
      if (kind === "white") {
        filter = c.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 6000;
        source.connect(filter);
        filter.connect(gain);
      } else {
        source.connect(gain);
      }
      gain.connect(c.destination);
      source.start();

      ambientNodes = { source, gain, filter };
    }

    function setAmbientVolume(v) {
      const vol = clamp01(v / 100);
      if (ambientNodes) ambientNodes.gain.gain.value = vol * 0.5;
      if (rainAudioEl) rainAudioEl.volume = vol;
    }

    function refreshAmbient() {
      startAmbient(state.settings.ambientSound);
    }

    function muteAll(muted) {
      if (ambientNodes) ambientNodes.gain.gain.value = muted ? 0 : clamp01(state.settings.ambientVolume / 100) * 0.5;
      if (rainAudioEl) rainAudioEl.volume = muted ? 0 : clamp01(state.settings.ambientVolume / 100);
    }

    // Pequeño tick táctil-sonoro opcional para el cronómetro speedcuber (WCA start)
    function playCubeStartBeep() {
      if (state.settings.muted) return;
      const c = getCtx();
      const now = c.currentTime;
      const osc = c.createOscillator();
      osc.type = "square";
      osc.frequency.value = 1200;
      const g = c.createGain();
      g.gain.setValueAtTime(0.15, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    }

    return {
      playAlarm,
      startAmbient,
      stopAmbient,
      setAmbientVolume,
      refreshAmbient,
      muteAll,
      playCubeStartBeep,
      unlock: getCtx,
    };
  })();

  /* ===================== TIMER PRINCIPAL (Pomodoro) ===================== */

  function activePreset() {
    if (state.mode === "custom") return state.settings.custom;
    const p = MODE_PRESETS[state.mode];
    return { focus: p.focus, short: p.short, long: p.long, rounds: p.rounds };
  }

  function phaseDurationSeconds(phase) {
    const preset = activePreset();
    if (phase === "focus") return preset.focus * 60;
    if (phase === "short") return preset.short * 60;
    return preset.long * 60;
  }

  function phaseLabel(phase) {
    if (phase === "focus") return state.mode === "speedcuber" ? "Sesión de cubo" : "Enfoque";
    if (phase === "short") return "Descanso corto";
    return "Descanso largo";
  }

  function updateRing() {
    const progress = state.totalSeconds > 0 ? state.remainingSeconds / state.totalSeconds : 0;
    const offset = RING_CIRCUMFERENCE * (1 - progress);
    el.ringProgress.style.strokeDashoffset = String(offset);
  }

  function renderTimer() {
    el.timeReadout.textContent = formatMMSS(state.remainingSeconds);
    el.sessionBadge.textContent = phaseLabel(state.phase);
    const preset = activePreset();
    el.sessionCount.textContent = `Sesión ${state.round} / ${preset.rounds}`;
    el.timerPanel.classList.toggle("is-break", state.phase !== "focus");
    updateRing();

    const urgent = state.remainingSeconds <= 10 && state.remainingSeconds > 0 && state.isRunning;
    el.timeReadout.classList.toggle("is-urgent", urgent);

    el.microState.textContent = state.isRunning
      ? "En marcha…"
      : state.remainingSeconds === state.totalSeconds
      ? "Listo para empezar"
      : "En pausa";
  }

  function glitchPulse() {
    el.timeReadout.classList.remove("is-glitch");
    // forzar reflow para reiniciar animación
    void el.timeReadout.offsetWidth;
    el.timeReadout.classList.add("is-glitch");
  }

  function setPhase(phase, { silent = false } = {}) {
    state.phase = phase;
    state.totalSeconds = phaseDurationSeconds(phase);
    state.remainingSeconds = state.totalSeconds;
    if (!silent) glitchPulse();
    renderTimer();
  }

  function tick() {
    if (!state.isRunning) return;
    const elapsedTotal = (Date.now() - state.startTimestamp) / 1000 + state.accumulatedAtStart;
    const remaining = Math.max(0, state.totalSeconds - elapsedTotal);
    state.remainingSeconds = remaining;
    renderTimer();

    if (remaining <= 0) {
      completePhase();
    }
  }

  function startTimerLoop() {
    if (state.tickHandle) clearInterval(state.tickHandle);
    state.tickHandle = setInterval(tick, 200);
  }

  function stopTimerLoop() {
    if (state.tickHandle) {
      clearInterval(state.tickHandle);
      state.tickHandle = null;
    }
  }

  function startTimer() {
    if (state.isRunning) return;
    if (state.mode === "speedcuber" && state.phase === "focus") {
      // En modo speedcuber, "iniciar" arranca la sesión de práctica de cubo,
      // el flujo de inspección/cronómetro lo gestiona el módulo Cube.
    }
    AudioEngine.unlock();
    state.isRunning = true;
    state.startTimestamp = Date.now();
    startTimerLoop();
    el.startPauseLabel.textContent = "Pausar";
    el.startPauseBtn.querySelector("i").setAttribute("data-lucide", "pause");
    if (window.lucide) window.lucide.createIcons();
    renderTimer();
  }

  function pauseTimer() {
    if (!state.isRunning) return;
    if (state.mode === "speedcuber" && state.phase === "focus" && state.settings.strictMode) {
      showToast("Modo estricto activo: no se puede pausar el enfoque", "lock");
      return;
    }
    if (state.phase === "focus" && state.settings.strictMode) {
      showToast("Modo estricto activo: no se puede pausar el enfoque", "lock");
      return;
    }
    state.isRunning = false;
    state.accumulatedAtStart += (Date.now() - state.startTimestamp) / 1000;
    stopTimerLoop();
    el.startPauseLabel.textContent = "Reanudar";
    el.startPauseBtn.querySelector("i").setAttribute("data-lucide", "play");
    if (window.lucide) window.lucide.createIcons();
    renderTimer();
  }

  function toggleTimer() {
    if (state.isRunning) pauseTimer();
    else startTimer();
  }

  function resetTimer() {
    state.isRunning = false;
    stopTimerLoop();
    state.accumulatedAtStart = 0;
    state.remainingSeconds = state.totalSeconds;
    el.startPauseLabel.textContent = "Iniciar";
    el.startPauseBtn.querySelector("i").setAttribute("data-lucide", "play");
    if (window.lucide) window.lucide.createIcons();
    renderTimer();
    showToast("Temporizador reiniciado", "rotate-ccw");
  }

  function logSession(phase, seconds) {
    const history = loadJSON(STORAGE_KEYS.HISTORY, {});
    const key = todayKey();
    if (!history[key]) {
      history[key] = { focusSessions: 0, focusSeconds: 0, breaks: 0, entries: [] };
    }
    const day = history[key];
    if (phase === "focus") {
      day.focusSessions += 1;
      day.focusSeconds += seconds;
    } else {
      day.breaks += 1;
    }
    day.entries.unshift({
      phase,
      seconds,
      mode: state.mode,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
    day.entries = day.entries.slice(0, 30);
    saveJSON(STORAGE_KEYS.HISTORY, history);
    renderStats();
  }

  function completePhase() {
    state.isRunning = false;
    stopTimerLoop();
    AudioEngine.playAlarm();
    logSession(state.phase, state.totalSeconds);

    const preset = activePreset();

    if (state.phase === "focus") {
      const isLastRound = state.round >= preset.rounds;
      setPhase(isLastRound ? "long" : "short");
      if (isLastRound) state.round = 1;
      showToast(isLastRound ? "¡Ciclo completo! Descanso largo" : "¡Enfoque completado! Descanso corto", "check-circle-2");
    } else {
      if (state.phase === "short") state.round += 1;
      setPhase("focus");
      showToast("Descanso terminado. ¡A por otra sesión!", "zap");
    }

    el.startPauseLabel.textContent = "Iniciar";
    el.startPauseBtn.querySelector("i").setAttribute("data-lucide", "play");
    if (window.lucide) window.lucide.createIcons();

    if (state.settings.autoStart) {
      setTimeout(() => startTimer(), 900);
    }
  }

  function skipPhase() {
    const preset = activePreset();
    if (state.phase === "focus") {
      const isLastRound = state.round >= preset.rounds;
      state.isRunning = false;
      stopTimerLoop();
      setPhase(isLastRound ? "long" : "short");
      if (isLastRound) state.round = 1;
    } else {
      if (state.phase === "short") state.round += 1;
      state.isRunning = false;
      stopTimerLoop();
      setPhase("focus");
    }
    el.startPauseLabel.textContent = "Iniciar";
    el.startPauseBtn.querySelector("i").setAttribute("data-lucide", "play");
    if (window.lucide) window.lucide.createIcons();
    showToast("Fase saltada", "skip-forward");
  }

  /* ===================== MODOS ===================== */

  function applyModeUI(mode) {
    el.modeButtons.forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });

    const isCuber = mode === "speedcuber";
    el.cubePanel.classList.toggle("hidden", !isCuber);
    el.cubeReadout.classList.toggle("hidden", true); // se muestra solo durante resolución activa
    el.timeReadout.classList.toggle("hidden", false);
  }

  function switchMode(mode) {
    Cube.exitAll();
    state.mode = mode;
    state.round = 1;
    applyModeUI(mode);
    setPhase("focus", { silent: true });
    glitchPulse();
    resetTimer();

    if (mode === "speedcuber") {
      Cube.newScramble();
    }
  }

  /* ===================== MÓDULO SPEEDCUBER (WCA) ===================== */

  const CUBE_MOVES = ["R", "L", "U", "D", "F", "B"];
  const CUBE_MODIFIERS = ["", "'", "2"];

  const Cube = (function () {
    function generateScramble(length = 20) {
      const seq = [];
      let lastAxis = "";
      const axisOf = (m) => (["R", "L"].includes(m) ? "x" : ["U", "D"].includes(m) ? "y" : "z");

      for (let i = 0; i < length; i++) {
        let move;
        let axis;
        do {
          move = CUBE_MOVES[Math.floor(Math.random() * CUBE_MOVES.length)];
          axis = axisOf(move);
        } while (axis === lastAxis);
        lastAxis = axis;
        const mod = CUBE_MODIFIERS[Math.floor(Math.random() * CUBE_MODIFIERS.length)];
        seq.push(move + mod);
      }
      return seq.join(" ");
    }

    function newScramble() {
      state.cube.currentScramble = generateScramble();
      el.scrambleText.textContent = state.cube.currentScramble;
    }

    function startInspection() {
      if (state.mode !== "speedcuber") return;
      if (state.cube.inInspection || state.cube.solving) return;

      state.cube.inInspection = true;
      state.cube.inspectionRemaining = 15;
      el.inspectionWrap.classList.remove("hidden");
      el.inspectionTime.textContent = "15";
      el.microState.textContent = "Inspeccionando…";

      state.cube.inspectionHandle = setInterval(() => {
        state.cube.inspectionRemaining -= 1;
        el.inspectionTime.textContent = String(Math.max(0, state.cube.inspectionRemaining));
        if (state.cube.inspectionRemaining <= 0) {
          clearInterval(state.cube.inspectionHandle);
          state.cube.inspectionHandle = null;
          // Penalización WCA +2 implícita si no se ha iniciado el solve a tiempo;
          // aquí simplemente arrancamos el solve automáticamente.
          startSolve(true);
        }
      }, 1000);
    }

    function cancelInspection() {
      if (state.cube.inspectionHandle) clearInterval(state.cube.inspectionHandle);
      state.cube.inspectionHandle = null;
      state.cube.inInspection = false;
      el.inspectionWrap.classList.add("hidden");
    }

    function startSolve(overtime = false) {
      cancelInspection();
      state.cube.solving = true;
      state.cube.solveStart = performance.now();
      el.cubeReadout.classList.remove("hidden");
      el.timeReadout.classList.add("hidden");
      el.microState.textContent = overtime ? "¡Tiempo de inspección agotado! Resolviendo…" : "Resolviendo…";
      AudioEngine.playCubeStartBeep();

      state.cube.solveHandle = requestAnimationFrame(updateSolveDisplay);
    }

    function updateSolveDisplay() {
      if (!state.cube.solving) return;
      const elapsed = performance.now() - state.cube.solveStart;
      el.cubeReadout.textContent = formatSolveTime(elapsed);
      state.cube.solveHandle = requestAnimationFrame(updateSolveDisplay);
    }

    function stopSolve() {
      if (!state.cube.solving) return;
      cancelAnimationFrame(state.cube.solveHandle);
      const elapsed = performance.now() - state.cube.solveStart;
      state.cube.solving = false;
      el.timeReadout.classList.remove("hidden");
      el.cubeReadout.textContent = formatSolveTime(elapsed);

      recordSolve(elapsed);
      newScramble();

      setTimeout(() => {
        el.cubeReadout.classList.add("hidden");
        el.microState.textContent = "Pulsa Espacio para inspeccionar de nuevo";
      }, 1400);
    }

    function recordSolve(ms) {
      const entry = { time: ms, scramble: state.cube.currentScramble, date: Date.now() };
      state.cube.solves.unshift(entry);
      state.cube.solves = state.cube.solves.slice(0, 200);
      saveJSON(STORAGE_KEYS.SOLVES, state.cube.solves);
      renderSolves();
    }

    function average(list) {
      if (list.length === 0) return null;
      const sum = list.reduce((a, b) => a + b, 0);
      return sum / list.length;
    }

    function trimmedAverage(times, count) {
      if (times.length < count) return null;
      const slice = times.slice(0, count).slice().sort((a, b) => a - b);
      const trimmed = slice.slice(1, slice.length - 1);
      return average(trimmed);
    }

    function renderSolves() {
      const times = state.cube.solves.map((s) => s.time);
      if (state.cube.solves.length === 0) {
        el.solveList.innerHTML = '<li class="solve-list__empty">Aún no hay resoluciones registradas.</li>';
      } else {
        el.solveList.innerHTML = state.cube.solves
          .slice(0, 12)
          .map((s, i) => {
            const num = state.cube.solves.length - i;
            return `<li><span>#${num}</span><strong>${formatSolveTime(s.time)}</strong></li>`;
          })
          .join("");
      }

      const best = times.length ? Math.min(...times) : null;
      el.bestSolve.textContent = best !== null ? formatSolveTime(best) : "—";

      const ao5 = trimmedAverage(times, 5);
      el.ao5Solve.textContent = ao5 !== null ? formatSolveTime(ao5) : "—";

      const ao12 = trimmedAverage(times, 12);
      el.ao12Solve.textContent = ao12 !== null ? formatSolveTime(ao12) : "—";
    }

    function clearSolves() {
      state.cube.solves = [];
      saveJSON(STORAGE_KEYS.SOLVES, []);
      renderSolves();
      showToast("Tiempos de speedcuber borrados", "trash-2");
    }

    function handleSpacebar() {
      if (state.mode !== "speedcuber") return false;
      if (state.cube.solving) {
        stopSolve();
      } else if (state.cube.inInspection) {
        startSolve(false);
      } else {
        startInspection();
      }
      return true;
    }

    function exitAll() {
      cancelInspection();
      if (state.cube.solving) {
        cancelAnimationFrame(state.cube.solveHandle);
        state.cube.solving = false;
      }
      el.cubeReadout.classList.add("hidden");
      el.timeReadout.classList.remove("hidden");
    }

    function init() {
      state.cube.solves = loadJSON(STORAGE_KEYS.SOLVES, []);
      renderSolves();
      newScramble();
    }

    return {
      newScramble,
      handleSpacebar,
      clearSolves,
      exitAll,
      init,
    };
  })();

  /* ===================== ESTADÍSTICAS ===================== */

  function computeStreak(history) {
    let streak = 0;
    const cursor = new Date();
    for (let i = 0; i < 365; i++) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
      if (history[key] && history[key].focusSessions > 0) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else if (i === 0) {
        // hoy sin sesiones todavía no rompe la racha de días anteriores
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function renderStats() {
    const history = loadJSON(STORAGE_KEYS.HISTORY, {});
    const key = todayKey();
    const day = history[key] || { focusSessions: 0, focusSeconds: 0, breaks: 0, entries: [] };

    el.statFocusSessions.textContent = String(day.focusSessions);
    el.statFocusMinutes.textContent = `${Math.round(day.focusSeconds / 60)}m`;
    el.statBreaks.textContent = String(day.breaks);
    el.statStreak.textContent = String(computeStreak(history));

    if (day.entries.length === 0) {
      el.historyList.innerHTML = '<li class="history-list__empty">Todavía no hay sesiones registradas hoy.</li>';
    } else {
      el.historyList.innerHTML = day.entries
        .map((entry) => {
          const tagClass = entry.phase === "focus" ? "tag-focus" : "tag-break";
          const label = entry.phase === "focus" ? "Enfoque" : entry.phase === "short" ? "Descanso corto" : "Descanso largo";
          const mins = Math.round(entry.seconds / 60);
          return `<li><span class="${tagClass}">${label}</span><em>${mins}m · ${entry.time}</em></li>`;
        })
        .join("");
    }
  }

  function resetTodayStats() {
    const history = loadJSON(STORAGE_KEYS.HISTORY, {});
    delete history[todayKey()];
    saveJSON(STORAGE_KEYS.HISTORY, history);
    renderStats();
    showToast("Historial de hoy borrado", "eraser");
  }

  /* ===================== PANELES / UI ===================== */

  function openPanel(panelEl) {
    closeAllPanels();
    panelEl.classList.remove("hidden");
    panelEl.classList.add("is-open");
    el.overlay.classList.remove("hidden");
    el.overlay.classList.add("is-open");
  }

  function closeAllPanels() {
    [el.statsPanel, el.sidebar].forEach((p) => {
      p.classList.remove("is-open");
      if (window.innerWidth < 979) p.classList.add("hidden");
    });
    el.overlay.classList.remove("is-open");
    el.overlay.classList.add("hidden");
  }

  function togglePanel(panelEl) {
    const isOpen = panelEl.classList.contains("is-open");
    if (isOpen) closeAllPanels();
    else openPanel(panelEl);
  }

  /* ===================== TEMA ===================== */

  function applyTheme(theme) {
    state.settings.theme = theme;
    el.body.dataset.theme = theme;
    el.themeSwatches.forEach((sw) => sw.classList.toggle("is-active", sw.dataset.themeChoice === theme));
    persistSettings();
  }

  function toggleTheme() {
    applyTheme(state.settings.theme === "cyberpunk" ? "liquid" : "cyberpunk");
    showToast(`Tema: ${state.settings.theme === "cyberpunk" ? "Cyberpunk" : "Liquid Glass"}`, "palette");
  }

  /* ===================== AJUSTES / PERSISTENCIA ===================== */

  function persistSettings() {
    saveJSON(STORAGE_KEYS.SETTINGS, state.settings);
  }

  function loadSettings() {
    const saved = loadJSON(STORAGE_KEYS.SETTINGS, null);
    if (saved) {
      state.settings = Object.assign({}, state.settings, saved);
      state.settings.custom = Object.assign({}, state.settings.custom, saved.custom || {});
    }
  }

  function applySettingsToUI() {
    applyTheme(state.settings.theme);
    el.autoStartToggle.checked = state.settings.autoStart;
    el.strictModeToggle.checked = state.settings.strictMode;
    el.alarmSelect.value = state.settings.alarmSound;
    el.alarmVolume.value = String(state.settings.alarmVolume);
    el.ambientSelect.value = state.settings.ambientSound;
    el.ambientVolume.value = String(state.settings.ambientVolume);
    el.customFocus.value = String(state.settings.custom.focus);
    el.customShort.value = String(state.settings.custom.short);
    el.customLong.value = String(state.settings.custom.long);
    el.customRounds.value = String(state.settings.custom.rounds);
  }

  /* ===================== EVENTOS ===================== */

  function bindEvents() {
    el.modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => switchMode(btn.dataset.mode));
    });

    el.startPauseBtn.addEventListener("click", () => {
      if (state.mode === "speedcuber") {
        Cube.handleSpacebar();
      } else {
        toggleTimer();
      }
    });
    el.resetBtn.addEventListener("click", resetTimer);
    el.skipBtn.addEventListener("click", skipPhase);

    el.newScrambleBtn.addEventListener("click", () => Cube.newScramble());
    el.clearTimesBtn.addEventListener("click", () => Cube.clearSolves());

    el.statsToggleBtn.addEventListener("click", () => togglePanel(el.statsPanel));
    el.sidebarToggleBtn.addEventListener("click", () => togglePanel(el.sidebar));
    el.themeToggleBtn.addEventListener("click", toggleTheme);
    el.overlay.addEventListener("click", closeAllPanels);

    $$("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeAllPanels());
    });

    el.themeSwatches.forEach((sw) => {
      sw.addEventListener("click", () => applyTheme(sw.dataset.themeChoice));
    });

    el.applyCustomBtn.addEventListener("click", () => {
      state.settings.custom = {
        focus: clampInt(el.customFocus.value, 1, 180, 25),
        short: clampInt(el.customShort.value, 1, 60, 5),
        long: clampInt(el.customLong.value, 1, 90, 15),
        rounds: clampInt(el.customRounds.value, 1, 12, 4),
      };
      persistSettings();
      switchMode("custom");
      showToast("Configuración personalizada aplicada", "check");
    });

    el.autoStartToggle.addEventListener("change", () => {
      state.settings.autoStart = el.autoStartToggle.checked;
      persistSettings();
    });
    el.strictModeToggle.addEventListener("change", () => {
      state.settings.strictMode = el.strictModeToggle.checked;
      persistSettings();
    });

    el.alarmSelect.addEventListener("change", () => {
      state.settings.alarmSound = el.alarmSelect.value;
      persistSettings();
    });
    el.alarmVolume.addEventListener("input", () => {
      state.settings.alarmVolume = Number(el.alarmVolume.value);
      persistSettings();
    });

    el.ambientSelect.addEventListener("change", () => {
      state.settings.ambientSound = el.ambientSelect.value;
      persistSettings();
      AudioEngine.refreshAmbient();
    });
    el.ambientVolume.addEventListener("input", () => {
      state.settings.ambientVolume = Number(el.ambientVolume.value);
      AudioEngine.setAmbientVolume(state.settings.ambientVolume);
      persistSettings();
    });

    el.muteAllBtn.addEventListener("click", toggleMute);
    el.resetStatsBtn.addEventListener("click", resetTodayStats);

    document.addEventListener("keydown", handleKeydown);

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 979) {
        el.statsPanel.classList.remove("is-open");
        el.sidebar.classList.remove("is-open");
        el.overlay.classList.add("hidden");
      }
    });
  }

  function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function toggleMute() {
    state.settings.muted = !state.settings.muted;
    AudioEngine.muteAll(state.settings.muted);
    persistSettings();
    showToast(state.settings.muted ? "Audio silenciado" : "Audio activado", state.settings.muted ? "volume-x" : "volume-2");
  }

  function handleKeydown(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    const isTyping = tag === "input" || tag === "select" || tag === "textarea";

    if (e.code === "Space") {
      if (isTyping) return;
      e.preventDefault();
      if (state.mode === "speedcuber") {
        Cube.handleSpacebar();
      } else {
        toggleTimer();
      }
      return;
    }

    if (isTyping) return;

    if (e.key.toLowerCase() === "r") {
      resetTimer();
    } else if (e.key.toLowerCase() === "m") {
      toggleMute();
    } else if (e.key === "Escape") {
      closeAllPanels();
    }
  }

  /* ===================== INIT ===================== */

  function init() {
    loadSettings();
    applySettingsToUI();
    applyModeUI(state.mode);
    setPhase("focus", { silent: true });
    renderTimer();
    Cube.init();
    renderStats();
    bindEvents();

    if (window.lucide) window.lucide.createIcons();

    // Reintenta crear los iconos por si el script de Lucide (defer) carga después
    window.addEventListener("load", () => {
      if (window.lucide) window.lucide.createIcons();
      AudioEngine.refreshAmbient();
    });

    showToast("Ethos Crono listo. ¡A producir!", "zap");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
