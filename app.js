/* ==========================================================================
   Linear Clock DIY — Dual-Solution Controller (nRF52 default | Raspberry)
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
    { start: 0,  end: 6,  rgb: [0, 175, 255] },
    { start: 6,  end: 12, rgb: [0, 220, 110] },
    { start: 12, end: 18, rgb: [255, 180, 30] },
    { start: 18, end: 24, rgb: [245, 40, 85] },
  ];

  const MODE_INFO = {
    gradient:   { title: "1 · Color gradient mode", desc: "Time fills smoothly from midnight emerald to midday lime, afternoon amber, and evening coral. Each 30-minute block brightens gradually minute by minute." },
    fixed:      { title: "2 · Fixed color mode", desc: "Pick any single hue from the accent swatches above or define custom RGB tuples in firmware." },
    monochrome: { title: "3 · Monochrome mode", desc: "A calm, warm daylight-white progress bar that blends into minimalist Scandinavian workspaces." },
    calm:       { title: "4 · Calm mode (max battery)", desc: "Lights only the current block with a gentle halo on its neighbors — stretching nRF52 to 4+ months and Raspberry to ~10+ days." },
    schedule:   { title: "5 · Personal schedule mode", desc: "Color-codes your daily routine: cyan for 00:00–06:00 rest, green for 06:00–12:00 deep work, amber for 12:00–18:00 meetings, and coral for 18:00–24:00 evening." },
    sun:        { title: "6 · Sunrise / Sunset mode", desc: "Maps golden daylight hours (06:30–19:30) against deep indigo night hours with a bright white marker at the current time." },
  };

  // --- Global State ---
  let activeSolution = "nrf52"; // Default open tab: nRF52!
  let activeMode = "gradient";
  let minutesOfDay = 930;       // 15:30
  let ambientLux = 80;          // nRF52 VEML7700 lux
  let rpiBrightPct = 10;        // Raspberry Eco PWM %
  let rpiEcoMode = true;        // Raspberry 24-LED + 8h MOSFET night cut
  let activeColorIdx = 0;
  let liveTimer = null;

  const codeTabs = { nrf52: "palette", raspberry: "palette" };
  const codeCache = { nrf52: null, raspberry: null };

  // --- DOM Refs ---
  const hoursEl       = document.getElementById("clock-hours");
  const ticksEl       = document.getElementById("clock-ticks");
  const ledsEl        = document.getElementById("clock-leds");
  const timeSlider    = document.getElementById("time-slider");
  const timeReadout   = document.getElementById("time-readout");
  const luxSlider     = document.getElementById("lux-slider");
  const nrf52Readout  = document.getElementById("nrf52-batt-readout");
  const alsHint       = document.getElementById("als-hint");
  const brightSlider  = document.getElementById("bright-slider");
  const ecoToggle     = document.getElementById("eco-toggle");
  const rpiReadout    = document.getElementById("rpi-batt-readout");
  const ctrlNrf52     = document.getElementById("ctrl-nrf52");
  const ctrlRaspberry = document.getElementById("ctrl-raspberry");
  const colorReadout  = document.getElementById("color-readout");
  const swatchRow     = document.getElementById("swatch-row");
  const liveBtn       = document.getElementById("live-btn");
  const modeTitle     = document.getElementById("mode-title");
  const modeDesc      = document.getElementById("mode-desc");

  const ledNodes = [];

  // --- Solution Tab Switching (nRF52 default | Raspberry) ---
  function setSolution(sol, updateHash = false) {
    if (sol !== "nrf52" && sol !== "raspberry") sol = "nrf52";
    activeSolution = sol;

    document.querySelectorAll(".solution-tab").forEach((btn) => {
      btn.setAttribute("aria-selected", String(btn.dataset.solution === sol));
    });

    document.getElementById("panel-nrf52").hidden = (sol !== "nrf52");
    document.getElementById("panel-raspberry").hidden = (sol !== "raspberry");

    ctrlNrf52.hidden = (sol !== "nrf52");
    ctrlRaspberry.hidden = (sol !== "raspberry");

    // Update top nav anchors to jump cleanly into the active tab's sections
    document.getElementById("nav-case-link").href = `#${sol}-case`;
    document.getElementById("nav-wiring-link").href = `#${sol}-wiring`;
    document.getElementById("nav-bom-link").href = `#${sol}-bom`;
    document.getElementById("nav-fw-link").href = `#${sol}-firmware`;

    if (updateHash && history.replaceState) {
      history.replaceState(null, "", `#${sol}`);
    }

    renderClock();
    updateCodeView("nrf52");
    updateCodeView("raspberry");
  }

  document.querySelectorAll(".solution-tab").forEach((btn) => {
    btn.addEventListener("click", () => setSolution(btn.dataset.solution, true));
  });

  document.getElementById("footer-nrf52")?.addEventListener("click", (e) => {
    e.preventDefault();
    setSolution("nrf52", true);
    document.getElementById("solutions").scrollIntoView({ behavior: "smooth" });
  });
  document.getElementById("footer-rpi")?.addEventListener("click", (e) => {
    e.preventDefault();
    setSolution("raspberry", true);
    document.getElementById("solutions").scrollIntoView({ behavior: "smooth" });
  });

  // --- Build Clock Face ---
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
          updateCodeView("nrf52");
          updateCodeView("raspberry");
        }
      });
      swatchRow.appendChild(btn);
    });
  }

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
    const isPitchDark = (activeSolution === "nrf52" && ambientLux < 2);

    const visualGain = activeSolution === "nrf52"
      ? (isPitchDark ? 0 : 0.42 + (ambientLux / 400) * 0.58)
      : (0.45 + (rpiBrightPct / 40) * 0.55);

    let activeChannelSum = 0;
    let rpiChannelSum = 0;

    for (let i = 0; i < NUM_LEDS; i++) {
      const posRatio = i / (NUM_LEDS - 1);
      const segHour = i * 0.5;
      let rgb = [0, 0, 0];
      let intensity = 0;

      if (!isPitchDark) {
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
          else intensity = 0.12;
        } else if (activeMode === "sun") {
          const isDay = segHour >= 6.5 && segHour < 19.5;
          rgb = isDay ? [255, 195, 70] : [45, 85, 195];
          if (i === fullBlocks) { rgb = [255, 255, 255]; intensity = 1; }
          else if (i < fullBlocks) intensity = 0.82;
          else intensity = 0.18;
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
          ? `0 0 ${Math.round(5 + 9 * adj)}px rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.42 * adj).toFixed(2)})`
          : "none";
        activeChannelSum += ((rgb[0] + rgb[1] + rgb[2]) / 255) * intensity;
        rpiChannelSum += ((rgb[0] + rgb[1] + rgb[2]) / 765) * intensity * (rpiBrightPct / 100);
      } else {
        node.style.backgroundColor = "#1e1e21";
        node.style.boxShadow = "none";
      }
    }

    timeReadout.textContent = formatTime(minutesOfDay);

    // 1. Update nRF52 Runtime Model (1x 18650 3400 mAh direct 3.7V, passive LEDs)
    const perChannelMaxMa = 0.12 + (ambientLux / 400) * 1.08;
    const ledMa = (activeChannelSum / 12) * perChannelMaxMa * 4.0;
    const dayMa = isPitchDark ? 0.004 : (1.2 + ledMa);
    const avgNrfMa = isPitchDark ? 0.004 : ((16 * dayMa + 8 * 0.004) / 24);
    const estDays = Math.round(3400 / (avgNrfMa * 24));
    if (isPitchDark) {
      nrf52Readout.textContent = `${ambientLux} lux · Sleep (~4 µA)`;
      alsHint.textContent = "Pitch dark (<2 lux) → IS31FL3733 hardware shutdown (SDB LOW)";
    } else if (estDays >= 60) {
      nrf52Readout.textContent = `${ambientLux} lux · ~${(estDays / 30).toFixed(1)} mos`;
      alsHint.textContent = `1× 18650 (3400 mAh) · Avg ${avgNrfMa.toFixed(2)} mA/day (~${estDays} days)`;
    } else {
      nrf52Readout.textContent = `${ambientLux} lux · ~${estDays} days`;
      alsHint.textContent = `1× 18650 (3400 mAh) · Avg ${avgNrfMa.toFixed(2)} mA/day`;
    }

    // 2. Update Raspberry Runtime Model (2x 18650 = 4160 mAh @ 5V, WS2812B + lightsleep)
    const activeLedMa48 = rpiChannelSum * 60;
    const avgRpiMa = rpiEcoMode
      ? ((16 * (1.8 + 24 * 0.85 + activeLedMa48 * 0.5) + 8 * 1.8) / 24)
      : (2.0 + 48 * 0.85 + activeLedMa48);
    const estRpiHours = Math.round(4160 / avgRpiMa);
    const rpiStr = estRpiHours >= 48 ? `~${(estRpiHours / 24).toFixed(1)} days` : `~${estRpiHours}h`;
    rpiReadout.textContent = `${rpiBrightPct}% · ${rpiStr}`;
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
    updateCodeView("nrf52");
    updateCodeView("raspberry");
  }

  document.querySelectorAll("#mode-switcher .num-btn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  timeSlider.addEventListener("input", (e) => {
    stopLiveClock();
    minutesOfDay = Number(e.target.value);
    renderClock();
  });

  luxSlider.addEventListener("input", (e) => {
    ambientLux = Number(e.target.value);
    renderClock();
    updateCodeView("nrf52");
  });

  brightSlider.addEventListener("input", (e) => {
    rpiBrightPct = Number(e.target.value);
    renderClock();
    updateCodeView("raspberry");
  });

  ecoToggle.addEventListener("change", (e) => {
    rpiEcoMode = e.target.checked;
    renderClock();
    updateCodeView("raspberry");
  });

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

  // --- Independent 3D Case Gallery Switchers (one per solution panel) ---
  document.querySelectorAll(".solution-panel").forEach((panel) => {
    const imgEl = panel.querySelector(".case-preview-img");
    const capEl = panel.querySelector(".case-caption");
    const switcher = panel.querySelector(".case-switcher");
    if (!switcher || !imgEl) return;
    switcher.querySelectorAll(".num-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        switcher.querySelectorAll(".num-btn").forEach((b) => {
          const active = b === btn;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-selected", String(active));
        });
        imgEl.src = btn.dataset.img;
        if (capEl) capEl.textContent = btn.dataset.caption;
      });
    });
  });

  // --- Per-Solution Firmware Code Viewers ---
  function buildLiveSnippet(sol) {
    const c = FIXED_COLORS[activeColorIdx];
    const modeIdx = ["gradient", "fixed", "monochrome", "calm", "schedule", "sun"].indexOf(activeMode);
    if (sol === "nrf52") {
      const gcc = Math.max(6, Math.min(36, Math.round(6 + ambientLux * 0.08)));
      return `// Live nRF52832 + IS31FL3733 config synced from simulator above
uint8_t activeMode     = ${modeIdx};              // "${activeMode}"
uint8_t globalCurrent  = ${gcc};             // IS31FL3733 GCC @ ${ambientLux} lux

const RGB PRIMARY_COLOR = { ${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]} }; // ${c.name} (${c.hex})`;
    }
    return `# Live Raspberry Pi Pico 2 W config synced from simulator above
NUM_LEDS          = ${rpiEcoMode ? 24 : 48}               # ${rpiEcoMode ? "24 LEDs (144 LED/m = 167 mm) for ~8-10 day battery" : "48 LEDs (30-min blocks)"}
USE_MOSFET_CUTOFF = ${rpiEcoMode ? "True" : "False"}            # Cuts LED rail via GP1 IRLZ44N (23:00-07:00)
DEFAULT_MODE_IDX  = ${modeIdx}                # "${activeMode}"
BRIGHTNESS        = ${(rpiBrightPct / 100).toFixed(2)}             # ${rpiBrightPct}% Eco PWM brightness
PRIMARY_COLOR     = (${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]})    # ${c.name} (${c.hex})`;
  }

  const SETUP_GUIDES = {
    nrf52: `// Flashing & Wireless BLE Customization (nRF52832)
1. Assemble the 240x38 mm 2-layer matte-black PCB (nRF52832, IS31FL3733, 48x 1615 RGB, VEML7700).
2. Flash solutions/nrf52/firmware/linear_clock_nrf52.ino via SWD using Arduino IDE / PlatformIO.
3. Snap 1x 18650 cell into the rear SMD clips and fasten the 36 mm PETG backplate.
4. Hold BTN 1 (2s) anytime to wake BLE and push new palettes or sync exact time.`,
    raspberry: `# 5-Minute Raspberry Pi Pico 2 W Setup (MicroPython)
1. Hold BOOTSEL on your Pico 2 W and plug into USB (RPI-RP2 drive appears).
2. Copy the official MicroPython UF2 from https://micropython.org/download/ onto RPI-RP2.
3. Open Thonny (https://thonny.org/), open solutions/raspberry/firmware/main.py, and save to Pico as "main.py".
4. Unplug USB, flip the 18650 UPS switch ON — press BTN 1/2/3 on the back to cycle modes, brightness & time!`
  };

  async function updateCodeView(sol) {
    const viewer = document.getElementById(`code-viewer-${sol}`);
    if (!viewer) return;
    const tab = codeTabs[sol];
    if (tab === "palette") {
      viewer.textContent = buildLiveSnippet(sol);
    } else if (tab === "setup") {
      viewer.textContent = SETUP_GUIDES[sol];
    } else {
      if (codeCache[sol]) {
        viewer.textContent = codeCache[sol];
      } else {
        viewer.textContent = "// Loading firmware source...";
        const path = sol === "nrf52"
          ? "./solutions/nrf52/firmware/linear_clock_nrf52.ino"
          : "./solutions/raspberry/firmware/main.py";
        try {
          const res = await fetch(path);
          codeCache[sol] = await res.text();
          if (codeTabs[sol] === "full") viewer.textContent = codeCache[sol];
        } catch {
          viewer.textContent = "// Use the Download button above to inspect the full firmware file.";
        }
      }
    }
  }

  document.querySelectorAll(".code-tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      const sol = tabBtn.dataset.sol;
      codeTabs[sol] = tabBtn.dataset.tab;
      document.querySelectorAll(`.code-tab[data-sol="${sol}"]`).forEach((b) => {
        const active = b === tabBtn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", String(active));
      });
      updateCodeView(sol);
    });
  });

  document.querySelectorAll(".copy-code-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const viewer = document.getElementById(`code-viewer-${btn.dataset.sol}`);
      try {
        await navigator.clipboard.writeText(viewer.textContent);
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 1600);
      } catch {
        btn.textContent = "Ctrl+C";
      }
    });
  });

  // --- Boot (nRF52 open by default unless #raspberry hash specified) ---
  initClockFace();
  const initialSol = window.location.hash === "#raspberry" ? "raspberry" : "nrf52";
  setSolution(initialSol, false);
})();
