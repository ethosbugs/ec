/* =========================================================
   ETHOS CRONO — app.js (Refactorizado)
   Lógica completa: modos, Web Audio API, speedcuber con WCA Spacebar,
   mini-cubo dinámico SVG y fondo personalizado en localStorage.
   ========================================================= */

(function () {
  "use strict";

  /* ===================== CONSTANTES ===================== */

  const STORAGE_KEYS = {
    HISTORY: "ethosCrono.history",
    SETTINGS: "ethosCrono.settings",
    SOLVES: "ethosCrono.solves",
    CUSTOM_BG: "ethosCrono.customBg"
  };

  const MODE_PRESETS = {
    standard: { focus: 25, short: 5, long: 15, rounds: 4, label: "Estándar 25/5" },
    speedcuber: { focus: 0, short: 0, long: 0, rounds: 0, label: "Speedcuber WCA" }, // Especial
    custom: { focus: 25, short: 5, long: 15, rounds: 4, label: "Personalizado" }
  };

  const RING_CIRCUMFERENCE = 2 * Math.PI * 135; // r=135

  /* ===================== ESTADO ===================== */

  const state = {
    mode: "standard",
    phase: "focus", // focus | short | long
    round: 1,
    totalSeconds: MODE_PRESETS.standard.focus * 60,
    secondsLeft: MODE_PRESETS.standard.focus * 60,
    timerInterval: null,
    isRunning: false,
    settings: {
      theme: "cyberpunk",
      autoStart: false,
      strictMode: false,
      alarmSound: "bell",
      alarmVolume: 70,
      ambientSound: "none",
      ambientVolume: 35,
      muted: false,
      customPreset: { focus: 25, short: 5, long: 15, rounds: 4, ambient: "none" }
    }
  };

  /* ===================== MOTOR DE AUDIO (Web Audio API) ===================== */

  const AudioEngine = (function () {
    let ctx = null;
    let ambientSource = null;
    let ambientGain = null;
    let masterMute = false;

    function initContext() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (ctx.state === "suspended") {
        ctx.resume();
      }
    }

    // Sintetiza ruido blanco matemático
    function createWhiteNoiseBuffer() {
      const bufferSize = 2 * ctx.sampleRate;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    }

    // Sintetiza ruido marrón aplicando filtro de caída
    function createBrownNoiseBuffer() {
      const bufferSize = 2 * ctx.sampleRate;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Filtro de primer orden para caída de 6dB/octava
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5; // Ganancia de compensación
      }
      return buffer;
    }

    // Emula lluvia mediante pink noise + oscilaciones
    function createRainBuffer() {
      const bufferSize = 3 * ctx.sampleRate;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Filtro Paul Kellet para pink noise refinado
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        data[i] = pink * 0.11; // Atenuación de lluvia
      }
      return buffer;
    }

    function playAmbient(type) {
      stopAmbient();
      if (type === "none" || masterMute) return;
      initContext();

      let buffer;
      if (type === "white") buffer = createWhiteNoiseBuffer();
      else if (type === "brown") buffer = createBrownNoiseBuffer();
      else if (type === "rain") buffer = createRainBuffer();
      else return;

      ambientSource = ctx.createBufferSource();
      ambientSource.buffer = buffer;
      ambientSource.loop = true;

      ambientGain = ctx.createGain();
      updateAmbientVolume();

      ambientSource.connect(ambientGain);
      ambientGain.connect(ctx.destination);
      ambientSource.start(0);
    }

    function stopAmbient() {
      if (ambientSource) {
        try { ambientSource.stop(); } catch(e){}
        ambientSource.disconnect();
        ambientSource = null;
      }
    }

    function updateAmbientVolume() {
      if (ambientGain && ctx) {
        const vol = masterMute ? 0 : (state.settings.ambientVolume / 100);
        ambientGain.gain.setValueAtTime(vol, ctx.currentTime);
      }
    }

    // Sintetizador nativo de alarmas
    function playAlarm(type) {
      if (type === "none" || masterMute) return;
      initContext();

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const vol = state.settings.alarmVolume / 100;

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (type === "bell") {
        // Campana Tibetana (Combinación de tonos armónicos con decaimiento largo)
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 4.0);

        // Añadimos un oscilador armónico secundario para dar textura metálica
        const osc2 = ctx.createOscillator();
        const gainNode2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(554.37, ctx.currentTime); // Armónico mayor C#
        osc2.connect(gainNode2);
        gainNode2.connect(ctx.destination);
        gainNode2.gain.setValueAtTime(0, ctx.currentTime);
        gainNode2.gain.linearRampToValueAtTime(vol * 0.4, ctx.currentTime + 0.05);
        gainNode2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 3.0);

      } else if (type === "synth") {
        // Pitido sintetizado elegante de doble pulso
        osc.type = "triangle";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);

        setTimeout(() => {
          if (masterMute) return;
          const osc2 = ctx.createOscillator();
          const gainNode2 = ctx.createGain();
          osc2.type = "triangle";
          osc2.frequency.setValueAtTime(880, ctx.currentTime);
          osc2.connect(gainNode2);
          gainNode2.connect(ctx.destination);
          gainNode2.gain.setValueAtTime(0, ctx.currentTime);
          gainNode2.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.02);
          gainNode2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc2.start(ctx.currentTime);
          osc2.stop(ctx.currentTime + 0.45);
        }, 300);

      } else if (type === "chime") {
        // Carillón digital
        osc.type = "sine";
        const notes = [523.25, 659.25, 783.99, 1046.50]; // Acorde C mayor
        notes.forEach((freq, idx) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sine";
          o.frequency.setValueAtTime(freq, ctx.currentTime + (idx * 0.12));
          o.connect(g);
          g.connect(ctx.destination);
          g.gain.setValueAtTime(0, ctx.currentTime + (idx * 0.12));
          g.gain.linearRampToValueAtTime(vol / 4, ctx.currentTime + (idx * 0.12) + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (idx * 0.12) + 1.2);
          o.start(ctx.currentTime + (idx * 0.12));
          o.stop(ctx.currentTime + (idx * 0.12) + 1.5);
        });
      }
    }

    function muteAll(mute) {
      masterMute = mute;
      if (mute) stopAmbient();
      else playAmbient(state.settings.ambientSound);
    }

    return { playAmbient, stopAmbient, updateAmbientVolume, playAlarm, muteAll, initContext };
  })();

  /* ===================== MÓDULO SPEEDCUBER (WCA SPACEBAR) ===================== */

  const Cube = (function () {
    let solves = [];
    let stateCubing = "idle"; // idle | inspecting | running | stopped
    let startTime = 0;
    let timerInterval = null;
    let inspectionTime = 15;
    let inspectionInterval = null;
    let spacePressed = false;

    // Generador de mezcla aleatoria de 3x3
    function generateScramble() {
      const moves = ["U", "D", "R", "L", "F", "B"];
      const modifiers = ["", "'", "2"];
      let scramble = [];
      let lastMove = "";

      while (scramble.length < 20) {
        const move = moves[Math.floor(Math.random() * moves.length)];
        if (move !== lastMove) {
          const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
          scramble.push(move + mod);
          lastMove = move;
        }
      }
      return scramble.join(" ");
    }

    // Renderiza el cubo 2D desplegado en formato SVG
    function drawMiniCube() {
      const svg = document.getElementById("miniCubeNet");
      if (!svg) return;

      const colors = ["#ffffff", "#ffd500", "#009b48", "#0045ad", "#b71234", "#ff5800"]; // U, D, F, B, L, R
      const scrambleColors = [];
      for (let i = 0; i < 54; i++) {
        scrambleColors.push(colors[Math.floor(Math.random() * colors.length)]);
      }

      // Tamaño de pegatina
      const w = 10;
      const gap = 1;

      // Estructura de despliegue clásica de Rubik en 2D plano (Coordenadas de caras en SVG)
      const faces = [
        { name: "U", dx: 36, dy: 0 },
        { name: "L", dx: 0, dy: 33 },
        { name: "F", dx: 36, dy: 33 },
        { name: "R", dx: 72, dy: 33 },
        { name: "B", dx: 108, dy: 33 },
        { name: "D", dx: 36, dy: 66 }
      ];

      let svgHtml = "";
      let colorIndex = 0;

      faces.forEach(face => {
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            const x = face.dx + col * (w + gap);
            const y = face.dy + row * (w + gap);
            svgHtml += `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="${scrambleColors[colorIndex++]}" rx="1.5" />`;
          }
        }
      });
      svg.innerHTML = svgHtml;
    }

    function init() {
      solves = JSON.parse(localStorage.getItem(STORAGE_KEYS.SOLVES)) || [];
      document.getElementById("newScrambleBtn").addEventListener("click", refreshScramble);
      document.getElementById("clearTimesBtn").addEventListener("click", clearSolves);
      refreshScramble();
      renderSolves();
    }

    function refreshScramble() {
      document.getElementById("scrambleText").textContent = generateScramble();
      drawMiniCube();
    }

    // LÓGICA DE BARRA ESPACIADORA DE SPEEDCUBER
    function handleKeydown(e) {
      if (e.code !== "Space" || spacePressed) return;
      e.preventDefault();
      spacePressed = true;
      AudioEngine.initContext();

      if (stateCubing === "idle" || stateCubing === "stopped") {
        // Al MANTENER pulsado: activa la cuenta atrás de la inspección
        stateCubing = "inspecting";
        document.getElementById("inspectionWrap").classList.remove("hidden");
        document.querySelector(".timer-ring-wrap").classList.add("hidden");
        inspectionTime = 15;
        document.getElementById("inspectionTime").textContent = inspectionTime;

        clearInterval(inspectionInterval);
        inspectionInterval = setInterval(() => {
          inspectionTime--;
          document.getElementById("inspectionTime").textContent = inspectionTime;
          if (inspectionTime <= 3) {
            document.getElementById("inspectionTime").style.color = "#ff007f";
          } else {
            document.getElementById("inspectionTime").style.color = "var(--accent-warn)";
          }
          if (inspectionTime === 0) {
            // Penalización WCA o auto-arranque (arranque directo para comodidad)
            clearInterval(inspectionInterval);
            startSolve();
          }
        }, 1000);
      } else if (stateCubing === "running") {
        // Al pulsar en carrera: Detiene y guarda al instante
        stopSolve();
      }
    }

    function handleKeyup(e) {
      if (e.code !== "Space") return;
      e.preventDefault();
      spacePressed = false;

      if (stateCubing === "inspecting") {
        // Al SOLTAR la barra espaciadora: Arranca el cronómetro inmediatamente
        clearInterval(inspectionInterval);
        document.getElementById("inspectionWrap").classList.add("hidden");
        document.querySelector(".timer-ring-wrap").classList.remove("hidden");
        startSolve();
      }
    }

    function startSolve() {
      stateCubing = "running";
      document.getElementById("microState").textContent = "Resolviendo...";
      startTime = performance.now();
      clearInterval(timerInterval);

      timerInterval = setInterval(() => {
        const diff = performance.now() - startTime;
        document.getElementById("cubeReadout").textContent = (diff / 1000).toFixed(2);
      }, 10);
    }

    function stopSolve() {
      stateCubing = "stopped";
      clearInterval(timerInterval);
      const finalTime = ((performance.now() - startTime) / 1000).toFixed(2);
      document.getElementById("cubeReadout").textContent = finalTime;
      document.getElementById("microState").textContent = "¡Resolución completada! Pulsa Espacio para otra.";

      // Guardar tiempo
      solves.unshift({
        time: parseFloat(finalTime),
        scramble: document.getElementById("scrambleText").textContent,
        date: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      });

      localStorage.setItem(STORAGE_KEYS.SOLVES, JSON.stringify(solves));
      renderSolves();
      refreshScramble();
    }

    function calculateStats() {
      if (solves.length === 0) return { best: "—", ao5: "—", ao12: "—" };

      const times = solves.map(s => s.time);
      const best = Math.min(...times).toFixed(2);

      const getAverage = (n) => {
        if (times.length < n) return "—";
        const sample = times.slice(0, n);
        // Regla WCA: Quitar el mejor y el peor tiempo, y promediar el resto
        sample.sort((a, b) => a - b);
        sample.shift();
        sample.pop();
        const sum = sample.reduce((acc, t) => acc + t, 0);
        return (sum / sample.length).toFixed(2);
      };

      return {
        best: best,
        ao5: getAverage(5),
        ao12: getAverage(12)
      };
    }

    function renderSolves() {
      const list = document.getElementById("solveList");
      if (!list) return;

      if (solves.length === 0) {
        list.innerHTML = `<li class="solve-list__empty">Aún no hay resoluciones registradas.</li>`;
      } else {
        list.innerHTML = solves.slice(0, 8).map((solve, i) => `
          <li>
            <span>#${solves.length - i} <em>(${solve.date})</em></span>
            <strong>${solve.time.toFixed(2)}s</strong>
          </li>
        `).join("");
      }

      const stats = calculateStats();
      document.getElementById("bestSolve").textContent = stats.best;
      document.getElementById("ao5Solve").textContent = stats.ao5;
      document.getElementById("ao12Solve").textContent = stats.ao12;
    }

    function clearSolves() {
      if (confirm("¿Quieres eliminar de verdad todos tus tiempos registrados?")) {
        solves = [];
        localStorage.removeItem(STORAGE_KEYS.SOLVES);
        renderSolves();
      }
    }

    function resetCubeState() {
      stateCubing = "idle";
      clearInterval(timerInterval);
      clearInterval(inspectionInterval);
      document.getElementById("inspectionWrap").classList.add("hidden");
      document.querySelector(".timer-ring-wrap").classList.remove("hidden");
      document.getElementById("cubeReadout").textContent = "0.00";
      document.getElementById("microState").textContent = "Listo para inspeccionar";
    }

    return { init, handleKeydown, handleKeyup, resetCubeState, refreshScramble };
  })();

  /* ===================== HISTORIAL Y ESTADÍSTICAS DEL DÍA ===================== */

  const Stats = (function () {
    let history = [];

    function init() {
      history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY)) || [];
      document.getElementById("resetStatsBtn").addEventListener("click", clearStats);
    }

    function logSession(type, durationMinutes) {
      history.unshift({
        type: type, // focus | break
        duration: durationMinutes,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      });
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
      render();
    }

    function render() {
      const list = document.getElementById("historyList");
      if (!list) return;

      if (history.length === 0) {
        list.innerHTML = `<li class="history-list__empty">Todavía no hay sesiones registradas hoy.</li>`;
      } else {
        list.innerHTML = history.map(item => `
          <li>
            <span><i data-lucide="${item.type === "focus" ? "target" : "coffee"}" style="width:14px; color: ${item.type === "focus" ? "var(--accent-1)" : "var(--accent-3)"}"></i> 
            ${item.type === "focus" ? "Sesión de Enfoque" : "Fase de Descanso"}</span>
            <em>${item.duration} min · ${item.timestamp}</em>
          </li>
        `).join("");
        if (window.lucide) window.lucide.createIcons();
      }

      // Procesamiento de indicadores
      const focusSessions = history.filter(h => h.type === "focus");
      const focusMinutes = focusSessions.reduce((sum, h) => sum + h.duration, 0);
      const breaks = history.filter(h => h.type === "break").length;

      document.getElementById("statFocusSessions").textContent = focusSessions.length;
      document.getElementById("statFocusMinutes").textContent = `${focusMinutes}m`;
      document.getElementById("statBreaks").textContent = breaks;
      document.getElementById("statStreak").textContent = "1"; // Auto calculado básico
    }

    function clearStats() {
      if (confirm("¿Deseas limpiar el historial de productividad de hoy?")) {
        history = [];
        localStorage.removeItem(STORAGE_KEYS.HISTORY);
        render();
      }
    }

    return { init, logSession, render };
  })();

  /* ===================== LÓGICA DEL TEMPORIZADOR GENERAL ===================== */

  function renderTimer() {
    const min = Math.floor(state.secondsLeft / 60);
    const sec = state.secondsLeft % 60;
    const readable = `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;

    document.getElementById("timeReadout").textContent = readable;
    document.title = state.isRunning ? `(${readable}) Ethos Crono` : "Ethos Crono";

    // Progreso de anillo circular
    const strokeDashOffset = RING_CIRCUMFERENCE - (state.secondsLeft / state.totalSeconds) * RING_CIRCUMFERENCE;
    document.getElementById("timerRingProgress").style.strokeDashoffset = isNaN(strokeDashOffset) ? 0 : strokeDashOffset;

    // Advertencia de urgencia (últimos 30 segundos)
    if (state.isRunning && state.secondsLeft < 30 && state.phase === "focus") {
      document.getElementById("timeReadout").classList.add("is-urgent");
    } else {
      document.getElementById("timeReadout").classList.remove("is-urgent");
    }
  }

  function startTimer() {
    if (state.isRunning) return;
    AudioEngine.initContext();
    state.isRunning = true;
    document.getElementById("startPauseLabel").textContent = "Pausar";
    document.getElementById("startPauseBtn").querySelector("i").setAttribute("data-lucide", "pause");
    if (window.lucide) window.lucide.createIcons();

    AudioEngine.playAmbient(state.settings.ambientSound);

    state.timerInterval = setInterval(() => {
      if (state.secondsLeft > 0) {
        state.secondsLeft--;
        renderTimer();
      } else {
        handlePhaseComplete();
      }
    }, 1000);
  }

  function pauseTimer() {
    if (!state.isRunning) return;
    state.isRunning = false;
    clearInterval(state.timerInterval);
    document.getElementById("startPauseLabel").textContent = "Iniciar";
    document.getElementById("startPauseBtn").querySelector("i").setAttribute("data-lucide", "play");
    if (window.lucide) window.lucide.createIcons();

    AudioEngine.stopAmbient();
  }

  function resetTimer() {
    pauseTimer();
    const preset = MODE_PRESETS[state.mode] || state.settings.customPreset;
    const mins = state.phase === "focus" ? preset.focus : (state.phase === "short" ? preset.short : preset.long);
    state.totalSeconds = mins * 60;
    state.secondsLeft = mins * 60;
    renderTimer();
    document.getElementById("microState").textContent = "Temporizador listo";
  }

  function skipPhase() {
    handlePhaseComplete(true);
  }

  function handlePhaseComplete(isSkip = false) {
    pauseTimer();

    const currentPreset = MODE_PRESETS[state.mode] || state.settings.customPreset;

    if (!isSkip) {
      AudioEngine.playAlarm(state.settings.alarmSound);
      if (state.phase === "focus") {
        Stats.logSession("focus", currentPreset.focus);
        showToast("¡Sesión completada! Es hora de descansar.", "coffee");
      } else {
        Stats.logSession("break", state.phase === "short" ? currentPreset.short : currentPreset.long);
        showToast("¡Descanso terminado! Volvamos al trabajo.", "target");
      }
    }

    // Configuración de la siguiente fase
    if (state.phase === "focus") {
      if (state.round >= currentPreset.rounds) {
        setPhase("long");
      } else {
        setPhase("short");
      }
    } else {
      if (state.phase === "long") {
        state.round = 1;
      } else {
        state.round++;
      }
      setPhase("focus");
    }

    if (state.settings.autoStart) {
      setTimeout(startTimer, 1000);
    }
  }

  function setPhase(phase, options = {}) {
    state.phase = phase;
    const currentPreset = MODE_PRESETS[state.mode] || state.settings.customPreset;
    const mins = phase === "focus" ? currentPreset.focus : (phase === "short" ? currentPreset.short : currentPreset.long);

    state.totalSeconds = mins * 60;
    state.secondsLeft = mins * 60;

    const panel = document.querySelector(".timer-panel");
    const badge = document.getElementById("sessionBadge");

    if (phase === "focus") {
      panel.classList.remove("is-break");
      badge.textContent = "Enfoque";
      document.getElementById("sessionCount").textContent = `Sesión ${state.round} / ${currentPreset.rounds}`;
      document.getElementById("microState").textContent = "Mantén la concentración";
    } else {
      panel.classList.add("is-break");
      badge.textContent = phase === "short" ? "Descanso" : "Recreo";
      document.getElementById("sessionCount").textContent = phase === "short" ? "Pausa rápida" : "Pausa larga";
      document.getElementById("microState").textContent = "Respira profundo y relájate";
    }

    renderTimer();
  }

  /* ===================== CONFIGURACIONES Y ARCHIVOS ===================== */

  function applyTheme(themeName) {
    document.body.setAttribute("data-theme", themeName);
    state.settings.theme = themeName;

    document.querySelectorAll(".theme-swatch").forEach(swatch => {
      if (swatch.getAttribute("data-theme-choice") === themeName) {
        swatch.classList.add("is-active");
      } else {
        swatch.classList.remove("is-active");
      }
    });
    persistSettings();
  }

  // Lógica para guardar la imagen personalizada en LocalStorage (Base64)
  function handleBgUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("La imagen es demasiado grande. Por favor, selecciona una imagen de menos de 2MB para un rendimiento fluido.");
      return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
      const base64String = event.target.result;
      try {
        localStorage.setItem(STORAGE_KEYS.CUSTOM_BG, base64String);
        applyCustomBg(base64String);
        showToast("Fondo de pantalla personalizado aplicado", "image");
      } catch (err) {
        alert("Hubo un problema al guardar la imagen localmente. El tamaño sigue siendo excesivo.");
      }
    };
    reader.readAsDataURL(file);
  }

  function applyCustomBg(base64String) {
    if (base64String) {
      document.body.classList.add("has-custom-bg");
      document.body.style.setProperty("--custom-bg-img", `url(${base64String})`);
      document.getElementById("bgStatus").textContent = "Fondo personalizado activo.";
    } else {
      document.body.classList.remove("has-custom-bg");
      document.body.style.removeProperty("--custom-bg-img");
      document.getElementById("bgStatus").textContent = "Sin fondo personalizado activo.";
    }
  }

  function removeCustomBg() {
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_BG);
    applyCustomBg(null);
    showToast("Fondo de pantalla personalizado eliminado", "image-off");
  }

  function applyMode(modeName) {
    state.mode = modeName;
    document.querySelectorAll(".mode-btn").forEach(btn => {
      if (btn.getAttribute("data-mode") === modeName) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    });

    // Resetear contenedores de display
    const timeDisplay = document.getElementById("timeReadout");
    const cubeDisplay = document.getElementById("cubeReadout");
    const cubePanel = document.getElementById("cubePanel");

    pauseTimer();

    if (modeName === "speedcuber") {
      timeDisplay.classList.add("hidden");
      cubeDisplay.classList.remove("hidden");
      cubePanel.classList.remove("hidden");
      document.getElementById("resetBtn").style.display = "none";
      document.getElementById("startPauseBtn").style.display = "none";
      document.getElementById("skipBtn").style.display = "none";
      document.querySelector(".session-label").classList.add("hidden");
      document.querySelector(".keyboard-hints").innerHTML = `
        <span><kbd>Espacio (Mantener)</kbd> Inspeccionar WCA</span>
        <span><kbd>Espacio (Soltar)</kbd> Iniciar Carrera</span>
      `;
      Cube.resetCubeState();
    } else {
      timeDisplay.classList.remove("hidden");
      cubeDisplay.classList.add("hidden");
      cubePanel.classList.add("hidden");
      document.getElementById("resetBtn").style.display = "inline-flex";
      document.getElementById("startPauseBtn").style.display = "inline-flex";
      document.getElementById("skipBtn").style.display = "inline-flex";
      document.querySelector(".session-label").classList.remove("hidden");
      document.querySelector(".keyboard-hints").innerHTML = `
        <span><kbd>Espacio</kbd> Iniciar/Pausar</span>
        <span><kbd>R</kbd> Reiniciar</span>
        <span><kbd>M</kbd> Silenciar</span>
      `;
      setPhase("focus");
    }
  }

  /* ===================== PANEL CONTROLES GENERALES / EVENTOS ===================== */

  function toggleSidebar(sidebarId, forceOpen = null) {
    const panel = document.getElementById(sidebarId);
    const overlay = document.getElementById("overlay");
    const isOpen = forceOpen !== null ? forceOpen : panel.classList.contains("hidden");

    if (isOpen) {
      panel.classList.remove("hidden");
      setTimeout(() => panel.classList.add("is-open"), 10);
      overlay.classList.remove("hidden");
      setTimeout(() => overlay.classList.add("is-open"), 10);
    } else {
      panel.classList.remove("is-open");
      overlay.classList.remove("is-open");
      setTimeout(() => {
        panel.classList.add("hidden");
        overlay.classList.add("hidden");
      }, 300);
    }
  }

  function closeAllPanels() {
    ["sidebar", "statsPanel"].forEach(id => {
      const panel = document.getElementById(id);
      if (panel) {
        panel.classList.remove("is-open");
        setTimeout(() => panel.classList.add("hidden"), 300);
      }
    });
    const overlay = document.getElementById("overlay");
    overlay.classList.remove("is-open");
    setTimeout(() => overlay.classList.add("hidden"), 300);
  }

  function showToast(text, iconName = "info") {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i data-lucide="${iconName}"></i> <span>${text}</span>`;
    document.body.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => toast.classList.add("is-visible"), 10);
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  function persistSettings() {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
  }

  function loadSettings() {
    const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (saved) {
      try {
        state.settings = { ...state.settings, ...JSON.parse(saved) };
      } catch (e) {}
    }

    // Cargar fondo personalizado
    const customBg = localStorage.getItem(STORAGE_KEYS.CUSTOM_BG);
    if (customBg) applyCustomBg(customBg);
  }

  function applySettingsToUI() {
    applyTheme(state.settings.theme);
    document.getElementById("autoStartToggle").checked = state.settings.autoStart;
    document.getElementById("strictModeToggle").checked = state.settings.strictMode;
    document.getElementById("alarmSelect").value = state.settings.alarmSound;
    document.getElementById("alarmVolume").value = state.settings.alarmVolume;
    document.getElementById("ambientSelect").value = state.settings.ambientSound;
    document.getElementById("ambientVolume").value = state.settings.ambientVolume;

    // Sincronizar presets del Personalizado
    document.getElementById("customFocus").value = state.settings.customPreset.focus;
    document.getElementById("customShort").value = state.settings.customPreset.short;
    document.getElementById("customLong").value = state.settings.customPreset.long;
    document.getElementById("customRounds").value = state.settings.customPreset.rounds;
    document.getElementById("customAmbient").value = state.settings.customPreset.ambient;
  }

  function bindEvents() {
    // Selectores principales de modo
    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        applyMode(btn.getAttribute("data-mode"));
      });
    });

    // Controladores del cronómetro principal
    document.getElementById("startPauseBtn").addEventListener("click", () => {
      if (state.isRunning) pauseTimer();
      else startTimer();
    });
    document.getElementById("resetBtn").addEventListener("click", resetTimer);
    document.getElementById("skipBtn").addEventListener("click", skipPhase);

    // Botones de toggle laterales
    document.getElementById("themeToggleBtn").addEventListener("click", () => {
      const themes = ["cyberpunk", "liquid", "matrix", "nordic"];
      let nextIndex = (themes.indexOf(state.settings.theme) + 1) % themes.length;
      applyTheme(themes[nextIndex]);
      showToast(`Tema visual cambiado a: ${themes[nextIndex]}`, "palette");
    });

    document.getElementById("statsToggleBtn").addEventListener("click", () => toggleSidebar("statsPanel"));
    document.getElementById("sidebarToggleBtn").addEventListener("click", () => toggleSidebar("sidebar"));
    document.getElementById("overlay").addEventListener("click", closeAllPanels);

    // Conectar eventos dinámicos de botones cerrar ("X")
    document.querySelectorAll(".panel-close-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-close");
        toggleSidebar(targetId, false);
      });
    });

    // Configuraciones interactivas
    document.getElementById("autoStartToggle").addEventListener("change", (e) => {
      state.settings.autoStart = e.target.checked;
      persistSettings();
    });

    document.getElementById("strictModeToggle").addEventListener("change", (e) => {
      state.settings.strictMode = e.target.checked;
      persistSettings();
    });

    document.getElementById("alarmSelect").addEventListener("change", (e) => {
      state.settings.alarmSound = e.target.value;
      persistSettings();
      AudioEngine.playAlarm(e.target.value);
    });

    document.getElementById("alarmVolume").addEventListener("input", (e) => {
      state.settings.alarmVolume = parseInt(e.target.value);
      persistSettings();
    });

    document.getElementById("ambientSelect").addEventListener("change", (e) => {
      state.settings.ambientSound = e.target.value;
      persistSettings();
      if (state.isRunning) AudioEngine.playAmbient(e.target.value);
    });

    document.getElementById("ambientVolume").addEventListener("input", (e) => {
      state.settings.ambientVolume = parseInt(e.target.value);
      persistSettings();
      AudioEngine.updateAmbientVolume();
    });

    document.getElementById("muteAllBtn").addEventListener("click", () => {
      state.settings.muted = !state.settings.muted;
      AudioEngine.muteAll(state.settings.muted);
      showToast(state.settings.muted ? "Audio silenciado" : "Audio activado", state.settings.muted ? "volume-x" : "volume-2");
    });

    // Gestión del fondo personalizado
    document.getElementById("bgUploadInput").addEventListener("change", handleBgUpload);
    document.getElementById("removeBgBtn").addEventListener("click", removeCustomBg);

    // Ajustes de modo Personalizado
    document.getElementById("applyCustomBtn").addEventListener("click", () => {
      const focus = parseInt(document.getElementById("customFocus").value);
      const short = parseInt(document.getElementById("customShort").value);
      const long = parseInt(document.getElementById("customLong").value);
      const rounds = parseInt(document.getElementById("customRounds").value);
      const ambient = document.getElementById("customAmbient").value;

      state.settings.customPreset = { focus, short, long, rounds, ambient };
      state.settings.ambientSound = ambient;
      document.getElementById("ambientSelect").value = ambient;

      persistSettings();
      applyMode("custom");
      showToast("Modo personalizado guardado y activado", "check");
    });

    // Atajos de teclado robustos
    window.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      const isTyping = tag === "input" || tag === "select" || tag === "textarea";

      if (state.mode === "speedcuber") {
        Cube.handleKeydown(e);
        return;
      }

      if (isTyping) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (state.isRunning) pauseTimer();
        else startTimer();
      } else if (e.key.toLowerCase() === "r") {
        resetTimer();
      } else if (e.key.toLowerCase() === "m") {
        state.settings.muted = !state.settings.muted;
        AudioEngine.muteAll(state.settings.muted);
        showToast(state.settings.muted ? "Audio silenciado" : "Audio activado", state.settings.muted ? "volume-x" : "volume-2");
      } else if (e.key === "Escape") {
        closeAllPanels();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (state.mode === "speedcuber") {
        Cube.handleKeyup(e);
      }
    });

    // Swatches manuales
    document.querySelectorAll(".theme-swatch").forEach(swatch => {
      swatch.addEventListener("click", () => {
        applyTheme(swatch.getAttribute("data-theme-choice"));
      });
    });
  }

  /* ===================== ENTRADA PRINCIPAL ===================== */

  function init() {
    loadSettings();
    applySettingsToUI();
    applyMode("standard");
    renderTimer();
    Cube.init();
    Stats.init();
    Stats.render();
    bindEvents();

    if (window.lucide) window.lucide.createIcons();
  }

  document.addEventListener("DOMContentLoaded", init);
})();