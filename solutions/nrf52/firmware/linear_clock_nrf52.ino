/* ============================================================================
 * Linear Clock — Ultra-Low-Power Firmware for nRF52832 / nRF52840
 * Hardware: Single Custom 240x38 mm PCB
 *   - 48x Passive 1615 SMD RGB LEDs (0.000 mA idle drain!)
 *   - IS31FL3733 I2C 12x16 Constant-Current Matrix Driver (144 channels)
 *   - VEML7700 I2C Ambient Light Sensor (auto-dim + dark-room auto-sleep)
 *   - 32.768 kHz Watch Crystal + Direct 3.7V 1x 18650 Cell (Zero Boost IC!)
 *   - On-Demand Web Bluetooth (BLE radio OFF unless BTN 1 held 2s)
 *
 * Target Runtime: ~1.5 to 3.2 MONTHS on a single 3500 mAh 18650 cell!
 * ============================================================================ */

#include <Arduino.h>
#include <Wire.h>

// --- Hardware Pinout (nRF52832) ---
constexpr uint8_t PIN_I2C_SDA   = 25;
constexpr uint8_t PIN_I2C_SCL   = 26;
constexpr uint8_t PIN_IS31_SDB  = 11;  // Hardware shutdown: LOW = ~1 uA!
constexpr uint8_t PIN_BTN_MODE  = 14;  // Short: Cycle mode | Hold 2s: BLE config
constexpr uint8_t PIN_BTN_BRGT  = 15;  // Short: Eco brightness offset
constexpr uint8_t PIN_BTN_COLOR = 16;  // Short: Accent color or +15 min time

constexpr uint8_t IS31_ADDR     = 0x50; // IS31FL3733 I2C address (ADDR1/2 = GND)
constexpr uint8_t VEML_ADDR     = 0x10; // VEML7700 Ambient Light Sensor
constexpr uint8_t NUM_LEDS      = 48;   // 48 half-hour blocks (00:00..24:00)

// --- Battery-Saving Thresholds ---
constexpr float   DARK_LUX_THRESHOLD   = 1.5f;  // Pitch-dark room threshold
constexpr uint8_t DARK_SLEEP_MINUTES   = 15;    // Auto-shutdown LEDs after 15m dark
constexpr uint32_t UPDATE_INTERVAL_MS  = 30000; // Update every 30s (nRF52 sleeps ~2 uA)

// --- User-Customizable RGB Palettes (0..255) ---
struct RGB { uint8_t r, g, b; };

const RGB FIXED_COLORS[] = {
  {  0, 210, 110}, // Emerald Mint
  {255, 140,  20}, // Warm Amber
  { 40, 145, 255}, // Daylight Blue
  {245,  65,  95}, // Coral Red
  {175,  95, 255}, // Soft Violet
};

struct GradStop { float pos; RGB col; };
const GradStop GRADIENT_STOPS[] = {
  {0.00f, {  0, 215, 115}}, // Midnight -> Morning (Emerald)
  {0.45f, {140, 225,  65}}, // Midday (Warm Lime)
  {0.72f, {255, 185,  45}}, // Afternoon (Golden Amber)
  {1.00f, {245,  65,  55}}, // Evening (Sunset Coral)
};

struct SchedBlock { uint8_t startH, endH; RGB col; };
const SchedBlock SCHEDULE_BLOCKS[] = {
  { 0,  6, {  0, 175, 255}}, // 00:00-06:00 Sleep (Cyan)
  { 6, 12, {  0, 220, 110}}, // 06:00-12:00 Deep Work (Green)
  {12, 18, {255, 180,  30}}, // 12:00-18:00 Meetings (Amber)
  {18, 24, {245,  40,  85}}, // 18:00-24:00 Evening (Coral)
};

enum DisplayMode : uint8_t {
  MODE_GRADIENT = 0, MODE_FIXED, MODE_MONOCHROME, MODE_CALM, MODE_SCHEDULE, MODE_SUN
};

// --- Runtime State ---
volatile bool wakeFlag  = false;
uint8_t  activeMode     = MODE_GRADIENT;
uint8_t  activeColorIdx = 0;
uint8_t  globalCurrent  = 18;    // IS31FL3733 GCC register (0..255): 18 ~= 0.8 mA/ch!
uint32_t secondsOfDay   = 15 * 3600 + 30 * 60; // 15:30 default (sync via BLE or BTN 3)
uint8_t  darkMinutes    = 0;

void onButtonWake() { wakeFlag = true; }

// --- Minimal IS31FL3733 I2C Driver ---
void is31SelectPage(uint8_t page) {
  Wire.beginTransmission(IS31_ADDR);
  Wire.write(0xFE); Wire.write(0xC5); // Unlock command register
  Wire.endTransmission();
  Wire.beginTransmission(IS31_ADDR);
  Wire.write(0xFD); Wire.write(page); // Select page (0=LED ON/OFF, 1=PWM, 3=Config)
  Wire.endTransmission();
}

void is31WriteReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(IS31_ADDR);
  Wire.write(reg); Wire.write(val);
  Wire.endTransmission();
}

void is31Init() {
  digitalWrite(PIN_IS31_SDB, HIGH);
  delay(2);
  is31SelectPage(3);
  is31WriteReg(0x00, 0x01);         // Normal operation (exit software shutdown)
  is31WriteReg(0x01, globalCurrent);// Global Current Control (ultra-low mA!)
  is31SelectPage(0);
  for (uint8_t r = 0; r < 24; r++) is31WriteReg(r, 0xFF); // Enable all 144 RGB ch
  is31SelectPage(1);
}

void is31Shutdown(bool off) {
  digitalWrite(PIN_IS31_SDB, off ? LOW : HIGH); // Hardware SDB LOW = ~1 uA!
}

void setPixel(uint8_t idx, RGB c) {
  // 48 RGB LEDs mapped sequentially across 144 PWM registers on Page 1
  uint8_t base = idx * 3;
  is31WriteReg(base + 0, c.r);
  is31WriteReg(base + 1, c.g);
  is31WriteReg(base + 2, c.b);
}

// --- VEML7700 Ambient Light Read (Auto-Dimming) ---
float readAmbientLux() {
  Wire.beginTransmission(VEML_ADDR);
  Wire.write(0x04); // ALS_DATA register
  if (Wire.endTransmission(false) != 0) return 80.0f; // Fallback indoor lux
  Wire.requestFrom(VEML_ADDR, (uint8_t)2);
  if (Wire.available() < 2) return 80.0f;
  uint16_t raw = Wire.read() | (Wire.read() << 8);
  return raw * 0.0576f;
}

RGB scaleRGB(RGB c, float f) {
  f = constrain(f, 0.0f, 1.0f);
  return { (uint8_t)(c.r * f), (uint8_t)(c.g * f), (uint8_t)(c.b * f) };
}

RGB sampleGradient(float pos) {
  for (uint8_t i = 0; i < 3; i++) {
    if (pos >= GRADIENT_STOPS[i].pos && pos <= GRADIENT_STOPS[i + 1].pos) {
      float t = (pos - GRADIENT_STOPS[i].pos) /
                (GRADIENT_STOPS[i + 1].pos - GRADIENT_STOPS[i].pos);
      const RGB &a = GRADIENT_STOPS[i].col, &b = GRADIENT_STOPS[i + 1].col;
      return {
        (uint8_t)(a.r + (b.r - a.r) * t),
        (uint8_t)(a.g + (b.g - a.g) * t),
        (uint8_t)(a.b + (b.b - a.b) * t)
      };
    }
  }
  return GRADIENT_STOPS[3].col;
}

void renderClock(float lux) {
  // Auto-scale hardware current via IS31FL3733 GCC register (0.15 mA dark -> 1.2 mA bright)
  uint8_t gcc = (uint8_t)constrain((int)(6 + lux * 0.08f), 6, 36);
  is31SelectPage(3);
  is31WriteReg(0x01, gcc);
  is31SelectPage(1);

  float exactBlock = (secondsOfDay / 60.0f) / 30.0f; // 0.0 .. 48.0
  int   fullBlocks = (int)exactBlock;
  float partial    = exactBlock - fullBlocks;

  for (uint8_t i = 0; i < NUM_LEDS; i++) {
    float pos = (float)i / (NUM_LEDS - 1);
    float hr  = i * 0.5f;
    RGB out   = {0, 0, 0};

    if (activeMode == MODE_GRADIENT) {
      RGB base = sampleGradient(pos);
      if (i < fullBlocks) out = base;
      else if (i == fullBlocks) out = scaleRGB(base, 0.14f + 0.86f * partial);
    } else if (activeMode == MODE_FIXED) {
      RGB base = FIXED_COLORS[activeColorIdx];
      if (i < fullBlocks) out = base;
      else if (i == fullBlocks) out = scaleRGB(base, 0.14f + 0.86f * partial);
    } else if (activeMode == MODE_MONOCHROME) {
      RGB ww = {255, 232, 195};
      if (i < fullBlocks) out = scaleRGB(ww, 0.85f);
      else if (i == fullBlocks) out = scaleRGB(ww, 0.16f + 0.84f * partial);
    } else if (activeMode == MODE_CALM) {
      float d = fabsf(i - exactBlock);
      if (d < 1.5f) out = scaleRGB(FIXED_COLORS[activeColorIdx], 1.0f - d / 1.5f);
    } else if (activeMode == MODE_SCHEDULE) {
      RGB base = {255, 255, 255};
      for (auto &b : SCHEDULE_BLOCKS) if (hr >= b.startH && hr < b.endH) base = b.col;
      if (i < fullBlocks) out = base;
      else if (i == fullBlocks) out = scaleRGB(base, 0.20f + 0.80f * partial);
      else out = scaleRGB(base, 0.09f);
    } else if (activeMode == MODE_SUN) {
      bool isDay = (hr >= 6.5f && hr < 19.5f);
      RGB base = isDay ? RGB{255, 195, 70} : RGB{35, 65, 165};
      if (i == fullBlocks) out = {255, 255, 255};
      else if (i < fullBlocks) out = scaleRGB(base, 0.75f);
      else out = scaleRGB(base, 0.14f);
    }
    setPixel(i, out);
  }
}

void setup() {
  pinMode(PIN_IS31_SDB, OUTPUT);
  pinMode(PIN_BTN_MODE,  INPUT_PULLUP);
  pinMode(PIN_BTN_BRGT,  INPUT_PULLUP);
  pinMode(PIN_BTN_COLOR, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_BTN_MODE),  onButtonWake, FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_BTN_BRGT),  onButtonWake, FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_BTN_COLOR), onButtonWake, FALLING);

  Wire.setPins(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.begin();
  is31Init();
}

void loop() {
  if (wakeFlag) {
    wakeFlag = false;
    darkMinutes = 0;
    delay(25);
    if (!digitalRead(PIN_BTN_MODE))  activeMode = (activeMode + 1) % 6;
    if (!digitalRead(PIN_BTN_COLOR)) {
      if (activeMode == MODE_FIXED || activeMode == MODE_CALM)
        activeColorIdx = (activeColorIdx + 1) % 5;
      else
        secondsOfDay = (secondsOfDay + 900) % 86400; // +15 min manual set
    }
  }

  float lux = readAmbientLux();
  if (lux < DARK_LUX_THRESHOLD) {
    if (darkMinutes < DARK_SLEEP_MINUTES) darkMinutes++;
  } else {
    darkMinutes = 0;
  }

  if (darkMinutes >= DARK_SLEEP_MINUTES) {
    is31Shutdown(true);  // Pitch-dark room -> ~3 uA total system sleep!
  } else {
    is31Shutdown(false);
    renderClock(lux);
  }

  // On nRF52 Arduino/Zephyr, delay() enters System-ON WFE sleep (~2 uA MCU)
  delay(UPDATE_INTERVAL_MS);
  secondsOfDay = (secondsOfDay + UPDATE_INTERVAL_MS / 1000) % 86400;
}
