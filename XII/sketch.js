// Tree planting sketch, updated for p5.js 2.x
// Responsive: the landscape and every planted tree rescale together
// on phones, iPads (including rotation) and desktop.

// ---------- Tunable settings ----------
const LANDSCAPE_FILE = "PL3.png";
const TREE_FILES = [
  "Tree1.png", "Tree2.png", "Tree3.png",
  "Tree4.png", "Tree5.png", "Tree6.png",
  "Tree7.png", "Tree8.png", "Tree9.png",
];

const HORIZON = 0.15;         // top fraction of the landscape image where planting is blocked
const BASE_TREE_SIZE = 200;   // tree size at the front edge, in landscape-image pixels
const FAR_TREE_SCALE = 0.1;   // trees at the horizon are this fraction of BASE_TREE_SIZE
const LAND_MIN_HEIGHT = 0.55; // landscape always fills at least this fraction of screen height
const MIN_ERASE_RADIUS = 22;  // px; keeps tiny distant trees easy to erase with a finger
const GROW_TIME = 900;        // ms for a tree to grow in (0 = appear instantly)
const GROW_OVERSHOOT = 1.6;   // springiness at the end of the growth; 0 = none
const WIND_STRENGTH = 0.06;   // how far treetops lean in a gust, as a fraction of tree height (0 = no wind)
const WIND_SPEED = 0.25;      // how quickly gusts rise and fade
const GUST_TRAVEL = 1.2;      // seconds for a gust to sweep across the landscape, left to right
const FLUTTER = 0.012;        // small constant quiver on top of the gusts
// Loading: the scene stays hidden on white until every image has loaded,
// then fades in from white all at once (same as XXVI)
const REVEAL_MS = 800; // length of the fade-in in milliseconds (0 = appear instantly)
const LOADING_TEXT = 'loading...'; // shown in the middle while loading ('' = none)

// Night into dawn: the more trees are planted, the closer the sky gets to sunrise
const TREES_FOR_DAWN = 25;    // trees needed for full dawn
const DAWN_EASE = 0.03;       // how quickly the sky catches up after each tree (0-1; higher = faster)
const STAR_COUNT = 140;
const SUN_X = 0.62;           // where the dawn glow rises, as a fraction of screen width

// Sky colours [top, middle, horizon] as rgb. Night matches the original gradient.
const SKY_STAGES = [
  { at: 0,   sky: [[2, 9, 20],    [48, 60, 80],    [94, 112, 140]] },  // night
  { at: 0.5, sky: [[10, 18, 46],  [62, 58, 104],   [176, 118, 136]] }, // first light
  { at: 1,   sky: [[56, 94, 156], [178, 156, 176], [255, 184, 126]] }, // dawn
];

// ---------- State ----------
let landscape;
let trees = [];
let placedTrees = [];   // positions stored in landscape-image coordinates
let nextTree = 0;
let isEraseMode = false;
let ready = false;
let cnv;
let toggleButton;
let errorMessage = '';    // replaces the loading text if loading fails
let revealStart = null;   // when the fade-in began
let revealFinished = false;
let dawnLevel = 0;  // 0 = night, 1 = dawn; eases toward the target set by the tree count
let stars = [];
let land = { x: 0, y: 0, w: 0, h: 0, s: 1 }; // where the landscape is drawn on screen

// ---------- Setup (async replaces preload in p5.js 2.x) ----------
async function setup() {
  const holder = select("#sketch-holder");
  cnv = createCanvas(windowWidth, windowHeight);
  if (holder) {
    cnv.parent(holder);
    holder.style("position", "relative");
  }
  cnv.style("display", "block");
  pixelDensity(min(displayDensity(), 2)); // sharp on Retina without overloading phones
  imageMode(CENTER);

  makeToggleButton(holder);
  setupPointerInput();
  drawLoading(); // white screen with the loading text while images load

  // This sketch needs p5.js 2.x (async setup); 1.x silently breaks it
  if (!p5.VERSION || parseInt(p5.VERSION) < 2) {
    showMessage(`This sketch needs p5.js 2.x, but p5.js ${p5.VERSION} is loaded.\nUpdate the p5.js script link on the page.`);
    return;
  }

  // Load everything in parallel; one bad file no longer stops the others
  const results = await Promise.allSettled(
    [LANDSCAPE_FILE, ...TREE_FILES].map((f) => loadImage(f))
  );
  const failed = [LANDSCAPE_FILE, ...TREE_FILES].filter((f, i) => results[i].status === "rejected");
  failed.forEach((f) => console.error("Could not load image:", f));

  if (results[0].status === "rejected") {
    showMessage(`Could not load ${LANDSCAPE_FILE}.\nCheck that the file path or URL is correct.`);
    return;
  }
  landscape = results[0].value;
  trees = results.slice(1).filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (trees.length === 0) {
    showMessage("Could not load any tree images.\nCheck that the file paths or URLs are correct.");
    return;
  }

  stars = Array.from({ length: STAR_COUNT }, () => ({
    u: random(),
    v: pow(random(), 1.6) * 0.75,   // denser toward the top of the sky
    r: random(0.5, 1.7),
    phase: random(TWO_PI),
    rate: random(0.4, 1.4),
  }));

  ready = true;
  computeLayout();
  frameRate(30); // gentle motion doesn't need 60fps; easier on phone batteries
  revealStart = millis();
  toggleButton.style("transition", `opacity ${REVEAL_MS}ms ease`);
  toggleButton.style("opacity", "1"); // button fades in with the scene
  loop(); // animate the fade-in; draw() stops the loop when nothing is moving
}

// Runs while trees are growing or swaying, and switches itself off when nothing moves
function draw() {
  if (!ready) return;
  updateDawn();
  redrawScene();
  const growing = placedTrees.some((t) => growthOf(t) < 1);
  const sunrising = abs(dawnTarget() - dawnLevel) > 0.001;
  const revealing = !revealFinished;
  if (!growing && !windActive() && !sunrising && !revealing) noLoop();
}

function dawnTarget() {
  return min(placedTrees.length / TREES_FOR_DAWN, 1);
}

// Ease the sky toward the target so each tree nudges the dawn along gradually
function updateDawn() {
  const target = dawnTarget();
  dawnLevel = prefersReducedMotion() ? target : lerp(dawnLevel, target, DAWN_EASE);
  if (abs(target - dawnLevel) < 0.001) dawnLevel = target;
}

function windActive() {
  return WIND_STRENGTH > 0 && placedTrees.length > 0 && !prefersReducedMotion();
}

// How far a tree leans right now: a slow gust that travels across the
// landscape, plus a small per-tree flutter so neighbours don't move in lockstep
function windLean(t, seconds) {
  if (!windActive()) return 0;
  const delay = (t.ix / landscape.width) * GUST_TRAVEL;
  const n = noise((seconds - delay) * WIND_SPEED);
  const gust = constrain(map(n, 0.25, 0.75, 0, 1), 0, 1);
  const flutter = sin(seconds * TWO_PI * t.flutterRate + t.seed * 10) * FLUTTER * (0.4 + gust);
  const nearness = lerp(0.6, 1, t.size / BASE_TREE_SIZE); // closer trees move a little more
  return (WIND_STRENGTH * (0.2 + gust) + flutter) * nearness;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (ready) computeLayout();
  redrawScene();
}

// ---------- Layout ----------
// Scale the landscape to cover the full width (and at least LAND_MIN_HEIGHT of
// the screen), anchored to the bottom and centered horizontally.
function computeLayout() {
  const s = max(width / landscape.width, (height * LAND_MIN_HEIGHT) / landscape.height);
  land.s = s;
  land.w = landscape.width * s;
  land.h = landscape.height * s;
  land.x = (width - land.w) / 2;
  land.y = height - land.h;
}

function screenToLand(x, y) {
  return { ix: (x - land.x) / land.s, iy: (y - land.y) / land.s };
}

function landToScreen(ix, iy) {
  return { x: land.x + ix * land.s, y: land.y + iy * land.s };
}

// ---------- Drawing ----------
function redrawScene() {
  // Nothing but the loading text until every image has arrived
  if (revealStart === null) {
    drawLoading();
    return;
  }

  drawSky();
  drawDawnGlow();
  drawStars();

  image(landscape, land.x + land.w / 2, land.y + land.h / 2, land.w, land.h);

  // placedTrees is kept sorted far-to-near, so nearer trees overlap farther ones
  const seconds = millis() / 1000;
  for (const t of placedTrees) {
    const p = landToScreen(t.ix, t.iy);
    const d = fitSize(t.img, t.size * land.s);
    const g = growthOf(t);
    if (g <= 0) continue;

    // Grow upward from the base: height leads, width follows a little behind
    const k = easeOutBack(g);
    const h = d.h * k;
    const w = d.w * lerp(0.35, 1, k);
    const baseY = p.y + d.h / 2;

    // Bend with the wind: shear keeps the base planted while the top moves
    const lean = windLean(t, seconds);
    push();
    translate(p.x, baseY);
    drawingContext.transform(1, 0, -lean, 1, 0, 0);
    drawingContext.globalAlpha = constrain(g * 3, 0, 1); // quick fade-in at the start
    image(t.img, 0, -h / 2, w, h);
    pop();
  }

  // Fade in from white: a white cover over the scene that thins out
  const r = REVEAL_MS > 0 ? constrain((millis() - revealStart) / REVEAL_MS, 0, 1) : 1;
  if (r < 1) {
    noStroke();
    fill(255, 255 * (1 - r));
    rect(0, 0, width, height);
  } else {
    revealFinished = true;
  }
}

function drawLoading() {
  background(255);
  const msg = errorMessage || LOADING_TEXT;
  if (!msg) return;
  noStroke();
  fill('#414141');
  textSize(12);
  textAlign(CENTER, CENTER);
  text(msg, width * 0.1, 0, width * 0.8, height);
}

// 0 → 1 over GROW_TIME since the tree was planted
function growthOf(t) {
  if (GROW_TIME <= 0 || prefersReducedMotion()) return 1;
  return constrain((millis() - t.born) / GROW_TIME, 0, 1);
}

// Eases out with a small springy overshoot, like a sapling settling
function easeOutBack(x) {
  const c1 = GROW_OVERSHOOT;
  const c3 = c1 + 1;
  return 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Shown in place of the loading text if something goes wrong
function showMessage(msg) {
  errorMessage = msg;
  drawLoading();
}

function drawSky() {
  const [top, mid, horizon] = skyColorsAt(dawnLevel);
  const ctx = drawingContext;
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, top);
  g.addColorStop(0.5, mid);
  g.addColorStop(1, horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

// Blend between the two SKY_STAGES on either side of `level`
function skyColorsAt(level) {
  let i = 0;
  while (i < SKY_STAGES.length - 2 && level > SKY_STAGES[i + 1].at) i++;
  const a = SKY_STAGES[i], b = SKY_STAGES[i + 1];
  const t = constrain((level - a.at) / (b.at - a.at), 0, 1);
  return a.sky.map((c, k) => {
    const m = c.map((v, j) => round(lerp(v, b.sky[k][j], t)));
    return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
  });
}

// A warm glow behind the hills where the sun is about to come up
function drawDawnGlow() {
  if (dawnLevel <= 0) return;
  const ctx = drawingContext;
  const cx = width * SUN_X;
  const cy = land.y + landscape.height * HORIZON * land.s;
  const r = max(width, height) * lerp(0.35, 0.75, dawnLevel);
  const a = 0.6 * pow(dawnLevel, 1.3);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(255, 214, 150, ${a})`);
  g.addColorStop(0.4, `rgba(255, 170, 130, ${a * 0.45})`);
  g.addColorStop(1, "rgba(255, 150, 130, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

// Stars twinkle at night and fade out as dawn arrives, lowest ones first
function drawStars() {
  const fade = 1 - constrain(dawnLevel * 1.5, 0, 1);
  if (fade <= 0) return;
  const seconds = millis() / 1000;
  push();
  noStroke();
  for (const s of stars) {
    const twinkle = 0.65 + 0.35 * sin(seconds * s.rate + s.phase);
    const heightFade = constrain(1 - (s.v / 0.75) * dawnLevel * 2, 0, 1);
    fill(255, 250, 235, 255 * fade * twinkle * heightFade * (1 - s.v * 0.6));
    circle(s.u * width, s.v * height, s.r * 2);
  }
  pop();
}

// Keep each tree's aspect ratio; its longest side equals `size`
function fitSize(img, size) {
  const r = img.width / img.height;
  return r >= 1 ? { w: size, h: size / r } : { w: size * r, h: size };
}

// ---------- Planting and erasing ----------
function placeTree(x, y) {
  const { ix, iy } = screenToLand(x, y);
  const horizonY = landscape.height * HORIZON;
  if (iy < horizonY || iy > landscape.height || ix < 0 || ix > landscape.width) return;

  const depth = map(iy, horizonY, landscape.height, FAR_TREE_SCALE, 1);
  const img = trees[nextTree];
  nextTree = (nextTree + 1) % trees.length;

  placedTrees.push({ ix, iy, size: BASE_TREE_SIZE * depth, img,
    born: millis(), seed: random(), flutterRate: random(0.5, 0.9) });
  placedTrees.sort((a, b) => a.iy - b.iy);
  loop(); // start the animation; draw() stops it when growing is done
}

function eraseTreeAt(x, y) {
  // Check nearest (front-most) trees first
  for (let i = placedTrees.length - 1; i >= 0; i--) {
    const t = placedTrees[i];
    const p = landToScreen(t.ix, t.iy);
    const r = max((t.size * land.s) / 2 + 10, MIN_ERASE_RADIUS);
    if (dist(x, y, p.x, p.y) < r) {
      placedTrees.splice(i, 1);
      loop(); // lets the sky ease back toward night
      return;
    }
  }
}

// ---------- Input ----------
// p5.js 2.x removed touchStarted/touchMoved/touchEnded. Native pointer events
// handle mouse, touch and stylus with one code path and no double-firing.
function setupPointerInput() {
  const el = cnv.elt;
  el.style.touchAction = "none"; // no scrolling or zooming while drawing on the canvas
  const active = new Set();

  const localPos = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const erasing = (e) => isEraseMode || e.shiftKey; // Shift still erases on desktop

  el.addEventListener("pointerdown", (e) => {
    if (!ready) return;
    active.add(e.pointerId);
    el.setPointerCapture(e.pointerId);
    const p = localPos(e);
    erasing(e) ? eraseTreeAt(p.x, p.y) : placeTree(p.x, p.y);
  });

  el.addEventListener("pointermove", (e) => {
    if (!ready || !active.has(e.pointerId) || !erasing(e)) return;
    const p = localPos(e);
    eraseTreeAt(p.x, p.y);
  });

  const release = (e) => active.delete(e.pointerId);
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
}

function makeToggleButton(holder) {
  toggleButton = createButton("switch to erase mode");
  if (holder) toggleButton.parent(holder);

  const styles = {
    position: "absolute",
    top: "calc(env(safe-area-inset-top, 0px) + 16px)",
    left: "calc(env(safe-area-inset-left, 0px) + 16px)",
    "z-index": "9999",
    "background-color": "#F1EBCA",
    color: "#2e2e2e",
    "font-family": "sans-serif",
    "font-size": "clamp(12px, 0.6vw + 9px, 16px)", // grows a little on larger screens
    padding: "0.55em 0.9em",
    "min-height": "36px",                         // comfortable tap target on phones
    border: "none",
    "border-radius": "8px",
    cursor: "pointer",
    "touch-action": "manipulation",
    "pointer-events": "auto", // keeps the Wix iOS fix
    opacity: "0", // hidden until the scene loads, then fades in with it
  };
  for (const [k, v] of Object.entries(styles)) toggleButton.style(k, v);

  // 'click' fires once for both mouse and touch
  toggleButton.elt.addEventListener("click", (e) => {
    e.stopPropagation();
    isEraseMode = !isEraseMode;
    toggleButton.html(isEraseMode ? "switch to plant mode" : "switch to erase mode");
    cnv.style("cursor", isEraseMode ? "crosshair" : "default");
  });
}