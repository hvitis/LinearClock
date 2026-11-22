/* ==========================================================================
   Linear Clock DIY — Interactive Simulator, Gallery & Live Firmware Config
   ========================================================================== */

(() => {
  const NUM_LEDS = 48;

  const FIXED_COLORS = [
    { name: "Emerald Mint", hex: "#00D26E", rgb: [0, 210, 110] },
    { name: "Warm Amber",   hex: "#FF8C14", rgb: [255, 140, 20] },
    { name: "Daylight Blue",hex: "#2891FF", rgb: [40, 145, 255] },
    { name: "Coral Red",    hex: "#F5415F", rgb: [245, 65, 95] },
    { name: "Soft Violet",  hex: "#AF5FFF", rgb: [175, 95, 255] },
  ];

  const GRADIENT_STOPS = [
    [0.00, [0, 215, 115]],
    [0.45, [140, 225, 65]],
    [0.72, [255, 185, 45]],
    [1.00, [245, 65, 55]],
  ];

  const SCHEDULE_BLOCKS = [
    { start: 0,  end: 6,  label: "Sleep",     rgb: [0, 175, 255] },
    { start: 6,  end: 12, label: "Deep Work", rgb: [0, 220, 110] },
    { start: 12, end: 18, label: "Afternoon", rgb: [255, 180, 30] },
    { start: 18, end: 24, label: "Evening",   rgb: [245, 40, 85] },
  ];

  const MODE_INFO = {
    gradient: {
      title: "1 · Color gradient mode",
      desc: "Time fills smoothly from midnight emerald to midday lime, afternoon amber, and evening coral. Each 30-minute block brightens gradually minute by minute so a single glance tells you both the time and your day's rhythm."
    },
    fixed: {
      title: "2 · Fixed color mode",
      desc: "Pick any single hue from the accent swatches above (or define any RGB tuple in main.py). Elapsed 30-minute segments glow steadily while the active segment fades in smoothly."
    },
    monochrome: {
      title: "3 · Monochrome mode",
      desc: "A calm, warm daylight-white progress bar that blends into minimalist Scandinavian workspaces without adding color clutter."
    },
    calm: {
      title: "4 · Calm mode (ultra-low power)",
      desc: "Lights only the current 30-minute block with a gentle halo on its neighbors — ideal for nightstands or stretching a single 18650 battery charge to 5+ days."
    },
    schedule: {
      title: "5 · Personal schedule mode",
      desc: "Map your daily routine into distinct color blocks: cyan for 00:00–06:00 rest, green for 06:00–12:00 deep work, amber for 12:00–18:00 meetings, and coral for 18:00–24:00 wind-down. Upcoming blocks stay softly lit as a preview."
    },
    sun: {
      title: "6 · Sunrise / Sunset mode",
      desc: "Visualizes golden daylight hours (06:30–19:30) against deep indigo night hours, with a crisp white marker pinpointing the current 30-minute block so you see remaining daylight at a glance."
    }
  };

  // --- State ---
  let activeMode = "gradient";
  let minutesOfDay = 930; // 15:30 default (matches Daylight Machines hero!)
  let brightnessPct = 10; // Eco default for ~1-week runtime
  let ecoMode = true;     // 24-LED Eco + 8h Night MOSFET cutoff + lightsleep
  let activeColorIdx = 0;
  let liveTimer = null;
  let activeCodeTab = "palette";

  // --- DOM Refs ---
  const hoursEl     = document.getElementById("clock-hours");
  const ticksEl     = document.getElementById("clock-ticks");
  const ledsEl      = document.getElementById("clock-leds");
  const timeSlider  = document.getElementById("time-slider");
  const timeReadout = document.getElementById("time-readout");
  const brightSlider= document.getElementById("bright-slider");
  const ecoToggle   = document.getElementById("eco-toggle");
  const battReadout = document.getElementById("battery-readout");
  const colorReadout= document.getElementById("color-readout");
  const swatchRow   = document.getElementById("swatch-row");
  const liveBtn     = document.getElementById("live-btn");
  const modeTitle   = document.getElementById("mode-title");
  const modeDesc    = document.getElementById("mode-desc");
  const codeViewer  = document.getElementById("code-viewer");
  const copyBtn     = document.getElementById("copy-code-btn");

  const ledNodes = [];

  // --- Build Clock Scale & 48 LED Nodes ---
  function initClockFace() {
    for (let h = 0; h <= 24; h++) {
      const span = document.createElement("span");
      span.textContent = String(h);
      hoursEl.appendChild(span);
    }
    for (let t = 0; t <= 48; t++) {
      const div = document.createElement("div");
      div.className = t % 2 === 0 ? "tick major" : "tick minor";
      ticksEl.appendChild(div);
    }
    for (let i = 0; i < NUM_LEDS; i++) {
      const seg = document.createElement("div");
      seg.className = "led-seg";
      ledsEl.appendChild(seg);
      ledNodes.push(seg);
    }
    FIXED_COLORS.forEach((c, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch-btn" + (idx === activeColorIdx ? " is-active" : "");
      btn.style.backgroundColor = c.hex;
      btn.title = c.name;
      btn.setAttribute("aria-label", `Select ${c.name}`);
      btn.addEventListener("click", () => {
        activeColorIdx = idx;
        colorReadout.textContent = c.hex;
        swatchRow.querySelectorAll(".swatch-btn").forEach((b, j) => {
          b.classList.toggle("is-active", j === idx);
        });
        if (activeMode !== "fixed" && activeMode !== "calm") {
          setMode("fixed");
        } else {
          renderClock();
          updateCodeView();
        }
      });
      swatchRow.appendChild(btn);
    });
  }

  // --- Color Helpers (matches firmware/main.py math 1:1) ---
  function lerpColor(c1, c2, t) {
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
    ];
  }

  function sampleGradient(pos) {
    for (let i = 0; i < GRADIENT_STOPS.length - 1; i++) {
      const [p0, c0] = GRADIENT_STOPS[i];
      const [p1, c1] = GRADIENT_STOPS[i + 1];
      if (pos >= p0 && pos <= p1) {
        const t = p1 > p0 ? (pos - p0) / (p1 - p0) : 0;
        return lerpColor(c0, c1, t);
      }
    }
    return GRADIENT_STOPS[GRADIENT_STOPS.length - 1][1];
  }

  function scheduleColorForHour(h) {
    for (const blk of SCHEDULE_BLOCKS) {
      if (h >= blk.start && h < blk.end) return blk.rgb;
    }
    return [255, 255, 255];
  }

  function formatTime(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = Math.floor(mins % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function renderClock() {
    const exactBlock = minutesOfDay / 30;
    const fullBlocks = Math.floor(exactBlock);
    const partialFrac = exactBlock - fullBlocks;
    const visualGain = 0.45 + (brightnessPct / 50) * 0.55;
    let totalChannelIntensity = 0;

    for (let i = 0; i < NUM_LEDS; i++) {
      const posRatio = i / (NUM_LEDS - 1);
      const segHour = i * 0.5;
      let rgb = [0, 0, 0];
      let intensity = 0;

      if (activeMode === "gradient") {
        rgb = sampleGradient(posRatio);
        if (i < fullBlocks) intensity = 1;
        else if (i === fullBlocks) intensity = 0.14 + 0.86 * partialFrac;
      } else if (activeMode === "fixed") {
        rgb = FIXED_COLORS[activeColorIdx].rgb;
        if (i < fullBlocks) intensity = 1;
        else if (i === fullBlocks) intensity = 0.14 + 0.86 * partialFrac;
      } else if (activeMode === "monochrome") {
        rgb = [255, 232, 195];
        if (i < fullBlocks) intensity = 0.9;
        else if (i === fullBlocks) intensity = 0.16 + 0.84 * partialFrac;
      } else if (activeMode === "calm") {
        rgb = FIXED_COLORS[activeColorIdx].rgb;
        const dist = Math.abs(i - exactBlock);
        if (dist < 1.5) intensity = Math.max(0, 1 - dist / 1.5);
      } else if (activeMode === "schedule") {
        rgb = scheduleColorForHour(segHour);
        if (i < fullBlocks) intensity = 1;
        else if (i === fullBlocks) intensity = 0.22 + 0.78 * partialFrac;
        else intensity = 0.13;
      } else if (activeMode === "sun") {
        const isDay = segHour >= 6.5 && segHour < 19.5;
        rgb = isDay ? [255, 195, 70] : [45, 85, 195];
        if (i === fullBlocks) {
          rgb = [255, 255, 255];
          intensity = 1;
        } else if (i < fullBlocks) {
          intensity = 0.82;
        } else {
          intensity = 0.18;
        }
      }

      const node = ledNodes[i];
      if (intensity > 0.02) {
        const adj = intensity * visualGain;
        const r = Math.min(255, Math.round(rgb[0] * adj + 18 * (1 - adj)));
        const g = Math.min(255, Math.round(rgb[1] * adj + 18 * (1 - adj)));
        const b = Math.min(255, Math.round(rgb[2] * adj + 20 * (1 - adj)));
        node.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        node.style.boxShadow = intensity > 0.2
          ? `0 0 ${Math.round(6 + 10 * adj)}px rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.45 * adj).toFixed(2)})`
          : "none";
        totalChannelIntensity += ((rgb[0] + rgb[1] + rgb[2]) / 765) * intensity * (brightnessPct / 100);
      } else {
        node.style.backgroundColor = "#1e1e21";
        node.style.boxShadow = "none";
      }
    }

    // Battery runtime estimate (2x Samsung 35E 18650 = 6800 mAh @ 3.6V -> ~4160 mAh usable @ 5V at 85% boost eff.)
    const usableMah5V = 4160;
    const activeLedMa48 = totalChannelIntensity * 60;
    let avgDailyMa;
    if (ecoMode) {
      // 24 LEDs (half quiescent + half active LEDs), Pico 2 W lightsleep (~1.8 mA), 8h night MOSFET cutoff (0 mA LEDs)
      const dayMa = 1.8 + (24 * 0.85) + (activeLedMa48 * 0.5);
      const nightMa = 1.8;
      avgDailyMa = (16 * dayMa + 8 * nightMa) / 24;
    } else {
      // 48 LEDs always powered, Pico W lightsleep (~2 mA)
      avgDailyMa = 2.0 + (48 * 0.85) + activeLedMa48;
    }
    const estHours = Math.round(usableMah5V / avgDailyMa);
    const runtimeStr = estHours >= 48 ? `~${(estHours / 24).toFixed(1)} days` : `~${estHours}h`;

    timeReadout.textContent = formatTime(minutesOfDay);
    battReadout.textContent = `${brightnessPct}% · ${runtimeStr}`;
  }

  function setMode(mode) {
    activeMode = mode;
    document.querySelectorAll("#mode-switcher .num-btn").forEach((btn) => {
      const isMatch = btn.dataset.mode === mode;
      btn.classList.toggle("is-active", isMatch);
      btn.setAttribute("aria-selected", String(isMatch));
    });
    modeTitle.textContent = MODE_INFO[mode].title;
    modeDesc.textContent = MODE_INFO[mode].desc;
    renderClock();
    updateCodeView();
  }

  // --- Mode Switcher Events ---
  document.querySelectorAll("#mode-switcher .num-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  timeSlider.addEventListener("input", (e) => {
    stopLiveClock();
    minutesOfDay = Number(e.target.value);
    renderClock();
  });

  brightSlider.addEventListener("input", (e) => {
    brightnessPct = Number(e.target.value);
    renderClock();
    updateCodeView();
  });

  if (ecoToggle) {
    ecoToggle.addEventListener("change", (e) => {
      ecoMode = e.target.checked;
      renderClock();
      updateCodeView();
    });
  }

  function stopLiveClock() {
    if (liveTimer) {
      clearInterval(liveTimer);
      liveTimer = null;
      liveBtn.textContent = "Use live clock";
    }
  }

  function syncToNow() {
    const now = new Date();
    minutesOfDay = now.getHours() * 60 + now.getMinutes();
    timeSlider.value = String(minutesOfDay);
    renderClock();
  }

  liveBtn.addEventListener("click", () => {
    if (liveTimer) {
      stopLiveClock();
    } else {
      syncToNow();
      liveBtn.textContent = "Live clock active (stop)";
      liveTimer = setInterval(syncToNow, 15000);
    }
  });

  // --- 3D Case Gallery Switcher ---
  const caseImg = document.getElementById("case-preview-img");
  const caseCaption = document.getElementById("case-caption");
  document.querySelectorAll("#case-switcher .num-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#case-switcher .num-btn").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", String(active));
      });
      caseImg.src = btn.dataset.img;
      caseCaption.textContent = btn.dataset.caption;
    });
  });

  // --- Firmware Code Viewer ---
  let cachedMainPy = null;

  function buildLivePaletteSnippet() {
    const c = FIXED_COLORS[activeColorIdx];
    const modeIdx = ["gradient", "fixed", "monochrome", "calm", "schedule", "sun"].indexOf(activeMode);
    return `# Live configuration synced from your simulator selection above
# Paste these lines into firmware/main.py on your Raspberry Pi Pico 2 W

NUM_LEDS          = ${ecoMode ? 24 : 48}               # ${ecoMode ? "24 LEDs (144 LED/m = 167 mm) for ~8-10 day battery" : "48 LEDs (30-min blocks)"}
USE_MOSFET_CUTOFF = ${ecoMode ? "True" : "False"}            # Cuts LED rail via GP1 IRLZ44N during 23:00-07:00
NIGHT_SLEEP_START = 23               # 23:00 auto-off
NIGHT_SLEEP_END   = 7                # 07:00 auto-wake
DEFAULT_MODE_IDX  = ${modeIdx}                # "${activeMode}"
BRIGHTNESS        = ${(brightnessPct / 100).toFixed(2)}             # ${brightnessPct}% Eco PWM brightness

# Active accent color (${c.name} · ${c.hex})
PRIMARY_COLOR     = (${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]})

# 24-hour Color Gradient stops (position 0.0..1.0, (R, G, B))
GRADIENT_STOPS = [
    (0.00, (0, 215, 115)),           # Midnight -> Morning (Emerald)
    (0.45, (140, 225, 65)),          # Midday (Warm Lime)
    (0.72, (255, 185, 45)),          # Afternoon (Golden Amber)
    (1.00, (245, 65, 55)),           # Evening (Sunset Coral)
]`;
  }

  const SETUP_GUIDE = `# 5-Minute Raspberry Pi Pico W Setup
# ----------------------------------

1. Hold the white BOOTSEL button on your Raspberry Pi Pico W
   and plug it into your computer via USB.
   -> A removable drive named "RPI-RP2" appears.

2. Download the official MicroPython UF2 for Pico W (or Pico 2 W)
   from https://micropython.org/download/ and drag it onto RPI-RP2.
   -> The board reboots automatically into MicroPython.

3. Open Thonny (https://thonny.org/), select "MicroPython (Raspberry Pi Pico)"
   in the bottom-right interpreter menu.

4. Open firmware/main.py, enter your WIFI_SSID, WIFI_PASSWORD, and
   UTC_OFFSET_HOURS (or leave blank to set time offline with Button 3).

5. Save to Raspberry Pi Pico as "main.py".
   Unplug USB, flip the 18650 Battery Shield switch ON — your linear clock
   syncs time over Wi-Fi, turns off its radio to save battery, and lights up!`;

  async function updateCodeView() {
    if (activeCodeTab === "palette") {
      codeViewer.textContent = buildLivePaletteSnippet();
    } else if (activeCodeTab === "setup") {
      codeViewer.textContent = SETUP_GUIDE;
    } else {
      if (cachedMainPy) {
        codeViewer.textContent = cachedMainPy;
      } else {
        codeViewer.textContent = "# Loading firmware/main.py ...";
        try {
          const res = await fetch("./firmware/main.py");
          cachedMainPy = await res.text();
          if (activeCodeTab === "full") codeViewer.textContent = cachedMainPy;
        } catch {
          codeViewer.textContent = "# Use the 'Download main.py' button above to inspect the full firmware file.";
        }
      }
    }
  }

  document.querySelectorAll(".code-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeCodeTab = tab.dataset.tab;
      document.querySelectorAll(".code-tab").forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", String(active));
      });
      updateCodeView();
    });
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codeViewer.textContent);
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1600);
    } catch {
      copyBtn.textContent = "Select & Ctrl+C";
    }
  });

  // --- Boot ---
  initClockFace();
  renderClock();
  updateCodeView();
})();
