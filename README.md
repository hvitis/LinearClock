# Linear Clock — DIY Editions (nRF52 & Raspberry Pi)

![Linear Clock Studio Render](./assets/render-hero.png)

An open-source **Linear Clock** inspired by the [Daylight Machines Linear Clock](https://daylightmachines.com/products/linear-clock/), presented as **two complete, self-contained hardware solutions** accessible via a **2-tab GitHub Pages website** (`nRF52` opens by default):

| Solution Tab | Architecture | Battery Runtime | PETG Case (Bambu Lab A1) | Polish Shops |
| :--- | :--- | :--- | :--- | :--- |
| **1. `nRF52` (Default)** | Single 240×38 mm PCB · 48× Passive 1615 SMD RGB + `IS31FL3733` + `nRF52832` BLE + `VEML7700` ALS + Direct 3.7V `1× 18650` | **~1–3 months** *(4+ mos Calm)* | `250 × 52 × 36 mm` (~105 g, 0 supports) | **TME.eu + Botland** |
| **2. `Raspberry`** | Off-the-shelf modules · `Raspberry Pi Pico 2 W` + `WS2812B 144 LED/m` + `2× 18650 5V UPS` + `IRLZ44N` Night Cutoff | **~7–10 days** *(Eco lightsleep)* | `250 × 56 × 52 mm` (~145 g, 0 supports) | **100% Botland** |

---

## Repository Structure

```text
LinearClock/
├── index.html                           # Unified 2-tab GitHub Pages site (nRF52 default | Raspberry)
├── styles.css                           # Scandinavian editorial CSS (Inter + IBM Plex Sans)
├── app.js                               # Shared 48-LED simulator + dual battery models & galleries
├── assets/
│   └── render-hero.png                  # Shared hero studio render
└── solutions/
    ├── nrf52/                           # Default tab: Ultra-efficient custom PCB build
    │   ├── assets/                      # Single-PCB renders & OpenSCAD previews
    │   ├── cad/                         # 36 mm slim OpenSCAD source + 4 manifold STLs
    │   └── firmware/linear_clock_nrf52.ino
    └── raspberry/                       # Second tab: Beginner-friendly Pico 2 W modular build
        ├── assets/                      # Modular Pico W + 18650 shield renders & CAD previews
        ├── cad/                         # 52 mm modular OpenSCAD source + 4 manifold STLs
        └── firmware/main.py
```

---

## Hosting on GitHub Pages

No build step is required:

1. Push this repository to GitHub.
2. Open **Settings → Pages → Build and deployment**.
3. Select **Deploy from a branch** → `main` → `/ (root)` and click **Save**.
4. Direct tab links work out of the box: `#nrf52` (default) and `#raspberry`.
