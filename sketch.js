// Layered image sketch: hue drift, fade-in from grey, and parallax (touch or hover).
// Scales to fit any screen, including mobile. Works in p5.js 1.x and 2.x.
// ---- Layers, listed BACK to FRONT: later images are drawn on top ----
// file:        image file name
// depth:       parallax movement (0 = still, 1 = most)
// hueStart:    starting hue shift in degrees (0 = original colors)
// hueShift:    largest random hue jump per cycle, in degrees (0 = no drift, 180 = any color)
// hueSeconds:  how long each hue change takes
// hueDirection: 'random', 'forward' (always rotates one way) or 'backward'
const LAYERS = [
  { file: 'XXVbackground.png', depth: 0.05, hueStart: 0, hueShift: 120,  hueSeconds: 20, hueDirection: 'random' },
  { file: 'XXVback.png',       depth: 0.2,  hueStart: 0, hueShift: 120,  hueSeconds: 15, hueDirection: 'random' },
  { file: 'XXVmiddleback.png', depth: 0.4,  hueStart: 0, hueShift: 180, hueSeconds: 10, hueDirection: 'random' },
  { file: 'XXVmiddle.png',     depth: 0.7,  hueStart: 0, hueShift: 180, hueSeconds: 10, hueDirection: 'random' },
  { file: 'XXVfront.png',      depth: 1.0,  hueStart: 0, hueShift: 180, hueSeconds: 5, hueDirection: 'random' }
];

const ART_W = 1366;
const ART_H = 1021;
const FIT_MODE = 'contain';   // 'contain' or 'cover'
const BG_COLOR = 255;

// ---- Loading ----
// The painting stays hidden until every layer has loaded, then fades in
// all at once from white, so no layer appears on its own while the others download.
const REVEAL_MS = 800;              // length of the fade-in in milliseconds (0 = appear instantly)
const LOADING_TEXT = 'loading...';  // shown in the middle while loading ('' = none)

// ---- Saturation settings ----
const START_SATURATION = .8;   // 0 = fully grey, 1 = original color
const END_SATURATION = 1;     // saturation after the fade
const SATURATION_FADE_SECONDS = 2; // how long color takes to come in

// ---- Parallax settings ----
const PARALLAX_AMOUNT = 0.1;  // max movement of the front layer, as a fraction of image size
const PARALLAX_EASE = 0.10;   // 0.01 = floaty and slow, 0.2 = quick and snappy
const TOUCH_SENSITIVITY = 3;  // 1 = drag to the screen edge for full movement, higher = shorter drag
// true  = the whole image is always visible (layer edges may shift slightly when moving)
// false = layers are enlarged a little so moving edges stay hidden (crops the image edges)
const KEEP_FULL_IMAGE = true;
const TOP_MARGIN = 0.5;       // 1 = centered, 0.5 = half the top margin, 0 = no top margin

let layers = new Array(LAYERS.length);
let hueState = [];
let loadedCount = 0;
let failed = [];
let hueShader, statusDiv;
let startTime = null;
let revealStart = null;       // when the fade-in began (null = still loading)
let drawW, drawH, offsetY = 0;

// Parallax input: target is where the pointer says to go, pos eases toward it
let target = { x: 0, y: 0 };
let pos = { x: 0, y: 0 };
let hasPointer = false;    // true once the mouse or a finger has been used
let isTouching = false;

// ---- Shader: hue rotation + saturation, keeps transparency ----
const VERT = `
precision highp float;
attribute vec3 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vTexCoord;
uniform sampler2D uTex;
uniform float uHue;   // radians
uniform float uSat;   // 0 = greyscale, 1 = full color
void main() {
  vec4 c = texture2D(uTex, vTexCoord);
  float co = cos(uHue);
  float si = sin(uHue);
  vec3 r = vec3(0.213 + 0.787*co - 0.213*si, 0.715 - 0.715*co - 0.715*si, 0.072 - 0.072*co + 0.928*si);
  vec3 g = vec3(0.213 - 0.213*co + 0.143*si, 0.715 + 0.285*co + 0.140*si, 0.072 - 0.072*co - 0.283*si);
  vec3 b = vec3(0.213 - 0.213*co - 0.787*si, 0.715 - 0.715*co + 0.715*si, 0.072 + 0.928*co + 0.072*si);
  vec3 rgb = clamp(vec3(dot(r, c.rgb), dot(g, c.rgb), dot(b, c.rgb)), 0.0, 1.0);
  float grey = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3(grey), rgb, uSat);
  gl_FragColor = vec4(rgb * c.a, c.a);
}`;

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(min(displayDensity(), 2));
  frameRate(30);
  noStroke();
  hueShader = createShader(VERT, FRAG);
  setupStatus();
  setupParallaxInput();
  computeLayout();

  LAYERS.forEach((layer, i) => {
    const h0 = layer.hueStart ?? 0;
    hueState.push({ from: h0, to: randomTarget(i, h0), start: 0 });
    loadImage(
      layer.file,
      img => { layers[i] = img; loadedCount++; checkAllLoaded(); },
      () => { failed.push(layer.file); checkAllLoaded(); }
    );
  });
}

// Once every layer has loaded (or failed), start the fade-in.
// A failed layer is skipped, so the page never gets stuck on white.
function checkAllLoaded() {
  if (revealStart === null && loadedCount + failed.length === LAYERS.length) {
    revealStart = millis();
  }
}

function draw() {
  background(BG_COLOR);
  updateStatus();

  // Nothing but the loading text until every layer has arrived
  if (revealStart === null) return;

  const gl = drawingContext;
  gl.disable(gl.DEPTH_TEST);

  // Cropped mode only: clip to the artwork's frame so moving layers stay inside it
  if (!KEEP_FULL_IMAGE) {
    const pd = pixelDensity();
    const sx = max(0, round((width - drawW) / 2 * pd));
    const sy = max(0, round(((height - drawH) / 2 - offsetY) * pd)); // bottom edge, accounts for the upward shift
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(sx, sy, min(width * pd, round(drawW * pd)), min(height * pd, round(drawH * pd)));
  }

  shader(hueShader);
  const now = millis() / 1000;
  if (startTime === null) startTime = now;

  // Saturation fade
  let t = SATURATION_FADE_SECONDS > 0
    ? constrain((now - startTime) / SATURATION_FADE_SECONDS, 0, 1)
    : 1;
  t = t * t * (3 - 2 * t);
  hueShader.setUniform('uSat', lerp(START_SATURATION, END_SATURATION, t));

  // Finger or mouse position (p5 fills mouseX/mouseY from touches too)
  const touching = isTouching || mouseIsPressed;
  if (mouseIsPressed) hasPointer = true;
  if (hasPointer) {
    const sens = touching ? TOUCH_SENSITIVITY : 1;   // only touch is boosted; mouse hover is unchanged
    target.x = constrain(((mouseX / width) * 2 - 1) * sens, -1, 1);
    target.y = constrain(((mouseY / height) * 2 - 1) * sens, -1, 1);
  }

  // Ease parallax position toward the pointer target
  pos.x = lerp(pos.x, target.x, PARALLAX_EASE);
  pos.y = lerp(pos.y, target.y, PARALLAX_EASE);

  const amount = PARALLAX_AMOUNT;
  const maxDepth = max(LAYERS.map(l => l.depth ?? 0));
  // Cropped mode enlarges layers to hide moving edges; full-image mode draws them at true size
  const zoom = KEEP_FULL_IMAGE ? 1 : 1 + 2 * amount * maxDepth;

  for (let i = 0; i < layers.length; i++) {
    if (!layers[i]) continue;   // skip a layer that failed to load
    const depth = LAYERS[i].depth ?? 0;
    push();
    // offsetY shifts the whole image up to shrink the top margin
    translate(-pos.x * amount * drawW * depth, offsetY - pos.y * amount * drawH * depth);
    hueShader.setUniform('uTex', layers[i]);
    hueShader.setUniform('uHue', radians(currentHue(i, now)));
    plane(drawW * zoom, drawH * zoom);
    pop();
  }

  gl.disable(gl.SCISSOR_TEST);

  // Fade in from white: a white cover over the painting that thins out
  const r = REVEAL_MS > 0 ? constrain((millis() - revealStart) / REVEAL_MS, 0, 1) : 1;
  if (r < 1) {
    resetShader();
    noStroke();
    fill(255, 255 * (1 - r));
    plane(width, height);
  }
}

// ---- Parallax input ----
function setupParallaxInput() {
  // A mobile viewport tag, and touch handlers on the canvas itself
  // that stop the page from scrolling
  createMetaTag();
  const c = canvasEl();
  c.style.touchAction = 'none';
  c.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  c.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });

  // Desktop: glide back to center when the mouse leaves the window
  document.addEventListener('mouseleave', () => {
    target.x = 0;
    target.y = 0;
  });
}

// p5 input events
function mouseMoved()   { hasPointer = true; }
function touchStarted() { hasPointer = true; isTouching = true; }
function touchEnded()   { isTouching = false; }
function touchMoved()   { return false; }   // keep the page from moving

function createMetaTag() {
  const meta = createElement('meta');
  meta.attribute('name', 'viewport');
  meta.attribute('content',
    'width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no');
  meta.parent(select('head'));
}

function canvasEl() {
  return document.querySelector('canvas');
}

// ---- Hue drift ----
function currentHue(i, now) {
  const h = hueState[i];
  if (h.start === 0) h.start = now;
  const seconds = max(LAYERS[i].hueSeconds ?? 60, 0.1);
  let t = (now - h.start) / seconds;
  if (t >= 1) {
    h.from = h.to;
    h.to = randomTarget(i, h.from);
    h.start = now;
    t = 0;
  }
  const eased = t * t * (3 - 2 * t);
  return lerp(h.from, h.to, eased);
}

function randomTarget(i, fromHue) {
  const shift = constrain(LAYERS[i].hueShift ?? 0, 0, 360);
  const dir = LAYERS[i].hueDirection ?? 'random';
  if (dir === 'forward')  return fromHue + random(0, shift);
  if (dir === 'backward') return fromHue - random(0, shift);
  return fromHue + random(-shift, shift);
}

// ---- Loading and status text ----
// Same look as XXVI: small grey text centered on the screen.
// (It's an HTML element because WEBGL canvases can't draw text without a font file.)
function setupStatus() {
  statusDiv = createDiv('');
  statusDiv.style('position', 'fixed');
  statusDiv.style('inset', '0');
  statusDiv.style('display', 'flex');
  statusDiv.style('align-items', 'center');
  statusDiv.style('justify-content', 'center');
  statusDiv.style('text-align', 'center');
  statusDiv.style('white-space', 'pre-line');
  statusDiv.style('color', '#414141');
  statusDiv.style('font', '12px sans-serif');
  statusDiv.style('pointer-events', 'none');
}

function updateStatus() {
  if (failed.length > 0) {
    statusDiv.html('Could not load:\n' + failed.join('\n'));
  } else if (revealStart === null) {
    statusDiv.html(LOADING_TEXT);
  } else {
    statusDiv.html('');
  }
}

// ---- Layout ----
function computeLayout() {
  // In full-image mode, leave room around the art for the layers' parallax travel
  let room = 1;
  if (KEEP_FULL_IMAGE) {
    const maxDepth = max(LAYERS.map(l => l.depth ?? 0));
    room = 1 + 2 * PARALLAX_AMOUNT * maxDepth;
  }
  const scaleX = width / (ART_W * room);
  const scaleY = height / (ART_H * room);
  const s = FIT_MODE === 'cover' ? max(scaleX, scaleY) : min(scaleX, scaleY);
  drawW = ART_W * s;
  drawH = ART_H * s;
  // Shift the image up so the top margin is TOP_MARGIN of its centered size
  offsetY = -((height - drawH) / 2) * (1 - TOP_MARGIN);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeLayout();
}