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

// hawk (design units, same numbers as the original sketch)
let flightSpeedX = 1;
let flightSpeedY = 0.2;
let birdX = 0;
let birdY = 0;

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
  // Frame-rate independent: 120Hz iPads/phones won't fly twice as fast
  const dt = deltaTime / (1000 / 60);

  const rotationAngle = map(birdX, -280, 280, -0.4, 0.3);

  // Original flight path spans birdX -300..220 around screen x ≈ 225.
  // Center it on the screen and shrink the span if the screen is narrow.
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
  rotate(rotationAngle);
  imageMode(CENTER);
  image(bird, 0, 0, bw, bh);
  pop();

  birdX += flightSpeedX * dt;
  birdY -= flightSpeedY * dt;
  if (birdX < -300 || birdX > 220) {
    birdX = constrain(birdX, -300, 220); // avoid getting stuck past the edge
    flightSpeedX *= -1;
    if (birdY < -150 || birdY > 0) {
      flightSpeedY *= -1;
    }
  }
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