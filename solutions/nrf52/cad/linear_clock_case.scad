// ============================================================================
// Linear Clock — Ultra-Slim PETG Enclosure for Bambu Lab A1 (256x256x256 mm)
// Optimized Custom PCB Edition:
//   - Single 240 x 38 x 1.6 mm 2-layer matte-black PCB
//   - 48x Passive 1615 SMD RGB LEDs (5.0 mm pitch) + IS31FL3733 Matrix Driver
//   - nRF52832 (BLE + 32.768 kHz RTC) + VEML7700 Ambient Light Sensor
//   - Direct 3.7V Single 18650 SMD Battery Clip + USB-C Charger (Zero 5V Boost!)
//
// Enclosure Dimensions: 250 x 52 x 36 mm (prints flat in one piece on A1!)
// Print Settings (Bambu Lab A1, 0.4 mm nozzle, PETG):
//   - Layer height: 0.20 mm | Walls: 3 | Infill: 15% Gyroid | Supports: None
//   - Bed: Textured PEI @ 70°C | Nozzle: 255°C | ~105 g PETG (~3h 15m)
// ============================================================================

$fn = 48;

// "assembly" | "exploded" | "body" | "baffle" | "diffuser" | "backplate"
part = "assembly";

// --- Primary Dimensions (mm) ---
led_count      = 48;
led_pitch      = 5.0;                     // 5.0 mm pitch across 240 mm PCB
active_w       = led_count * led_pitch;   // 240.0 mm
wall           = 2.6;
outer_w        = active_w + 2 * wall + 4.8; // 250.0 mm (fits 256 mm A1 bed!)
outer_h        = 52.0;                    // Sleeker Scandinavian profile
outer_d        = 36.0;                    // 16 mm slimmer than module build!
corner_r       = 3.2;

// --- Front Window, Diffuser & Baffle ---
bezel          = 4.5;
win_w          = active_w;                // 240.0 mm
win_h          = outer_h - 2 * bezel;     // 43.0 mm
recess_d       = 2.0;
diffuser_t     = 0.8;
baffle_d       = 8.5;                     // Compact optical tunnel for 1615 SMD RGB
baffle_wall    = 0.8;
bar_h          = 21.0;

// --- Single Custom PCB (240 x 38 x 1.6 mm) ---
pcb_w          = 240.0;
pcb_h          = 38.0;
pcb_t          = 1.6;
pcb_y          = wall + recess_d + diffuser_t + baffle_d;

// --- Backplate ---
back_t         = 2.6;
back_clearance = 0.25;

module rounded_front_box(w, h, d, r) {
    hull() {
        for (sx = [-1, 1], sz = [-1, 1]) {
            translate([sx * (w/2 - r), 0, sz * (h/2 - r)])
                rotate([-90, 0, 0])
                    cylinder(h = d, r = r);
        }
    }
}

// --- Part 1: Main Enclosure Body (Slate-Grey PETG) ---
module main_body() {
    difference() {
        rounded_front_box(outer_w, outer_h, outer_d, corner_r);

        // Rear internal cavity
        translate([0, wall + recess_d + diffuser_t, 0])
            rounded_front_box(outer_w - 2*wall, outer_h - 2*wall, outer_d, max(1.0, corner_r - wall));

        // Front recessed window opening
        translate([-win_w/2, -0.5, -win_h/2])
            cube([win_w, wall + recess_d + diffuser_t + 1.5, win_h]);

        // Step lip at rear for flush backplate
        translate([-(outer_w - 2*wall + 1.8)/2, outer_d - back_t, -(outer_h - 2*wall + 1.8)/2])
            cube([outer_w - 2*wall + 1.8, back_t + 0.5, outer_h - 2*wall + 1.8]);
    }

    // Internal PCB stop ledges (top & bottom rails)
    for (sz = [-1, 1]) {
        translate([-pcb_w/2, pcb_y - 2.0, sz * (pcb_h/2 + 0.5) - 1.0])
            cube([pcb_w, 2.0, 2.0]);
    }

    // 4 Corner M2.5/M3 screw bosses for backplate & PCB retention
    for (sx = [-1, 1], sz = [-1, 1]) {
        translate([sx * (outer_w/2 - wall - 3.6), pcb_y + pcb_t, sz * (outer_h/2 - wall - 3.6)])
            difference() {
                rotate([-90, 0, 0]) cylinder(h = outer_d - back_t - (pcb_y + pcb_t), d = 6.2);
                rotate([-90, 0, 0]) cylinder(h = outer_d - back_t - (pcb_y + pcb_t) + 0.5, d = 2.6);
            }
    }
}

// --- Part 2: 48-Segment Light Baffle Grid (Matte Black PETG) ---
module led_baffle() {
    baffle_w = win_w - 0.4;
    baffle_h = bar_h + 3.6;
    translate([0, wall + recess_d + diffuser_t, -win_h/2 + baffle_h/2 + 1.0]) {
        difference() {
            translate([-baffle_w/2, 0, -baffle_h/2])
                cube([baffle_w, baffle_d, baffle_h]);
            for (i = [0 : led_count - 1]) {
                cx = -active_w/2 + (i + 0.5) * led_pitch;
                translate([cx - (led_pitch - baffle_wall)/2, -0.5, -bar_h/2])
                    cube([led_pitch - baffle_wall, baffle_d + 1.0, bar_h]);
            }
        }
    }
}

// --- Part 3: Front Smoked/Diffuser Faceplate + ALS Window ---
module diffuser_faceplate() {
    difference() {
        translate([-win_w/2 + 0.2, wall + recess_d, -win_h/2 + 0.2])
            cube([win_w - 0.4, diffuser_t, win_h - 0.4]);
        // Tiny 2.4 mm aperture for VEML7700 Ambient Light Sensor (upper right)
        translate([win_w/2 - 5.5, wall + recess_d - 0.2, win_h/2 - 4.5])
            rotate([-90, 0, 0]) cylinder(h = diffuser_t + 0.5, d = 2.4);
    }
}

module scale_ticks() {
    for (i = [0 : 48]) {
        tx = -active_w/2 + i * led_pitch;
        is_hour = (i % 2 == 0);
        th = is_hour ? 5.2 : 2.8;
        tw = is_hour ? 0.9 : 0.6;
        translate([tx - tw/2, wall + recess_d - 0.25, 2.2])
            cube([tw, 0.3, th]);
    }
}

// --- Part 4: Sleek Rear Backplate (USB-C + 3 SMD Button Holes) ---
module backplate() {
    bp_w = outer_w - 2*wall + 1.8 - 2*back_clearance;
    bp_h = outer_h - 2*wall + 1.8 - 2*back_clearance;
    translate([0, outer_d - back_t, 0]) {
        difference() {
            translate([-bp_w/2, 0, -bp_h/2])
                cube([bp_w, back_t, bp_h]);

            // 4 Corner M2.5/M3 countersunk screw holes
            for (sx = [-1, 1], sz = [-1, 1]) {
                translate([sx * (outer_w/2 - wall - 3.6), -0.5, sz * (outer_h/2 - wall - 3.6)])
                    rotate([-90, 0, 0]) cylinder(h = back_t + 1.0, d = 3.2);
            }

            // Centered-Right USB-C Charging Port (on-board MCP73831/TP4056)
            translate([86, -0.5, -8])
                hull() {
                    translate([-3.4, 0, 0]) rotate([-90, 0, 0]) cylinder(h = back_t + 1, d = 4.0);
                    translate([ 3.4, 0, 0]) rotate([-90, 0, 0]) cylinder(h = back_t + 1, d = 4.0);
                }

            // 3 Rear Tactile Button Holes (Mode/BLE, Brightness, Color/+15m)
            for (bx = [-22, 0, 22]) {
                translate([bx, -0.5, 0])
                    rotate([-90, 0, 0]) cylinder(h = back_t + 1, d = 5.5);
            }

            // Minimalist BLE antenna RF window / vent slots (left side)
            for (vx = [-98 : 7 : -66]) {
                translate([vx, -0.5, -10])
                    cube([2.0, back_t + 1, 20]);
            }
        }
    }
}

// --- Visual-Only Mockup of the Single Custom 240x38 mm PCB ---
module mock_custom_pcb() {
    // 2-Layer Matte-Black PCB
    color("#1b1d20")
    translate([-pcb_w/2, pcb_y, -pcb_h/2])
        cube([pcb_w, pcb_t, pcb_h]);

    // 48x Passive 1615 SMD RGB LEDs on front face of PCB
    for (i = [0 : led_count - 1]) {
        cx = -active_w/2 + (i + 0.5) * led_pitch;
        color("#f2f2f2")
        translate([cx - 0.8, pcb_y - 0.8, -win_h/2 + 12.5])
            cube([1.6, 0.8, 1.5]);
    }

    // nRF52832 Shielded BLE Module (rear left)
    color("#c8cdd3")
    translate([-86, pcb_y + pcb_t, -6])
        cube([16, 2.2, 12]);

    // IS31FL3733 QFN-48 Matrix Driver IC (rear center-left)
    color("#2c2f33")
    translate([-48, pcb_y + pcb_t, -4])
        cube([8, 1.0, 8]);

    // Single 18650 Battery in SMD Clips (rear right-center)
    color("#2c6fbb")
    translate([8, pcb_y + pcb_t + 9.2, 0])
        rotate([0, 90, 0]) cylinder(h = 65, d = 18.2);
    // Battery clips
    color("#b8bec6")
    for (cx = [6, 73]) {
        translate([cx, pcb_y + pcb_t, -7])
            cube([2.0, 14, 14]);
    }

    // USB-C Receptacle (rear far right)
    color("#c8cdd3")
    translate([81, pcb_y + pcb_t, -10])
        cube([9, 7.5, 3.4]);
}

// --- Render Dispatcher ---
if (part == "body") {
    color("#8c929a") main_body();
} else if (part == "baffle") {
    color("#222222") led_baffle();
} else if (part == "diffuser") {
    color("#141414") diffuser_faceplate();
    color("#ffffff") scale_ticks();
} else if (part == "backplate") {
    color("#8c929a") backplate();
} else if (part == "exploded") {
    translate([0, -26, 0]) {
        color("#181818") diffuser_faceplate();
        color("#ffffff") scale_ticks();
    }
    translate([0, -10, 0]) color("#262626") led_baffle();
    color("#8c929a") main_body();
    translate([0, 18, 0]) mock_custom_pcb();
    translate([0, 44, 0]) color("#8c929a") backplate();
} else {
    color("#8c929a") main_body();
    color("#161616") diffuser_faceplate();
    color("#ffffff") scale_ticks();
    for (i = [0 : 30]) {
        t = i / 30;
        r = t < 0.5 ? 0.05 : (t - 0.5) * 1.9;
        g = t < 0.5 ? 0.85 : 0.85 - (t - 0.5) * 0.45;
        b = t < 0.5 ? 0.35 - t * 0.6 : 0.05;
        cx = -active_w/2 + (i + 0.5) * led_pitch;
        color([r, g, b])
            translate([cx - 1.9, wall + recess_d - 0.1, -win_h/2 + 2.8])
                cube([3.8, 0.25, bar_h]);
    }
    color("#222222") led_baffle();
    color("#8c929a") backplate();
}
