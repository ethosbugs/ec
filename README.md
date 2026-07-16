# ⏱️ Ethos Crono

Un temporizador Pomodoro avanzado y ultra-personalizable, pensado para **programadores**, **speedcubers** y cualquier persona que quiera llevar su productividad al siguiente nivel.

100% autocontenido: **ningún archivo de audio o imagen externo**. Todos los sonidos se generan en tiempo real con la **Web Audio API** y todos los iconos son SVG (Lucide Icons vía CDN).

---

## 🚀 Inicio rápido

1. Descarga y descomprime el proyecto.
2. Abre `index.html` directamente en tu navegador (Chrome, Edge o Firefox recomendados), o sírvelo con un servidor local:

   ```bash
   npx serve .
   # o
   python3 -m http.server 8080
   ```

3. ¡Listo! No hay dependencias que instalar ni build que ejecutar.

> 💡 Algunos navegadores bloquean el audio hasta la primera interacción del usuario. Haz clic en "Iniciar" o pulsa una tecla para desbloquear el motor de audio.

---

## 🧩 Estructura del proyecto

```
ethos-crono/
├── index.html   # Estructura semántica de la app
├── style.css    # Estilos + temas Cyberpunk y Liquid Glass
├── app.js       # Toda la lógica (timer, audio, speedcuber, stats)
└── README.md
```

---

## 🎛️ Modos disponibles

| Modo | Enfoque | Descanso corto | Descanso largo | Rondas |
|---|---|---|---|---|
| **Estándar** | 25 min | 5 min | 15 min | 4 |
| **Programador** | 50 min | 10 min | 20 min | 3 |
| **Speedcuber (WCA)** | Inspección 15s + cronómetro libre | 5 min | 15 min | 4 |
| **Personalizado** | Tú decides cada valor desde el panel de Ajustes | — | — | — |

### Modo Speedcuber

- Genera automáticamente un **scramble aleatorio** válido (movimientos R L U D F B con modificadores `'`/`2`, evitando ejes repetidos consecutivos).
- Pulsa **Espacio** para iniciar la **inspección WCA de 15 segundos**.
- Vuelve a pulsar **Espacio** para arrancar el cronómetro de resolución (si se agota la inspección, arranca automáticamente).
- Pulsa **Espacio** de nuevo para detener el cronómetro y registrar el tiempo.
- Se calculan automáticamente tu **mejor tiempo**, **Ao5** y **Ao12** (promedios recortados al estilo WCA), y el historial se guarda en `localStorage`.

---

## ⌨️ Atajos de teclado

| Tecla | Acción |
|---|---|
| `Espacio` | Iniciar / pausar el temporizador (o controlar el cronómetro en modo Speedcuber) |
| `R` | Reiniciar la fase actual |
| `M` | Silenciar / activar todo el audio |
| `Esc` | Cerrar paneles laterales (Ajustes / Estadísticas) |

---

## 🔊 Motor de audio (100% sintetizado)

Todo el audio se genera con la **Web Audio API**, sin archivos externos:

- **Alarmas** (al finalizar cada fase):
  - *Campana tibetana*: suma de osciladores con parciales inarmónicos y decaimiento exponencial largo.
  - *Pitido synth elegante*: arpegio de tres notas con ondas triangulares.
  - *Carillón digital*: cuatro notas agudas filtradas (highpass) con ataque rápido.
- **Ruido de fondo**:
  - *White Noise*: buffer de ruido blanco generado por muestra, con filtro paso-bajo suave.
  - *Brown Noise*: integración de ruido blanco (random walk) para un sonido más grave y cálido.
  - *Lluvia*: streaming de audio público. Si la conexión falla o el recurso no está disponible, la app recurre automáticamente al **Brown Noise sintetizado** como sustituto sin interrumpir la experiencia.

Cada fuente tiene su **control de volumen independiente** (alarma / ambiente) y puedes silenciar todo con un clic o con `M`.

---

## 🎨 Temas visuales

Cambia de tema en cualquier momento desde el botón de paleta 🎨 en la barra superior, o desde el panel de Ajustes:

- **Cyberpunk**: fondo oscuro, neones cian/magenta/violeta, cuadrícula animada de fondo y un sutil efecto *glitch* al cambiar de fase.
- **Liquid Glass**: fondos degradados suaves, `backdrop-filter: blur()` en todos los paneles (glassmorphism), sombras difusas y manchas de color flotantes.

Tu elección de tema se guarda automáticamente.

---

## 📊 Estadísticas y persistencia

Ethos Crono guarda **todo localmente** en `localStorage` de tu navegador — no se envía ningún dato a ningún servidor:

- Sesiones de enfoque completadas hoy.
- Minutos totales enfocados.
- Descansos tomados.
- Racha de días consecutivos con al menos una sesión de enfoque.
- Historial detallado de las últimas sesiones del día.
- Historial completo de tiempos de speedcuber (mejor tiempo, Ao5, Ao12).

Puedes borrar el historial de hoy o los tiempos de cubo en cualquier momento desde sus respectivos paneles.

---

## ⚙️ Personalización avanzada

Desde el panel de **Ajustes** (icono ⚙️) puedes:

- Definir duraciones propias de enfoque, descanso corto, descanso largo y número de rondas por ciclo.
- Activar **auto-inicio** de la siguiente fase.
- Activar **modo estricto**, que bloquea la posibilidad de pausar durante una fase de enfoque (ideal para evitar procrastinar).
- Elegir el sonido de alarma y de ambiente, y ajustar sus volúmenes de forma independiente.

---

## 🛠️ Stack técnico

- **HTML5** semántico, sin frameworks.
- **CSS3** puro con variables (`custom properties`), `backdrop-filter`, `clamp()`, animaciones y diseño responsivo (mobile-first con breakpoints).
- **JavaScript Vanilla (ES6+)**, sin dependencias de build.
- **Web Audio API** para toda la síntesis de sonido.
- **Lucide Icons** (CDN) para iconografía SVG.
- **Google Fonts**: `JetBrains Mono` / `Share Tech Mono`.
- **localStorage** para persistencia de ajustes, historial y tiempos.

---

Hecho con ⌨️, 🧊 y mucho ☕. ¡Disfruta tus sesiones de foco!
