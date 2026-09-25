// p5.js 2.x — "XIII" reveal lens
// The cyan version is the ground; a lens reveals the painting underneath.
// Where the lens passes, the painting lingers and slowly dissolves back to cyan.
// Press / hold (or keep a finger down) to magnify.

let sourceImg, cyanImg;
let base, trail;                       // offscreen layers, sized to the displayed image
let fit = { x: 0, y: 0, w: 0, h: 0 };  // where the image sits on screen
let lens = { x: 0, y: 0, r: 60, zoom: 1 };
let target = { x: 0, y: 0 };
let lastInput = -Infinity;

const BG = [206, 216, 237];
const FADE = 6;          // strength of each fade step
const FADE_EVERY = 3;    // fade only every Nth frame (higher = slower disappearance)
const MAX_ZOOM = 1.8;    // magnification while pressed
const IDLE_MS = 2500;    // after this long with no input, the lens drifts on its own
const DRIFT_SPEED = 0.00005; // how fast the idle wander path changes (lower = slower)
const DRIFT_EASE = 0.015;    // how closely the idle lens follows that path (lower = smoother, slower)
const LIFT = 1.1;        // how far above the pointer the lens sits, in lens radii

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

async function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  c.elt.style.touchAction = "none";          // no scrolling / pinch-zoom while touching the canvas
  pixelDensity(min(displayDensity(), 2));    // crisp on retina without killing phone performance

  [sourceImg, cyanImg] = await Promise.all([
    loadImage("XIII430x600.jpg"),
    loadImage("XIII430cyn600.jpg"),
  ]);

  layout();
  lens.x = target.x = fit.x + fit.w / 2;
  lens.y = target.y = fit.y + fit.h / 2;
}

function draw() {
  if (!trail) return; // still loading

  background(...BG);
  updateLens();

  // 1. Let the trail relax back toward the cyan base.
  if (frameCount % FADE_EVERY === 0) {
    trail.tint(255, FADE);
    trail.image(base, 0, 0);
    trail.noTint();
  }

  // 2. Stamp the painting into the trail under the lens (unmagnified).
  const lx = lens.x - fit.x;
  const ly = lens.y - fit.y;
  trail.push();
  trail.clip(() => trail.circle(lx, ly, lens.r * 1.7));
  trail.image(sourceImg, 0, 0, fit.w, fit.h);
  trail.pop();

  image(trail, fit.x, fit.y);

  // 3. The live lens on top, magnified around its center.
  push();
  clip(() => circle(lens.x, lens.y, lens.r * 2));
  translate(lens.x, lens.y);
  scale(lens.zoom);
  translate(-lens.x, -lens.y);
  image(sourceImg, fit.x, fit.y, fit.w, fit.h);
  pop();

  noFill();
  stroke(255, 140);
  strokeWeight(1.5);
  circle(lens.x, lens.y, lens.r * 2);
}

function updateLens() {
  const idle = millis() - lastInput > IDLE_MS;

  if (idle && !reduceMotion) {
    // Slow wander so the piece is alive before anyone touches it.
    const t = millis() * 0.00012;
    target.x = fit.x + noise(t) * fit.w;
    target.y = fit.y + noise(t + 100) * fit.h;
  } else if (!idle) {
    target.x = constrain(mouseX, fit.x, fit.x + fit.w);
    target.y = constrain(mouseY - lensLift(), fit.y, fit.y + fit.h);
  }

  const ease = idle ? 0.03 : 0.18;
  lens.x = lerp(lens.x, target.x, ease);
  lens.y = lerp(lens.y, target.y, ease);

  const wantZoom = mouseIsPressed && !idle ? MAX_ZOOM : 1;
  lens.zoom = lerp(lens.zoom, wantZoom, 0.12);
}

// Lift the lens above the pointer (mouse, finger, or pen) so it isn't hidden.
// Near the bottom of the screen the lift shrinks gradually to zero,
// so the lens can still reach the bottom edge of the painting.
function lensLift() {
  const fullLift = lens.r * LIFT;
  const zone = fullLift * 2;                      // height of the easing band at the bottom
  const t = constrain((height - mouseY) / zone, 0, 1);
  return fullLift * t;
}

// Fit the image inside the window ("contain"), centered, with a small margin.
function layout() {
  const margin = min(width, height) * 0.04;
  const s = min(
    (width - 2 * margin) / sourceImg.width,
    (height - 2 * margin) / sourceImg.height
  );
  fit.w = round(sourceImg.width * s);
  fit.h = round(sourceImg.height * s);
  fit.x = round((width - fit.w) / 2);
  fit.y = round((height - fit.h) / 2);

  lens.r = min(fit.w, fit.h) * 0.3;

  if (base) base.remove();
  if (trail) trail.remove();

  base = createGraphics(fit.w, fit.h);
  base.background(...BG);
  base.tint(255, 200);
  base.image(cyanImg, 0, 0, fit.w, fit.h);

  trail = createGraphics(fit.w, fit.h);
  trail.image(base, 0, 0);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (sourceImg) layout();
}

// In p5 2.x these fire for mouse, touch, and pen alike.
function mouseMoved()   { lastInput = millis(); }
function mouseDragged() { lastInput = millis(); }
function mousePressed() { lastInput = millis(); }