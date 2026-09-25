// Night mountains — automatic parallax
// p5.js 2.x

// ---------- Tweakable settings ----------

// The artwork's design size. Keep these at 430 x 344 even if you export
// higher-resolution PNGs later — the sketch scales from this base.
const BASE_W = 430;
const BASE_H = 344;

// Layers, loaded and drawn in this order: FIRST is at the back.
// sway = how far each layer drifts side to side, in base pixels.
const LAYERS = [
	{ file: 'IX3.png', sway: 10 },
	{ file: 'IX2.png', sway: 5 },
	{ file: 'IX1.png', sway: 1 },
];

const SWAY_PERIOD = 14;          // seconds for one full left-right-left cycle
const LAYER_FADE = 0.8;          // seconds each layer takes to fade in once
                                 // loaded (0 = appear instantly)

const MOON_SPEED = 6;            // degrees per second while visible
const MOON_SKIP_SPEED = 66;      // degrees per second through the hidden arc
const MOON_RISE = 225;           // angle where the moon starts to appear on
                                 // the left (lower = earlier, higher = later)
const MOON_FADE = 8;             // degrees of travel over which it fades in

const STAR_COUNT = 100;

const SHOOT_MIN_WAIT = 5;        // seconds between shooting stars (random range)
const SHOOT_MAX_WAIT = 10;
const SKY = [1, 7, 56];

const LOADING_TEXT = 'Loading';
const TEXT_COLOR = [230, 232, 255];

// ---------- State ----------

let layers = new Array(LAYERS.length).fill(null);   // loaded images
let layerLoadedAt = new Array(LAYERS.length).fill(0);
let failed = [];                 // messages for layers that couldn't load
let loadingDone = false;
let loadingDoneAt = 0;

let stars = [];
let moonOrbit = MOON_RISE;
let s = 1;                       // current scale factor
let shooter = null;              // the active shooting star, if any
let nextShoot = 3;               // seconds until the next one (first comes early)

// ---------- Setup ----------

function setup() {
	createCanvas(windowWidth, windowHeight);
	imageMode(CENTER);
	noCursor();
	textFont('system-ui, -apple-system, sans-serif');

	for (let i = 0; i < STAR_COUNT; i++) {
		stars.push(new Star());
	}

	updateScale();

	// Start the sky right away and load the layers in the background,
	// one at a time, back to front
	loadLayer(0, 0);
}

// Load one layer, then start the next when it finishes. If a load fails,
// try again (up to twice) with a fresh request, which gets around a stale
// or half-downloaded copy in the phone's cache. A final failure is shown
// on screen and the next layer still loads.
function loadLayer(i, attempt) {
	if (i >= LAYERS.length) {
		loadingDone = true;
		loadingDoneAt = millis();
		return;
	}

	const file = LAYERS[i].file;
	const url = attempt === 0 ? file : `${file}?retry=${attempt}-${Date.now()}`;

	loadImage(
		url,
		img => {
			layers[i] = img;
			layerLoadedAt[i] = millis();
			loadLayer(i + 1, 0);
		},
		err => {
			if (attempt < 2) {
				setTimeout(() => loadLayer(i, attempt + 1), 1000);
				return;
			}
			const reason = (err && (err.message || err.type)) || 'unknown error';
			// The p5 web editor swaps file names for long asset links,
			// so show the layer number and just the end of the link
			const shortName = file.length > 40 ? '…' + file.slice(-12) : file;
			failed.push(`layer ${i + 1} of ${LAYERS.length} (${shortName}): ${reason}`);
			console.error('Could not load', file, err);
			loadLayer(i + 1, 0);
		}
	);
}

function windowResized() {
	resizeCanvas(windowWidth, windowHeight);
	updateScale();
}

// Fit the scene to the screen: limited by width on phones in portrait,
// by height on desktops and landscape iPads.
function updateScale() {
	const fitWidth = (width * 0.92) / BASE_W;
	const fitHeight = (height * 0.55) / BASE_H;
	s = min(fitWidth, fitHeight);
}

// ---------- Draw ----------

function draw() {
	background(SKY);

	// Clamp the frame time so the moon doesn't jump after a hidden tab returns
	const dt = min(deltaTime, 100) / 1000;

	// Stars live in base coordinates around the screen centre
	push();
	translate(width / 2, height / 2);
	for (const star of stars) {
		star.update(dt);
		star.draw();
	}
	updateShootingStar(dt);
	pop();

	push();
	// Same anchor point as the original: slightly below centre
	translate(width / 2, height / 2 + 130 * s);

	drawMoon(dt);

	// Smooth side-to-side sway, no interaction needed
	const sway = sin((TWO_PI * millis()) / 1000 / SWAY_PERIOD);
	const w = BASE_W * s;
	const h = BASE_H * s;

	// Draw whichever layers have arrived so far, each fading in
	LAYERS.forEach((layer, i) => {
		const img = layers[i];
		if (!img) return;
		const age = (millis() - layerLoadedAt[i]) / 1000;
		const alpha = LAYER_FADE > 0 ? constrain(age / LAYER_FADE, 0, 1) : 1;
		push();
		drawingContext.globalAlpha = alpha;
		image(img, sway * layer.sway * s, 0, w, h);
		pop();
	});
	pop();

	drawLoadingMessage();
	drawFailures();
}

// "Loading" with animated dots, centred where the mountains will be.
// Fades out once every layer has been tried.
function drawLoadingMessage() {
	let alpha = 1;
	if (loadingDone) {
		alpha = 1 - (millis() - loadingDoneAt) / 600;
		if (alpha <= 0) return;
	}

	const dots = '.'.repeat(floor(millis() / 400) % 4);
	const loaded = layers.filter(Boolean).length;

	push();
	noStroke();
	fill(...TEXT_COLOR, alpha * 255);
	textAlign(CENTER, CENTER);
	textSize(constrain(16 * s, 13, 22));
	// Pad the dots so the word doesn't shift as they change
	text(LOADING_TEXT + dots.padEnd(3, ' '), width / 2, height / 2 + 130 * s);
	textSize(constrain(11 * s, 10, 15));
	fill(...TEXT_COLOR, alpha * 140);
	text(`${loaded} of ${LAYERS.length}`, width / 2, height / 2 + 130 * s + 24 * max(s, 1));
	pop();
}

// List any layers that couldn't load, top left
function drawFailures() {
	if (failed.length === 0) return;
	push();
	noStroke();
	fill(...TEXT_COLOR);
	textAlign(LEFT, TOP);
	textSize(14);
	text('Could not load:\n' + failed.join('\n'), 16, 16);
	pop();
}

function drawMoon(dt) {
	// Wait below the ridge until every layer has loaded and finished
	// fading in, so the moon can't show through a translucent layer
	if (!loadingDone) return;
	const lastLoaded = max(layerLoadedAt);
	if (millis() - lastLoaded < LAYER_FADE * 1000) return;

	const visible = moonOrbit >= MOON_RISE || moonOrbit < 30;

	if (visible) {
		// Fade in gently at the start of the arc
		const alpha = moonOrbit >= MOON_RISE
			? constrain((moonOrbit - MOON_RISE) / MOON_FADE, 0, 1)
			: 1;
		push();
		drawingContext.globalAlpha = alpha;
		rotate(radians(moonOrbit));
		translate(130 * s, -100 * s);
		fill(255, 255, 200);
		stroke(255, 50);
		drawingContext.shadowBlur = 50 * s;
		drawingContext.shadowColor = 'white';
		circle(0, 0, 90 * s);
		pop();
	}

	// Rush only through the part of the orbit where it isn't drawn
	moonOrbit += (visible ? MOON_SPEED : MOON_SKIP_SPEED) * dt;
	moonOrbit %= 360;
}

// ---------- Stars ----------

class Star {
	constructor() {
		// Stored in base coordinates so they rescale with the scene
		this.x = random(-BASE_W / 2, BASE_W / 2);
		this.y = random(-300, 0);
		this.size = random(0.25, 3);
		this.t = random(TWO_PI);
	}

	update(dt) {
		this.t += 6 * dt;
	}

	draw() {
		const d = max(0, this.size + sin(this.t) * 2) * s;
		noStroke();
		fill(255);
		circle(this.x * s, this.y * s, d);
	}
}

// ---------- Shooting stars ----------

function updateShootingStar(dt) {
	if (!shooter) {
		nextShoot -= dt;
		if (nextShoot <= 0) {
			shooter = new ShootingStar();
			nextShoot = random(SHOOT_MIN_WAIT, SHOOT_MAX_WAIT);
		}
		return;
	}

	shooter.update(dt);
	shooter.draw();
	if (shooter.done) shooter = null;
}

class ShootingStar {
	constructor() {
		// Head toward the middle of the sky so it stays over the scene
		const dir = random() < 0.5 ? 1 : -1;
		this.x = dir === 1 ? random(-BASE_W / 2, 0) : random(0, BASE_W / 2);
		this.y = random(-300, -170);

		const angle = radians(random(18, 38));
		const speed = random(380, 520);        // base pixels per second
		this.vx = cos(angle) * speed * dir;
		this.vy = sin(angle) * speed;

		this.life = 0;
		this.duration = random(0.6, 1.0);      // seconds
		this.trail = random(50, 80);           // tail length, base pixels
	}

	update(dt) {
		this.life += dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
	}

	get done() {
		return this.life >= this.duration;
	}

	draw() {
		// Fade in quickly, fade out slowly
		const p = constrain(this.life / this.duration, 0, 1);
		const a = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;

		const hx = this.x * s;
		const hy = this.y * s;
		const speed = sqrt(this.vx * this.vx + this.vy * this.vy);
		const len = this.trail * s;
		const tx = hx - (this.vx / speed) * len;
		const ty = hy - (this.vy / speed) * len;

		const ctx = drawingContext;
		push();

		// Tail: a gradient line from transparent to bright
		const g = ctx.createLinearGradient(tx, ty, hx, hy);
		g.addColorStop(0, 'rgba(255, 255, 255, 0)');
		g.addColorStop(1, `rgba(255, 255, 235, ${a})`);
		ctx.strokeStyle = g;
		ctx.lineWidth = 1.6 * s;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(tx, ty);
		ctx.lineTo(hx, hy);
		ctx.stroke();

		// Head: a small glowing point
		ctx.shadowBlur = 12 * s;
		ctx.shadowColor = 'white';
		noStroke();
		fill(255, 255, 240, a * 255);
		circle(hx, hy, 2.8 * s);

		pop();
	}
}