// Rockfall sketch with rotation, catcher, particle burst, and gravity-aware reflow
// Updated for p5.js 2.x, responsive across desktop, iPad and phone.
//
// How the sizing works: all the rock physics happen in a fixed "world" that is
// 430 x 600 units (the original canvas size). Each frame, that world is scaled
// uniformly to fit the window and anchored to the bottom, so the pond and the
// rock pile keep the same composition on every screen. The gradient and tint
// fill the whole window, so there are no letterbox bars.

const WORLD_W = 430;
const WORLD_H = 600;
const GROUND_OFFSET = 60; // ground sits 60 units above the bottom of the world
const POND_OFFSET = 85;   // pond images are centered 85 units above the bottom

// Falling
const FALL_SPEED = .5;  // 1 = original speed; raise to make rocks fall faster (stay below ~1.6)

// Spawning
const SPAWN_EVERY = 20;  // frames between new rocks (was 30); lower = more rocks
const SPAWN_SPREAD = 60; // how scattered rocks are around the center; lower = stacks sooner
const MAX_ROCKS = 45;    // most rocks allowed on screen at once

// Stacking
const STACK_WIDTH = 0.35; // how far off-center a rock can land on another (0.2 = original, 0.5 = edges just touching)
const NESTLE = 0.5;       // how far a rock sinks into the one below, as a fraction of that rock's size

// Screen <-> world transform (recomputed on resize)
let worldScale = 1;
let offsetX = 0;
let offsetY = 0;

// Bigger catcher on touch screens, where a fingertip is less precise
const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
const catcherRadius = isCoarsePointer ? 32 : 20; // in world units

let catcherX = 0;
let catcherY = 0;
let isCatching = false;
let particles = [];      // falling and landed rocks
let burstParticles = []; // explosion effect

let rocks = [];
let bgrocks, bgrocks2;
let groundLevel = WORLD_H - GROUND_OFFSET;

// p5.js 2.x removed preload(); load assets with await inside an async setup()
async function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(min(displayDensity(), 2)); // keep retina screens sharp without tanking performance
  imageMode(CENTER);
  computeLayout();

  // Load everything in parallel
  [bgrocks, bgrocks2, ...rocks] = await Promise.all([
    loadImage("rocks.png"),
    loadImage("bgrocks2.png"),
    loadImage("rock1.png"),
    loadImage("rock2.png"),
    loadImage("rock3.png"),
    loadImage("rock4.png"),
    loadImage("rock5.png"),
    loadImage("rock6.png"),
  ]);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeLayout();
}

// Fit the world inside the window, centered horizontally, anchored to the bottom
function computeLayout() {
  worldScale = min(width / WORLD_W, height / WORLD_H);
  offsetX = (width - WORLD_W * worldScale) / 2;
  offsetY = height - WORLD_H * worldScale;
}

function toWorld(sx, sy) {
  return {
    x: (sx - offsetX) / worldScale,
    y: (sy - offsetY) / worldScale,
  };
}

// Native canvas gradient: one fill instead of hundreds of line() calls per frame
function drawGradientBackground() {
  drawingContext.save(); // don't disturb p5's own fill state
  const g = drawingContext.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, "rgb(224, 198, 191)"); // light beige
  g.addColorStop(1, "rgb(211, 204, 175)"); // peach
  drawingContext.fillStyle = g;
  drawingContext.fillRect(0, 0, width, height);
  drawingContext.restore();
}

function draw() {
  drawGradientBackground();

  // Wait until images have finished loading
  if (!bgrocks2) return;

  // Everything inside this push/pop is in world units
  push();
  translate(offsetX, offsetY);
  scale(worldScale);

  image(bgrocks, WORLD_W / 2, WORLD_H - POND_OFFSET); // bottom pond background

  // Spawn a new rock just above the top edge of the visible screen
   if (frameCount % SPAWN_EVERY === 0 && particles.length < MAX_ROCKS) {
    // Cluster rocks toward the center so a mound builds up sooner
    const x = constrain(randomGaussian(WORLD_W / 2, SPAWN_SPREAD), WORLD_W / 2 - 160, WORLD_W / 2 + 160);
    const rockImg = random(rocks);
    const size = random(10, 80);
    const speed = map(size, 10, 80, 6, 15);
    const screenTop = toWorld(0, 0).y;
    particles.push(new Particle(rockImg, x, screenTop - size / 2, size, speed));
  }

  // Update and draw rocks
  for (let p of particles) {
    p.show();
    if (p.speed > 0) {
      p.drop();

      // Check rocks before the ground so a rock landing on the pile
      // doesn't sink through it to the ground
      if (isRockColliding(p)) {
        p.speed = 0;
      } else if (p.y + p.size / 2 >= groundLevel) {
        p.y = groundLevel - p.size / 2;
        p.speed = 0;
      }
    }
  }

  // Burst particles
  for (let i = burstParticles.length - 1; i >= 0; i--) {
    let bp = burstParticles[i];
    bp.update();
    bp.show();
    if (bp.lifespan <= 0) {
      burstParticles.splice(i, 1);
    }
  }

  // Rock catcher
  if (isCatching) {
    fill(219, 61, 18, 50);
    stroke(219, 162, 18);
    strokeWeight(1);
    ellipse(catcherX, catcherY, catcherRadius * 2);

    for (let i = particles.length - 1; i >= 0; i--) {
      let p = particles[i];
      if (dist(p.x, p.y, catcherX, catcherY) < catcherRadius) {
        removeRock(i, 12);
      }
    }
  }

  // Overlay pond image so rocks appear to sink slightly
  image(bgrocks2, WORLD_W / 2, WORLD_H - POND_OFFSET);

  // Gravity reflow: unsupported rocks fall again
  for (let p of particles) {
    if (p.speed === 0 && !hasSupport(p)) {
      p.speed = map(p.size, 10, 80, 6, 20);
    }
  }

  pop();

  // Transparent tint over the entire window
  noStroke();
  fill(209, 96, 209, 10);
  rect(0, 0, width, height);
}

// Remove a rock, spawn its burst, and wake up any rocks resting above it
function removeRock(index, maxReflowSpeed) {
  const p = particles[index];

  for (let j = 0; j < 20; j++) {
    burstParticles.push(new BurstParticle(p.x, p.y));
  }

  const erasedX = p.x;
  const erasedY = p.y;
  particles.splice(index, 1);

  for (let other of particles) {
    if (other.y < erasedY && abs(other.x - erasedX) < other.size / 2) {
      if (other.speed === 0) {
        other.speed = map(other.size, 10, 80, 6, maxReflowSpeed);
      }
    }
  }
}

// The height a rock resting on `other` sits at
function restingSurface(other) {
  return other.y - other.size / 2 + other.size * NESTLE;
}

function isRockColliding(particle) {
  let bestY = Infinity;

  for (let other of particles) {
    if (other === particle || other.speed !== 0) continue;

    const aligned = abs(particle.x - other.x) < (particle.size + other.size) * STACK_WIDTH;
    if (aligned && particle.y < other.y) {
      const surface = restingSurface(other);
      if (particle.y + particle.size / 2 >= surface) {
        // If it touches several rocks, rest on the highest one
        bestY = min(bestY, surface - particle.size / 2);
      }
    }
  }

  if (bestY < Infinity) {
    particle.y = bestY;
    particle.speed = 0;
    particle.rotationSpeed = 0;
    return true;
  }
  return false;
}

function hasSupport(rock) {
  const bottom = rock.y + rock.size / 2;
  if (bottom >= groundLevel - 1) return true; // on the ground

  for (let other of particles) {
    if (other === rock || other.speed !== 0 || other.y <= rock.y) continue;

    const aligned = abs(rock.x - other.x) < (rock.size + other.size) * STACK_WIDTH;
    if (aligned && abs(bottom - restingSurface(other)) <= 2) {
      return true; // resting on a rock below
    }
  }
  return false;
}

// Falling rock
class Particle {
  constructor(img, x, y, size, speed) {
    this.content = img;
    this.x = x;
    this.y = y;
    this.size = size;
    this.speed = speed;
    this.rotation = random(TWO_PI);
    this.rotationSpeed = random(-0.05, 0.05);
    this.tintColor = color(random(150, 250), random(100, 200), random(150, 250));
  }

  show() {
    push();
    translate(this.x, this.y);
    rotate(this.rotation);
    tint(this.tintColor);
    image(this.content, 0, 0, this.size, this.size);
    pop(); // pop also resets the tint
  }

  drop() {
    this.y += this.speed * FALL_SPEED;
    this.rotation += this.rotationSpeed;
  }
}

// Explosion particle
class BurstParticle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = random(-2, 2);
    this.vy = random(-2, 2);
    this.lifespan = 255;

    // Rainbow hue, converted once to plain RGB numbers
    push();
    colorMode(HSB, 360, 100, 100);
    const c = color(random(360), 80, 100);
    pop();
    this.r = red(c);
    this.g = green(c);
    this.b = blue(c);
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.lifespan -= 1.5;
  }

  show() {
    noStroke();
    fill(this.r, this.g, this.b, this.lifespan);
    ellipse(this.x, this.y, 5);
  }
}

// In p5.js 2.x, mouse functions also fire for touch and pen (pointer events),
// so these handle desktop, iPad and phone.
function mousePressed() {
  const w = toWorld(mouseX, mouseY);
  catcherX = w.x;
  catcherY = w.y;
  isCatching = true;

  burstRocksAt(catcherX, catcherY);

  setTimeout(() => {
    isCatching = false;
  }, 100);
}

function mouseDragged() {
  const w = toWorld(mouseX, mouseY);
  catcherX = w.x;
  catcherY = w.y;
}

function mouseReleased() {
  isCatching = false;
}

function burstRocksAt(x, y) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (dist(p.x, p.y, x, y) < catcherRadius) {
      removeRock(i, 15);
      break; // only burst one rock per tap
    }
  }
}

// particles credit: https://editor.p5js.org/bradgross/sketches/SkEygH0Zf