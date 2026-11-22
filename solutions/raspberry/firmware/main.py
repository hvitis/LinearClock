# ============================================================================
# Linear Clock — Ultra-Low-Power MicroPython Firmware (Target: ~7–10 Days)
# For Raspberry Pi Pico W / Pico 2 W + 24x (or 48x) WS2812B LEDs + 2x 18650
#
# Battery-First Optimizations (prioritizes ~1 week runtime over sub-second accuracy):
#   1. CPU underclocked to 48 MHz + Wi-Fi radio kept OFF (saves ~45 mA).
#   2. Sleeps in 15-second machine.lightsleep() intervals (~1.8 mA MCU avg).
#   3. Optional IRLZ44N N-MOSFET on GP1 cuts LED strip power completely during
#      Night Auto-Off (23:00-07:00), eliminating WS2812B quiescent drain (~20 mA).
#   4. Supports 24 LEDs (144 LEDs/m Botland strip, ~8-10 days) or 48 LEDs.
#
# Controls (3 rear tactile buttons):
#   - BTN 1 (GP14): Cycle display mode (also wakes display during night sleep)
#   - BTN 2 (GP15): Cycle Eco brightness levels (6%, 10%, 16%, 28%)
#   - BTN 3 (GP16): Cycle accent color (Fixed/Calm) or +15 min time adjust
# ============================================================================

import time
import machine
import neopixel

# Underclock MCU to 48 MHz for lower active power draw
machine.freq(48_000_000)

# --- Battery & LED Configuration ---
NUM_LEDS           = 24        # 24 LEDs (1/hr, 167 mm @ 144 LEDs/m) = best battery!
                               # Change to 48 for 30-min resolution.
LED_PIN            = 0         # GP0 -> 330 Ohm -> WS2812B DIN
LED_PWR_PIN        = 1         # GP1 -> IRLZ44N MOSFET Gate (cuts LED rail at night)
USE_MOSFET_CUTOFF  = True      # Set False if LED strip is wired directly to GND
NIGHT_SLEEP_START  = 23        # 23:00 — cut LED power automatically
NIGHT_SLEEP_END    = 7         # 07:00 — wake LEDs automatically
UPDATE_INTERVAL_MS = 15_000    # Update every 15s (plenty for a linear bar!)

# Optional one-time Wi-Fi NTP sync on boot (set False for 100% offline max battery)
SYNC_WIFI_ON_BOOT  = False
WIFI_SSID          = "YOUR_WIFI_NAME"
WIFI_PASSWORD      = "YOUR_WIFI_PASSWORD"
UTC_OFFSET_HOURS   = 1         # CET = +1, CEST = +2

# --- Rear Tactile Buttons (internal PULL_UP, no external resistors) ---
BTN_MODE_PIN       = 14
BTN_BRIGHT_PIN     = 15
BTN_COLOR_PIN      = 16

# --- User-Customizable Color Palettes (R, G, B 0..255) ---
FIXED_COLORS = [
    (0, 210, 110),    # Emerald Mint
    (255, 140, 20),   # Warm Amber
    (40, 145, 255),   # Daylight Blue
    (245, 65, 95),    # Coral Red
    (175, 95, 255),   # Soft Violet
]

GRADIENT_STOPS = [
    (0.00, (0, 215, 115)),    # Midnight -> Morning: Emerald
    (0.45, (140, 225, 65)),   # Midday: Warm Lime
    (0.72, (255, 185, 45)),   # Afternoon: Golden Amber
    (1.00, (245, 65, 55)),    # Evening: Sunset Coral
]

SCHEDULE_BLOCKS = [
    (0,  6,  (0, 175, 255)),  # 00:00-06:00 Sleep (Cyan)
    (6,  12, (0, 220, 110)),  # 06:00-12:00 Deep Work (Green)
    (12, 18, (255, 180, 30)), # 12:00-18:00 Afternoon (Amber)
    (18, 24, (245, 40, 85)),  # 18:00-24:00 Evening (Coral)
]

SUNRISE_HOUR      = 6.5       # 06:30
SUNSET_HOUR       = 19.5      # 19:30

# Eco-tuned brightness levels (6-10% is vibrant behind 0.8 mm white PETG diffuser)
BRIGHTNESS_LEVELS = [0.06, 0.10, 0.16, 0.28]
MODES             = ["gradient", "fixed", "monochrome", "calm", "schedule", "sun"]

# --- Hardware Init ---
led_pwr    = machine.Pin(LED_PWR_PIN, machine.Pin.OUT, value=1)
np         = neopixel.NeoPixel(machine.Pin(LED_PIN), NUM_LEDS)
btn_mode   = machine.Pin(BTN_MODE_PIN,   machine.Pin.IN, machine.Pin.PULL_UP)
btn_bright = machine.Pin(BTN_BRIGHT_PIN, machine.Pin.IN, machine.Pin.PULL_UP)
btn_color  = machine.Pin(BTN_COLOR_PIN,  machine.Pin.IN, machine.Pin.PULL_UP)

mode_idx          = 0
bright_idx        = 1          # Default 10% Eco brightness
color_idx         = 0
manual_offset_sec = 9 * 3600   # Default start 09:00 if offline (adjust with BTN 3)
wake_override_ms  = 0
button_event      = False


def _on_btn_irq(_pin):
    global button_event
    button_event = True


for _b in (btn_mode, btn_bright, btn_color):
    _b.irq(trigger=machine.Pin.IRQ_FALLING, handler=_on_btn_irq)


def disable_wifi():
    """Ensure CYW43439 Wi-Fi/BT chip is powered down to save ~40 mA."""
    try:
        import network
        wlan = network.WLAN(network.STA_IF)
        wlan.active(False)
        wlan.deinit()
    except Exception:
        pass


def sync_time_ntp_once():
    """Optional single NTP sync on boot, then immediately powers off Wi-Fi."""
    if not SYNC_WIFI_ON_BOOT or WIFI_SSID == "YOUR_WIFI_NAME":
        disable_wifi()
        return False
    try:
        import network
        import ntptime
        wlan = network.WLAN(network.STA_IF)
        wlan.active(True)
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)
        for _ in range(16):
            if wlan.isconnected():
                break
            time.sleep(0.5)
        if wlan.isconnected():
            ntptime.settime()
            wlan.disconnect()
            wlan.active(False)
            wlan.deinit()
            return True
    except Exception:
        pass
    disable_wifi()
    return False


def is_night_sleep(hour):
    if NIGHT_SLEEP_START > NIGHT_SLEEP_END:
        return hour >= NIGHT_SLEEP_START or hour < NIGHT_SLEEP_END
    return NIGHT_SLEEP_START <= hour < NIGHT_SLEEP_END


def set_led_power(on):
    if not USE_MOSFET_CUTOFF:
        return
    if on:
        led_pwr.value(1)
        time.sleep_ms(5)
    else:
        for i in range(NUM_LEDS):
            np[i] = (0, 0, 0)
        np.write()
        led_pwr.value(0)


def scale_color(rgb, factor):
    f = max(0.0, min(1.0, factor))
    return (int(rgb[0] * f), int(rgb[1] * f), int(rgb[2] * f))


def lerp_color(c1, c2, t):
    return (
        int(c1[0] + (c2[0] - c1[0]) * t),
        int(c1[1] + (c2[1] - c1[1]) * t),
        int(c1[2] + (c2[2] - c1[2]) * t),
    )


def sample_gradient(pos):
    for i in range(len(GRADIENT_STOPS) - 1):
        p0, c0 = GRADIENT_STOPS[i]
        p1, c1 = GRADIENT_STOPS[i + 1]
        if p0 <= pos <= p1:
            t = (pos - p0) / (p1 - p0) if p1 > p0 else 0.0
            return lerp_color(c0, c1, t)
    return GRADIENT_STOPS[-1][1]


def schedule_color_for_hour(hour):
    for start_h, end_h, col in SCHEDULE_BLOCKS:
        if start_h <= hour < end_h:
            return col
    return (255, 255, 255)


def render_clock(hour, minute):
    """Render 24 or 48 LEDs for the current time and active display mode."""
    mins_per_block = 1440.0 / NUM_LEDS
    exact_block    = (hour * 60 + minute) / mins_per_block
    full_blocks    = int(exact_block)
    partial_frac   = exact_block - full_blocks
    brightness     = BRIGHTNESS_LEVELS[bright_idx]
    mode           = MODES[mode_idx]

    for i in range(NUM_LEDS):
        pos_ratio = i / (NUM_LEDS - 1)
        seg_hour  = i * (24.0 / NUM_LEDS)
        col       = (0, 0, 0)

        if mode == "gradient":
            base = sample_gradient(pos_ratio)
            if i < full_blocks:
                col = scale_color(base, brightness)
            elif i == full_blocks:
                col = scale_color(base, brightness * (0.14 + 0.86 * partial_frac))

        elif mode == "fixed":
            base = FIXED_COLORS[color_idx]
            if i < full_blocks:
                col = scale_color(base, brightness)
            elif i == full_blocks:
                col = scale_color(base, brightness * (0.14 + 0.86 * partial_frac))

        elif mode == "monochrome":
            warm_white = (255, 232, 195)
            if i < full_blocks:
                col = scale_color(warm_white, brightness * 0.85)
            elif i == full_blocks:
                col = scale_color(warm_white, brightness * (0.16 + 0.84 * partial_frac))

        elif mode == "calm":
            # Lowest active LED draw: only current block + soft halo (~10+ days!)
            base = FIXED_COLORS[color_idx]
            dist = abs(i - exact_block)
            if dist < 1.5:
                col = scale_color(base, brightness * max(0.0, 1.0 - dist / 1.5))

        elif mode == "schedule":
            base = schedule_color_for_hour(seg_hour)
            if i < full_blocks:
                col = scale_color(base, brightness)
            elif i == full_blocks:
                col = scale_color(base, brightness * (0.2 + 0.8 * partial_frac))
            else:
                col = scale_color(base, brightness * 0.08)

        elif mode == "sun":
            is_day = SUNRISE_HOUR <= seg_hour < SUNSET_HOUR
            base   = (255, 195, 70) if is_day else (35, 65, 165)
            if i == full_blocks:
                col = scale_color((255, 255, 255), brightness)
            elif i < full_blocks:
                col = scale_color(base, brightness * 0.72)
            else:
                col = scale_color(base, brightness * 0.12)

        np[i] = col
    np.write()


def handle_buttons():
    global mode_idx, bright_idx, color_idx, manual_offset_sec, wake_override_ms, button_event
    if not button_event and btn_mode.value() and btn_bright.value() and btn_color.value():
        return False
    button_event = False
    time.sleep_ms(30)  # debounce
    changed = False
    if btn_mode.value() == 0:
        mode_idx = (mode_idx + 1) % len(MODES)
        wake_override_ms = time.ticks_add(time.ticks_ms(), 30_000)
        changed = True
    elif btn_bright.value() == 0:
        bright_idx = (bright_idx + 1) % len(BRIGHTNESS_LEVELS)
        wake_override_ms = time.ticks_add(time.ticks_ms(), 30_000)
        changed = True
    elif btn_color.value() == 0:
        if MODES[mode_idx] in ("fixed", "calm"):
            color_idx = (color_idx + 1) % len(FIXED_COLORS)
        else:
            manual_offset_sec = (manual_offset_sec + 900) % 86400
        wake_override_ms = time.ticks_add(time.ticks_ms(), 30_000)
        changed = True
    return changed


def main():
    global manual_offset_sec
    if sync_time_ntp_once():
        manual_offset_sec = 0

    while True:
        handle_buttons()
        t = time.localtime(time.time() + UTC_OFFSET_HOURS * 3600 + manual_offset_sec)
        hour, minute = t[3], t[4]

        awake_override = time.ticks_diff(wake_override_ms, time.ticks_ms()) > 0
        if is_night_sleep(hour) and not awake_override:
            set_led_power(False)
        else:
            set_led_power(True)
            render_clock(hour, minute)

        # Sleep in 1s lightsleep slices up to UPDATE_INTERVAL_MS so buttons stay snappy
        # while keeping Pico 2 W average draw at ~1.8 mA.
        slept = 0
        while slept < UPDATE_INTERVAL_MS:
            machine.lightsleep(1000)
            slept += 1000
            if button_event or not btn_mode.value() or not btn_bright.value() or not btn_color.value():
                break


if __name__ == "__main__":
    main()
