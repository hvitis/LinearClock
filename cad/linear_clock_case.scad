// ============================================================================
// Linear Clock — 3D-Printed PETG Enclosure for Bambu Lab A1 (256x256x256 mm)
// Single-piece 250 mm body designed for 48x WS2812B LEDs (200 LEDs/m, 5mm pitch),
// Raspberry Pi Pico W / Pico 2 W, and 18650 Battery Shield (V3 or V8).
//
// Print Settings (Bambu Lab A1, 0.4 mm nozzle, PETG):
//   - Layer height: 0.20 mm (Standard)
//   - Walls: 3 loops (1.2 mm)
//   - Infill: 15% Gyroid
//   - Supports: None required!
//   - Bed: Textured PEI Plate @ 70°C, Nozzle @ 255°C
//   - Filament: Matte Slate-Grey PETG (body & back), Matte Black PETG (baffle),
//               Natural/White PETG (0.6 mm diffuser)
// ============================================================================

$fn = 48;

// Select which part to export / render:
// "assembly" | "exploded" | "body" | "baffle" | "diffuser" | "backplate"
part = "assembly";

// --- Primary Dimensions (mm) ---
led_count      = 48;          // 48 half-hour blocks (24 hours)
led_pitch      = 5.0;         // 5.0 mm pitch (200 LEDs/m WS2812B-2020/3535)
active_w       = led_count * led_pitch; // 240.0 mm
wall           = 3.0;         // Outer wall thickness
outer_w        = active_w + 2 * wall + 4.0; // 250.0 mm (fits 256mm A1 bed!)
outer_h        = 56.0;        // Front height
outer_d        = 52.0;        // Total depth (fits 18650 shield + Pico W + baffle)
corner_r       = 3.5;         // Subtle Scandinavian edge radius

// --- Front Window & Diffuser ---
bezel          = 5.0;         // Front bezel frame around window
win_w          = active_w;    // 240.0 mm
win_h          = outer_h - 2 * bezel; // 46.0 mm
recess_d       = 2.2;         // Recessed faceplate lip
diffuser_t     = 0.8;         // Translucent PETG diffuser thickness

// --- Baffle Grid ---
baffle_d       = 11.0;        // Depth of light-isolation channels
baffle_wall    = 0.8;         // Thin opaque divider between segments
bar_h          = 22.0;        // Height of glowing LED bars
scale_h        = 18.0;        // Height of 0..24 hour scale above bars

// --- Backplate ---
back_t         = 3.0;
back_clearance = 0.25;        // PETG slip-fit tolerance

// --- Helper: Rounded Box along Y (front-to-back) ---
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
        // Outer shell
        rounded_front_box(outer_w, outer_h, outer_d, corner_r);

        // Main rear internal cavity (open at back Y = outer_d)
        translate([0, wall + recess_d + diffuser_t, 0])
            rounded_front_box(outer_w - 2*wall, outer_h - 2*wall, outer_d, max(1.0, corner_r - wall));

        // Front recessed window opening
        translate([-win_w/2, -0.5, -win_h/2])
            cube([win_w, wall + recess_d + diffuser_t + 1.5, win_h]);

        // Step lip at rear for flush snap/screw backplate
        translate([-(outer_w - 2*wall + 2.0)/2, outer_d - back_t, -(outer_h - 2*wall + 2.0)/2])
            cube([outer_w - 2*wall + 2.0, back_t + 0.5, outer_h - 2*wall + 2.0]);
    }

    // Internal ledge behind diffuser to hold diffuser & baffle
    for (sz = [-1, 1]) {
        translate([-(win_w/2), wall + recess_d + diffuser_t, sz * (win_h/2 + 0.5) - 1.0])
            cube([win_w, 2.0, 2.0]);
    }

    // 4 Corner M3 Brass Heat-Set / Self-Tapping Screw Bosses at back
    for (sx = [-1, 1], sz = [-1, 1]) {
        translate([sx * (outer_w/2 - wall - 4.0), outer_d - back_t - 10.0, sz * (outer_h/2 - wall - 4.0)])
            difference() {
                rotate([-90, 0, 0]) cylinder(h = 10.0, d = 7.0);
                rotate([-90, 0, 0]) cylinder(h = 10.5, d = 2.8);
            }
    }

    // Internal Standoffs for Raspberry Pi Pico W (left side of cavity, 51x21 mm)
    pico_x = -68;
    pico_y = outer_d - back_t - 26;
    for (dx = [-23.5, 23.5], dz = [-5.7, 5.7]) {
        translate([pico_x + dx, pico_y, -outer_h/2 + wall])
            difference() {
                cylinder(h = 5.0, d = 4.6);
                cylinder(h = 5.5, d = 2.0);
            }
    }

    // Internal Retention Rails for 18650 Battery Shield (right side, 98x30 mm)
    batt_x = 42;
    for (dx = [-50.5, 50.5]) {
        translate([batt_x + dx, outer_d - back_t - 30, -outer_h/2 + wall])
            cube([2.0, 26.0, 12.0]);
    }
}

// --- Part 2: 48-Segment Light Baffle Grid (Matte Black PETG) ---
module led_baffle() {
    baffle_w = win_w - 0.4;
    baffle_h = bar_h + 4.0;
    translate([0, wall + recess_d + diffuser_t, -win_h/2 + baffle_h/2 + 1.0]) {
        difference() {
            // Solid block
            translate([-baffle_w/2, 0, -baffle_h/2])
                cube([baffle_w, baffle_d, baffle_h]);

            // 48 individual light tunnels
            for (i = [0 : led_count - 1]) {
                cx = -active_w/2 + (i + 0.5) * led_pitch;
                translate([cx - (led_pitch - baffle_wall)/2, -0.5, -bar_h/2])
                    cube([led_pitch - baffle_wall, baffle_d + 1.0, bar_h]);
            }
        }
        // Rear LED strip mounting shelf
        translate([-baffle_w/2, baffle_d, -baffle_h/2])
            cube([baffle_w, 2.0, 2.5]);
        translate([-baffle_w/2, baffle_d, baffle_h/2 - 2.5])
            cube([baffle_w, 2.0, 2.5]);
    }
}

// --- Part 3: Front Smoked/Diffuser Faceplate (White + Black PETG) ---
module diffuser_faceplate() {
    // Lower glowing LED diffuser window (translucent white PETG)
    translate([-win_w/2 + 0.2, wall + recess_d, -win_h/2 + 0.2])
        cube([win_w - 0.4, diffuser_t, win_h - 0.4]);
}

// --- Part 3b: Hour Scale Tick Marks (Visual / AMS Lite White Layer) ---
module scale_ticks() {
    for (i = [0 : 48]) {
        tx = -active_w/2 + i * led_pitch;
        is_hour = (i % 2 == 0);
        th = is_hour ? 5.5 : 3.0;
        tw = is_hour ? 0.9 : 0.6;
        translate([tx - tw/2, wall + recess_d - 0.25, 2.5])
            cube([tw, 0.3, th]);
    }
}

// --- Part 4: Backplate with USB-C, Switch & 3 Tactile Button Cutouts ---
module backplate() {
    bp_w = outer_w - 2*wall + 2.0 - 2*back_clearance;
    bp_h = outer_h - 2*wall + 2.0 - 2*back_clearance;
    translate([0, outer_d - back_t, 0]) {
        difference() {
            translate([-bp_w/2, 0, -bp_h/2])
                cube([bp_w, back_t, bp_h]);

            // 4 Corner M3 screw countersunk holes
            for (sx = [-1, 1], sz = [-1, 1]) {
                translate([sx * (outer_w/2 - wall - 4.0), -0.5, sz * (outer_h/2 - wall - 4.0)])
                    rotate([-90, 0, 0]) cylinder(h = back_t + 1.0, d = 3.4);
            }

            // USB-C Charging Port Cutout (right side, aligned with 18650 shield)
            translate([82, -0.5, -10])
                hull() {
                    translate([-3.5, 0, 0]) rotate([-90, 0, 0]) cylinder(h = back_t + 1, d = 4.2);
                    translate([ 3.5, 0, 0]) rotate([-90, 0, 0]) cylinder(h = back_t + 1, d = 4.2);
                }

            // Power Slide Switch Cutout
            translate([62, -0.5, -12.5])
                cube([10, back_t + 1, 5.5]);

            // 3 Tactile Button Holes (Mode / Color / Set) — left-center
            for (bx = [-32, -16, 0]) {
                translate([bx, -0.5, 0])
                    rotate([-90, 0, 0]) cylinder(h = back_t + 1, d = 6.5);
            }

            // Subtle ventilation slots
            for (vx = [-95 : 8 : -55]) {
                translate([vx, -0.5, -14])
                    cube([2.2, back_t + 1, 12]);
            }
        }
    }
}

// --- Visual-Only Mockup Components (for assembly & exploded renders) ---
module mock_electronics() {
    // Raspberry Pi Pico W (green PCB 51x21x1.6 mm)
    color("#1b6b3a")
    translate([-68 - 25.5, outer_d - back_t - 36, -outer_h/2 + wall + 5])
        cube([51, 21, 1.8]);
    // Pico W USB port
    color("#c0c0c0")
    translate([-68 - 27, outer_d - back_t - 29.5, -outer_h/2 + wall + 6.8])
        cube([6, 8, 3.2]);

    // 18650 Battery Shield + Cell (right side)
    color("#1a1a1a")
    translate([42 - 49, outer_d - back_t - 32, -outer_h/2 + wall + 1])
        cube([98, 28, 4]);
    color("#2c6fbb")
    translate([42 - 32.5, outer_d - back_t - 18, -outer_h/2 + wall + 14])
        rotate([0, 90, 0]) cylinder(h = 65, d = 18.2);

    // WS2812B LED Strip (white PCB + 48 LEDs)
    color("#f0f0f0")
    translate([-active_w/2, wall + recess_d + diffuser_t + baffle_d + 0.5, -win_h/2 + 9])
        cube([active_w, 1.2, 8]);
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
    // Exploded view along Y axis
    translate([0, -28, 0]) {
        color("#181818") diffuser_faceplate();
        color("#ffffff") scale_ticks();
    }
    translate([0, -10, 0]) color("#262626") led_baffle();
    color("#8c929a") main_body();
    translate([0, 22, 0]) mock_electronics();
    translate([0, 48, 0]) color("#8c929a") backplate();
} else {
    // Assembled view
    color("#8c929a") main_body();
    color("#161616") diffuser_faceplate();
    color("#ffffff") scale_ticks();
    // Glowing gradient LED preview inside window
    for (i = [0 : 30]) {
        t = i / 30;
        r = t < 0.5 ? 0.05 : (t - 0.5) * 1.9;
        g = t < 0.5 ? 0.85 : 0.85 - (t - 0.5) * 0.45;
        b = t < 0.5 ? 0.35 - t * 0.6 : 0.05;
        cx = -active_w/2 + (i + 0.5) * led_pitch;
        color([r, g, b])
            translate([cx - 1.9, wall + recess_d - 0.1, -win_h/2 + 3.0])
                cube([3.8, 0.25, bar_h]);
    }
    color("#222222") led_baffle();
    color("#8c929a") backplate();
}
