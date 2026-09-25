// Panorama + hawk — p5.js 2.x
// Everything is laid out in "design units" based on the original 600px-tall
// panorama, then scaled to fit whatever screen it's on.

const DESIGN_HEIGHT = 600; // height the original layout was built for
const PANO_ASPECT = 2883 / 600; // long panorama shape (width / height)

// The painting stays hidden until both images have loaded, then fades in
// from white, so nothing appears on its own while the other downloads.
const REVEAL_MS = 800; // length of the fade-in in milliseconds (0 = appear instantly)
const LOADING_TEXT = 'loading...'; // shown in the middle while loading ('' = none)

let bgImg, bird;

// panorama scroll (in screen pixels)
let bgX = 0;       // current position
let targetX = 0;   // where a drag wants it to be
let easing = 0.15; // 0–1, higher = snappier
let lastX = 0;
let isInteracting = false;

// computed on resize
let s = 1;          // scale factor: screen px per design unit
let panoW = 0;      // drawn panorama width
let panoH = 0;      // drawn panorama height
let panoY = 0;      // vertical offset (letterboxing on tall screens)

// hawk — soars back and forth on a smooth looping path. It slows into each
// turn, rolls over to face the new direction, and tilts with its climb/dive.
const HAWK_FACES_RIGHT = false; // set to false if hawk.png is drawn facing left
const HAWK_PASS_SECONDS = 9;   // time to cross from one side to the other
const HAWK_DRIFT_SECONDS = 23; // slow up-and-down drift (different rhythm = varied path)
const HAWK_MAX_TILT = 0.35;    // most the nose tips up or down, in radians (~20°)
const HAWK_TURN_LIFT = 18;     // how far it rises as it swings through a turn (design units)
const HAWK_FLIP = 0.5;         // how quickly it flips in a turn: lower = faster (0.05–0.5)

let flightPhaseX = Math.PI / 2; // start mid-pass, flying right
let flightPhaseY = 0;
let hawkTilt = 0;               // smoothed tilt so the nose moves gently

// loading state
let revealStart = null;   // when the fade-in began
let loadError = null;     // message if the panorama couldn't load

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  // Stop the browser from scrolling/zooming the page while dragging the canvas
  canvas.elt.style.touchAction = "none";
  imageMode(CORNER);

  // p5 2.x: loadImage returns a promise. We don't await it here, so draw()
  // keeps running and can show the loading text while the images download.
  Promise.allSettled([
    loadImage("panoramaformouse.png"),
    loadImage("hawk.png"),
  ]).then(([pano, hawk]) => {
    if (pano.status === "fulfilled") {
      bgImg = pano.value;
    } else {
      loadError = "Couldn't load panoramaformouse.png";
      console.error(pano.reason);
      return;
    }
    // If only the hawk fails, show the painting without it
    if (hawk.status === "fulfilled") bird = hawk.value;
    else console.error("Couldn't load hawk.png", hawk.reason);

    computeLayout();
    bgX = targetX = 0;
    revealStart = millis(); // start the fade-in
  });
}

function computeLayout() {
  // Fill the screen height with the panorama, keeping the original
  // long 2883 x 600 proportions so it scrolls sideways.
  panoH = height;
  panoW = panoH * PANO_ASPECT;

  // Only on screens wider than the panorama itself: fill the width instead
  if (panoW < width) {
    panoW = width;
    panoH = panoW / PANO_ASPECT;
  }

  // On very tall phones, cap the height a bit so the painting isn't
  // cropped into a thin vertical slice — center it with a little letterbox.
  const maxH = width * 2.2;
  if (panoH > maxH && panoW * (maxH / panoH) >= width) {
    panoW *= maxH / panoH;
    panoH = maxH;
  }
  panoY = (height - panoH) / 2;

  s = panoH / DESIGN_HEIGHT;

  // keep scroll position valid after a resize/rotation
  targetX = clampScroll(targetX);
  bgX = clampScroll(bgX);
}

function clampScroll(x) {
  return constrain(x, -(panoW - width), 0);
}

function draw() {
  // Nothing but the loading text until both images have arrived
  if (revealStart === null) {
    background(255);
    const msg = loadError || LOADING_TEXT;
    if (msg) {
      noStroke();
      fill('#414141');
      textSize(12);
      textAlign(CENTER, CENTER);
      text(msg, width / 2, height / 2);
    }
    return;
  }

  background(0);

  // ease toward the drag target for smooth motion on every device
  bgX = lerp(bgX, targetX, easing);
  image(bgImg, bgX, panoY, panoW, panoH);

  if (bird) flying();

  // Fade in from white: a white cover over everything that thins out
  const t = REVEAL_MS > 0 ? constrain((millis() - revealStart) / REVEAL_MS, 0, 1) : 1;
  if (t < 1) {
    noStroke();
    fill(255, 255 * (1 - t));
    rect(0, 0, width, height);
  }
}

function flying() {
  // Frame-rate independent, and capped so a background tab doesn't jump
  const dtSec = min(deltaTime, 100) / 1000;
  flightPhaseX += (PI / HAWK_PASS_SECONDS) * dtSec;
  flightPhaseY += (TWO_PI / HAWK_DRIFT_SECONDS) * dtSec;

  // Path in design units, same area as the original sketch:
  // x swings between -300 and 220, y between -150 and 0 (up is negative).
  // A sine wave slows down smoothly at each end instead of bouncing.
  // facing: +1 flying right, -1 flying left, passing through 0 in a turn.
  const facing = Math.sin(flightPhaseX); // follows the x velocity
  const birdX = -40 - 260 * Math.cos(flightPhaseX);
  const turnAmount = 1 - abs(facing); // 0 mid-pass, 1 at the very top of a turn
  const birdY = -75 + 75 * Math.sin(flightPhaseY) - HAWK_TURN_LIFT * turnAmount;

  // Screen-space velocity, for how steeply it climbs or dives
  const vx = 260 * facing * (PI / HAWK_PASS_SECONDS);
  const vy =
    75 * Math.cos(flightPhaseY) * (TWO_PI / HAWK_DRIFT_SECONDS) +
    HAWK_TURN_LIFT * Math.sign(facing) * Math.cos(flightPhaseX) * (PI / HAWK_PASS_SECONDS);
  // Nose follows the climb/dive, measured along the direction it's heading.
  // Use a minimum forward speed so it doesn't point straight up in a turn.
  let targetTilt = Math.atan2(vy, max(abs(vx), 60));
  targetTilt = constrain(targetTilt, -HAWK_MAX_TILT, HAWK_MAX_TILT);
  hawkTilt = lerp(hawkTilt, targetTilt, 1 - Math.pow(0.02, dtSec)); // gentle smoothing

  // Roll over during the turn: the image narrows to edge-on and widens again
  // mirrored. The curve keeps it at full width for most of the pass and only
  // narrows near the turn.
  const roll = Math.sign(facing) * Math.pow(abs(facing), HAWK_FLIP);
  const dir = HAWK_FACES_RIGHT ? 1 : -1;

  // Original flight path is centered on the screen and shrinks on narrow screens
  const halfSpan = 260;
  const spanScale = min(s, (width * 0.42) / halfSpan);
  const cx = width / 2 + (birdX + 40) * spanScale;
  const cy = panoY + (300 + birdY) * s;

  // bird size follows the painting, but don't let it dominate a phone screen
  const birdScale = min(s, width / 700);
  const bw = bird.width * birdScale;
  const bh = bird.height * birdScale;

  push();
  translate(cx, cy);
  // Screen y points down, so climbing (vy < 0) tips the nose up:
  // counter-clockwise when heading right, clockwise when heading left.
  // Multiplying by roll makes the tilt flip smoothly through the turn.
  rotate(hawkTilt * roll);
  scale(roll * dir, 1);
  imageMode(CENTER);
  image(bird, 0, 0, bw, bh);
  pop();
}

// p5 2.x uses pointer events: these fire for mouse, touch, and Apple Pencil,
// so the separate touchStarted/touchMoved/touchEnded handlers are no longer needed.
function mousePressed() {
  if (revealStart === null) return; // ignore drags until the painting is in
  isInteracting = true;
  lastX = mouseX;
}

function mouseDragged() {
  if (!isInteracting) return;
  const swipeDistance = mouseX - lastX;
  lastX = mouseX;
  targetX = clampScroll(targetX + swipeDistance);
  return false; // prevent default browser behavior
}

function mouseReleased() {
  isInteracting = false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (bgImg) computeLayout();
}