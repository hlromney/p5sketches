// noprotect
// (the line above tells the p5 web editor not to stop the long image
//  loops below; on slower phones it mistook them for infinite loops)

// Layered image sketch — XXVI
// Live rain and snow from the Promontory Mountains, Utah, falling
// between the painting's layers. Weather data: Open-Meteo (no API key).

// ---------- Quick settings ----------
const SHOW_BUTTON = false; // true = show the weather button, false = hide it

// The button sits just above the painting's top-right corner and the
// weather text just below its bottom-left corner.
const ART_GAP = 10;   // space in pixels between the painting and the button / text
const EDGE_GAP = 12;  // they never get closer than this to the screen edge
// The painting stays hidden until every layer has loaded, then fades in
// all at once, so no layer appears on its own while the others download.
const REVEAL_MS = 800; // length of the fade-in in milliseconds (0 = appear instantly)
const LOADING_TEXT = 'loading...'; // shown in the middle while loading ('' = none)

// ---------- Layers ----------
// Drawn in this order: FIRST file is at the back, LAST is on top.
// The sky isn't an image: it's painted by the code (see SKY_COLORS).
const LAYER_FILES = [
  'XXVIbackground.png',
  'XXVImiddle.png',
  'XXVIfront.png',
  'XXVIforeground.png'
];

const ART_W = 1366;
const ART_H = 1025;
const FIT_MODE = 'contain'; // or 'cover'

// Which layers get the sunny colour shift and the rain/snow blur
// (one entry per layer, same order as LAYER_FILES)
const SUNNY_LAYERS = [true, false, false, false];
const BLUR_LAYERS  = [true, false, false, false];

// ---------- Precipitation bands ----------
// One band is drawn after each layer: band 0 falls behind the middle
// layer, band 1 behind the front, band 2 behind the foreground and
// band 3 in front of everything.
// depth:    size and speed (small and slow far away, larger up close)
// rainMax / snowMax: number of particles in heavy rain or snow
//           (set to 0 to keep that kind of weather out of a band)
// veil:  how much a heavy storm washes out everything behind this band
//        (0-255). This is what makes the weather read as sitting
//        between the layers: nearer layers stay crisp.
const BANDS = [
  { depth: 0.35, rainMax: 380, snowMax: 380, veil: 60 },
  { depth: 0.50, rainMax: 220, snowMax: 220, veil: 35 },
  { depth: 0.65, rainMax: 110, snowMax: 110, veil: 20 },
  { depth: 1.20, rainMax: 0,   snowMax: 45,  veil: 0 }  // in front: snow only
];

// Blur during rain or snow (layers chosen in BLUR_LAYERS)
const BG_BLUR = 0.85;       // 0 = never blurred, 1 = fully blurred in heavy weather
const BG_BLUR_SOFTNESS = 2; // higher = blurrier (how far the copy is shrunk)

// Colour on sunny days (layers chosen in SUNNY_LAYERS)
const SUNNY_STRENGTH = 1.0;   // 0 = off, 1 = full effect under clear skies
const SUNNY_SATURATION = 1.5; // 1 = unchanged, higher = more saturated
const SUNNY_BLUE = 0.15;      // 0 = no shift, higher = bluer

// Night: one darkening colour per layer, back to front.
// Distant layers stay lighter and bluer (atmosphere and sky glow);
// nearer layers go darker, becoming silhouettes.
// Lower numbers = darker. Reverse the order for the opposite effect.
const NIGHT_COLORS = [
  [40, 45, 83],     // background: darkest, far from the city lights
  [47, 60, 92],     // middle
  [75, 80, 92],    // front: starting to catch the glow
  [120, 112, 110]   // foreground: lightest, warm city light
];
const NIGHT_STRENGTH = 1.0;

// Rain: one colour per layer, back to front, that the layer is multiplied
// by while it rains (bluer and darker). Lower numbers = darker.
// Nearer layers go a little darker, like wet ground.
const RAIN_LAYER_COLORS = [
  [182, 196, 226],  // background
  [172, 186, 220],  // middle
  [164, 178, 214],  // front
  [156, 170, 208]   // foreground
];
const RAIN_TINT = 1.0; // 0 = off, 1 = full (scaled further by how hard it's raining)

// Snow: same idea, but a lighter, cooler, greyer shift: the flat,
// shadowless light of a snowy day. Lower numbers = darker.
const SNOW_LAYER_COLORS = [
  [218, 225, 238],  // background
  [210, 218, 234],  // middle
  [203, 212, 230],  // front
  [201, 206, 238]   // foreground
];
const SNOW_TINT = 1.0; // 0 = off, 1 = full (scaled further by how hard it's snowing)
const TWILIGHT_MINUTES = 45;       // how long the fade takes after sunset / before sunrise

// ---------- Sky ----------
// The sky is a gradient from `top` (top of the painting) to `bottom`
// (the horizon), blended from these colours by the weather:
// cloud cover moves from clear toward cloudy, rain and snow take over
// in wet weather, dusk warms the horizon at sunset/sunrise, and night
// takes over after dark (lighter and warmer on cloudy nights, when
// the clouds reflect the city lights).
const SKY_COLORS = {
  clear:       { top: [ 92, 145, 205], bottom: [188, 212, 232] },
  cloudy:      { top: [150, 158, 170], bottom: [202, 206, 212] },
  rain:        { top: [104, 114, 132], bottom: [158, 166, 180] },
  snow:        { top: [184, 191, 204], bottom: [222, 226, 234] },
  dusk:        { top: [ 72,  82, 138], bottom: [236, 162, 122] },
  night:       { top: [ 10,  14,  36], bottom: [ 52,  46,  72] },
  cloudyNight: { top: [ 36,  36,  48], bottom: [ 88,  74,  78] }
};

// Stars in the sky at night. They're drawn on the sky, so every
// mountain layer in front hides them automatically.
const STAR_COUNT = 200;
const STAR_HORIZON = 0.8;      // how far down the painting stars can appear, fading downward
const STAR_BRIGHTNESS = 1.0;  // above 1 makes the fainter stars brighter
const STAR_SIZE = 1;        // base star size in screen pixels
const STAR_TWINKLE = true;     // gentle twinkle (runs a slow animation on clear nights)

const RAIN_COLOR = [135, 150, 175];
const SNOW_COLOR = [255, 255, 255];
const RAIN_VEIL = [205, 210, 220];
const SNOW_VEIL = [240, 242, 248];

// ---------- Weather settings ----------
const LAT = 41.45;    // Promontory Mountains, Utah (approximate centre)
const LON = -112.45;
const REFRESH_MINUTES = 15;
const SHOW_INFO = true;

// How strongly the wind pushes rain and snow sideways, and how much it gusts
const WIND_PUSH = 0.6;   // rain; snow uses a share of this
const GUSTINESS = 0.5;   // 0 = steady wind, 1 = very gusty

// Preview without waiting for real weather, e.g.
// { temp: 85, code: 0, cloud: 0, isDay: true, windSpeed: 5, windDir: 270 } clear and sunny
// { temp: 40, code: 0, cloud: 0, isDay: false, night: 1 }                   night (0.5 = dusk)
// { temp: 28, code: 73, windSpeed: 12, windDir: 270 }   moderate snow, west wind
// { temp: 55, code: 65, windSpeed: 20, windDir: 90 }    heavy rain, east wind
// Leave null for live data.
const TEST_WEATHER = null;
//const TEST_WEATHER = { temp: 20, code: 73, windSpeed: 10, windDir: 270, isDay: false, night: 1};

// ---------- Weather button ----------
// The button cycles: Live weather → each preset below → back to Live.
// Live weather keeps updating in the background the whole time.
// Add, remove or reorder presets freely.
const PRESETS = [
  { name: 'Rainstorm',   temp: 52, code: 65, cloud: 100, isDay: true,  night: 0, windSpeed: 35, windDir: 270 },
  { name: 'Snowy day',    temp: 12, code: 75, cloud: 100, isDay: true,  night: 0, windSpeed: 45, windDir: 300 },
  { name: 'Snowy night', temp: 22, code: 73, cloud: 100, isDay: false, night: 1, windSpeed: 8,  windDir: 270 },
  { name: 'Clear day',   temp: 85, code: 0,  cloud: 0,   isDay: true,  night: 0, windSpeed: 5,  windDir: 270 },
  { name: 'Clear night', temp: 40, code: 0,  cloud: 0,   isDay: false, night: 1, windSpeed: 3,  windDir: 270 }
];

// ---------- State ----------
let layers = new Array(LAYER_FILES.length).fill(null);
let failed = [];
let effects = LAYER_FILES.map(() => ({})); // sunny / blurred / rain / snow / night copies, made when needed
let effectErrors = [];
let stars = [];
let weather = null;
let weatherError = null;
let liveWeather = null; // latest real weather, kept even while a preset is showing
let mode = 0;           // 0 = live, 1+ = PRESETS[mode - 1]
let weatherButton;
let precip = { type: 'none', intensity: 0 };
let particles = BANDS.map(() => []);
let revealStart = null;   // when the fade-in began
let revealFinished = false;

function setup() {
  // Phones report 3x screens; 2x looks the same and uses far less memory
  pixelDensity(min(2, displayDensity()));
  createCanvas(windowWidth, windowHeight);
  imageMode(CENTER);
  frameRate(30);
  noLoop(); // animation only runs while it's raining or snowing
  stars = makeStars();

  // Load the layers one at a time rather than all at once: phones handle
  // this far better (less memory at once, fewer dropped downloads)
  loadLayer(LAYER_FILES[0], 0, 0);

  if (TEST_WEATHER) {
    liveWeather = TEST_WEATHER;
    applyWeather(liveWeather);
  } else {
    fetchWeather();
    setInterval(fetchWeather, REFRESH_MINUTES * 60 * 1000);
  }

  if (SHOW_BUTTON) makeWeatherButton();

  // Redraw every minute so dusk and dawn fade smoothly
  setInterval(() => { prepareEffects(); updateLooping(); redraw(); }, 60 * 1000);
}

// Start loading the layer after layer i, if there is one; once the last
// layer is done, start the fade-in
function loadNext(i) {
  if (i + 1 < LAYER_FILES.length) {
    loadLayer(LAYER_FILES[i + 1], i + 1, 0);
  } else {
    revealStart = millis();
    loop(); // animate the fade-in
  }
}

// Load one layer. If it fails, try again (up to twice) with a fresh
// request, which gets around a stale or half-downloaded copy in the
// phone's cache. The reason for a final failure is shown on screen.
function loadLayer(file, i, attempt) {
  const url = attempt === 0 ? file : `${file}?retry=${attempt}-${Date.now()}`;
  loadImage(
    url,
    img => {
      layers[i] = img;
      prepareEffects();
      redraw();
      loadNext(i);
    },
    err => {
      if (attempt < 2) {
        setTimeout(() => loadLayer(file, i, attempt + 1), 1000);
        return;
      }
      const reason = (err && (err.message || err.type)) || 'unknown error';
      // The p5 web editor swaps file names for long asset links, so show
      // the layer number and just the end of the link
      const shortName = file.length > 40 ? '…' + file.slice(-12) : file;
      failed.push(`layer ${i + 1} of ${LAYER_FILES.length} (${shortName}): ${reason}`);
      console.error('Could not load', file, err);
      redraw();
      loadNext(i);
    }
  );
}

async function fetchWeather() {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${LAT}&longitude=${LON}` +
    '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,is_day' +
    '&daily=sunrise,sunset&forecast_days=1&timeformat=unixtime' +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FDenver';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    weatherError = null;
    liveWeather = {
      temp: data.current.temperature_2m,
      code: data.current.weather_code,
      windSpeed: data.current.wind_speed_10m,
      windDir: data.current.wind_direction_10m,
      cloud: data.current.cloud_cover,
      isDay: data.current.is_day === 1,
      sunrise: data.daily.sunrise[0], // seconds since 1970, so it works in any time zone
      sunset: data.daily.sunset[0]
    };
    // Only change the scene if the viewer is watching live weather
    if (mode === 0) applyWeather(liveWeather);
  } catch (e) {
    weatherError = e.message;
    console.error('Weather fetch failed:', e);
    if (mode === 0) redraw();
  }
}

// ---------- Button ----------
function makeWeatherButton() {
  weatherButton = createButton('');
  weatherButton.mousePressed(cycleWeather);
  weatherButton.attribute('aria-live', 'polite');
  weatherButton.style('position', 'fixed');
  weatherButton.style('padding', '10px 16px');
  weatherButton.style('font', '11px/1.2 system-ui, -apple-system, sans-serif');
  weatherButton.style('color', '#414141');
  weatherButton.style('background', 'rgba(255, 255, 255, 0.85)');
  weatherButton.style('border', '1px solid #104878');
  weatherButton.style('border-radius', '20px');
  weatherButton.style('cursor', 'pointer');
  weatherButton.style('-webkit-tap-highlight-color', 'transparent');
  updateButtonLabel();
  positionButton(); // after styling, so its height is known
}

// Place the button between the screen corner and the painting's corner
function positionButton() {
  if (!weatherButton) return;
  const { ox, oy } = artLayout();
  const btnH = weatherButton.elt.offsetHeight;
  const top = oy - ART_GAP - btnH; // just above the painting
  const right = ox;                // lined up with its right edge
  weatherButton.style('top', `max(calc(env(safe-area-inset-top, 0px) + ${EDGE_GAP}px), ${top}px)`);
  weatherButton.style('right', `max(calc(env(safe-area-inset-right, 0px) + ${EDGE_GAP}px), ${right}px)`);
}

function updateButtonLabel() {
  if (!weatherButton) return;
  const label = mode === 0 ? 'Live weather' : PRESETS[mode - 1].name;
  weatherButton.html('Weather: ' + label);
}

function cycleWeather() {
  mode = (mode + 1) % (PRESETS.length + 1);
  updateButtonLabel();

  if (mode > 0) {
    applyWeather(PRESETS[mode - 1]);
  } else if (liveWeather) {
    applyWeather(liveWeather);
  } else {
    // Live weather hasn't arrived (or failed): show the plain painting
    applyWeather({ code: 0, isDay: true, night: 0 });
    weather = null;
    redraw();
  }
}

function applyWeather(w) {
  weather = w;
  precip = precipFromCode(w.code);

  // Grow or shrink each band to match the intensity
  BANDS.forEach((band, i) => {
    const bandMax = precip.type === 'snow' ? band.snowMax : band.rainMax;
    const target = floor((bandMax || 0) * precip.intensity);
    while (particles[i].length < target) particles[i].push(newParticle(true));
    particles[i].length = target;
  });

  prepareEffects();
  updateLooping();
  redraw();
}

// ---------- Effect copies ----------
// Each effect needs a full-size copy of every layer, which adds up to a lot
// of memory. Phones (especially iPhones) refuse to load the page past a
// limit, so copies are only made for the weather on screen right now and
// thrown away when the weather changes.
function neededEffects() {
  const need = new Set();
  if (!weather) return need;
  if (sunniness() > 0) need.add('sunny');
  if (precip.intensity > 0) need.add('blurred');
  if (precip.type === 'rain') need.add('rain');
  if (precip.type === 'snow') need.add('snow');
  if (nightness() > 0) need.add('night');
  return need;
}

function prepareEffects() {
  const need = neededEffects();
  const tintSets = { rain: RAIN_LAYER_COLORS, snow: SNOW_LAYER_COLORS, night: NIGHT_COLORS };

  layers.forEach((img, i) => {
    if (!img) return;
    const fx = effects[i];
    try {
      // Let go of copies that aren't needed any more
      if (!need.has('sunny')) dropEffect(fx, 'sunny');
      if (!need.has('blurred')) dropEffect(fx, 'blurred');
      for (const kind in tintSets) {
        if (!need.has(kind)) dropEffect(fx, kind);
        if (!need.has(kind) || !fx.blurred) dropEffect(fx, kind + 'Blurred');
      }

      // Make the ones that are
      if (need.has('sunny') && SUNNY_LAYERS[i] && !fx.sunny) fx.sunny = makeSunny(img);
      if (need.has('blurred') && BLUR_LAYERS[i] && !fx.blurred) fx.blurred = makeBlurred(img);
      for (const kind in tintSets) {
        const col = tintSets[kind][i];
        if (!need.has(kind) || !col) continue;
        if (!fx[kind]) fx[kind] = makeTinted(img, col);
        if (fx.blurred && !fx[kind + 'Blurred']) fx[kind + 'Blurred'] = makeTinted(fx.blurred, col);
      }
    } catch (e) {
      // If a copy can't be made, show the layer without that effect
      console.error('Could not prepare effects for', LAYER_FILES[i], e);
      if (!effectErrors.includes(LAYER_FILES[i])) effectErrors.push(LAYER_FILES[i]);
    }
  });
}

// Throw away one effect copy and free its memory straight away.
// iPhones hold on to image memory long after it's discarded unless the
// image's canvas is shrunk to nothing, so that's done here first.
function dropEffect(fx, key) {
  const effectImg = fx[key];
  if (!effectImg) return;
  if (effectImg.canvas) {
    effectImg.canvas.width = 0;
    effectImg.canvas.height = 0;
  }
  effectImg.pixels = [];
  delete fx[key];
}

// Animate only when something is moving: fast for rain and snow,
// slow for twinkling stars, not at all otherwise (saves battery)
function updateLooping() {
  if (revealStart !== null && !revealFinished) {
    loop(); // keep animating until the fade-in is done
  } else if (precip.intensity > 0) {
    frameRate(30);
    loop();
  } else if (STAR_TWINKLE && starVisibility() > 0) {
    frameRate(12);
    loop();
  } else {
    noLoop();
  }
}

// Weather code → type of precipitation and how heavy (0 to 1)
function precipFromCode(code) {
  const table = {
    51: ['rain', 0.2], 53: ['rain', 0.35], 55: ['rain', 0.5],   // drizzle
    56: ['rain', 0.3], 57: ['rain', 0.5],                       // freezing drizzle
    61: ['rain', 0.4], 63: ['rain', 0.65], 65: ['rain', 1.0],   // rain
    66: ['rain', 0.5], 67: ['rain', 0.9],                       // freezing rain
    80: ['rain', 0.45], 81: ['rain', 0.7], 82: ['rain', 1.0],   // showers
    95: ['rain', 0.9], 96: ['rain', 1.0], 99: ['rain', 1.0],    // thunderstorm
    71: ['snow', 0.35], 73: ['snow', 0.65], 75: ['snow', 1.0],  // snow
    77: ['snow', 0.3],                                          // snow grains
    85: ['snow', 0.5], 86: ['snow', 0.9]                        // snow showers
  };
  const hit = table[code];
  return hit ? { type: hit[0], intensity: hit[1] } : { type: 'none', intensity: 0 };
}

// Make a soft copy of an image once: shrinking it and blurring the small
// version is far faster than blurring the full-size image every frame.
function makeBlurred(img) {
  const soft = img.get();
  const fullSize = soft.canvas;
  soft.resize(max(1, floor(img.width / BG_BLUR_SOFTNESS)), 0);
  // Resizing leaves the full-size canvas behind: free it straight away
  if (fullSize && fullSize !== soft.canvas) { fullSize.width = 0; fullSize.height = 0; }
  soft.filter(BLUR, 1);
  return soft;
}

// Make a bluer, more saturated copy of an image once
function makeSunny(img) {
  const sunny = img.get();
  sunny.loadPixels();
  const px = sunny.pixels;
  for (let k = 0; k < px.length; k += 4) {
    let r = px[k], g = px[k + 1], b = px[k + 2];
    // Push each colour away from its grey value to boost saturation
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = lum + (r - lum) * SUNNY_SATURATION;
    g = lum + (g - lum) * SUNNY_SATURATION;
    b = lum + (b - lum) * SUNNY_SATURATION;
    // Shift toward blue
    r *= 1 - SUNNY_BLUE * 0.6;
    g *= 1 - SUNNY_BLUE * 0.2;
    b += (255 - b) * SUNNY_BLUE;
    px[k] = r;       // the pixel array keeps values within 0-255 by itself
    px[k + 1] = g;
    px[k + 2] = b;
    // alpha (px[k + 3]) is left alone so transparency is kept
  }
  sunny.updatePixels();
  return sunny;
}

// Place stars once, scattered across the sky
function makeStars() {
  const tints = [[255, 255, 255], [255, 244, 225], [220, 232, 255]];
  const list = [];
  for (let k = 0; k < STAR_COUNT; k++) {
    const bright = pow(random(), 3); // mostly faint, a few bright
    list.push({
      x: random(ART_W),
      y: pow(random(), 1.4) * ART_H * STAR_HORIZON, // denser toward the top
      size: STAR_SIZE * (1 + bright * 1.5), // in screen pixels
      bright: 0.6 + 0.4 * bright,
      phase: random(TWO_PI),
      speed: random(0.5, 2),
      tint: random(tints)
    });
  }
  return list;
}

// Paint the sky gradient behind the painting, coloured by the weather
function drawSky(ox, oy, w, h) {
  const blendSky = (a, b, t) => ({
    top: a.top.map((v, k) => lerp(v, b.top[k], t)),
    bottom: a.bottom.map((v, k) => lerp(v, b.bottom[k], t))
  });
  const C = SKY_COLORS;
  let sky = C.clear;

  if (weather) {
    const cloud = constrain(cloudAmount() / 100, 0, 1);
    sky = blendSky(C.clear, C.cloudy, cloud);
    if (precip.type === 'rain') sky = blendSky(sky, C.rain, 0.4 + 0.6 * precip.intensity);
    if (precip.type === 'snow') sky = blendSky(sky, C.snow, 0.4 + 0.6 * precip.intensity);

    const n = nightness();
    if (n > 0) {
      sky = blendSky(sky, C.dusk, sin(PI * n) * (1 - cloud * 0.6)); // warmest halfway through twilight
      const overcast = max(cloud, precip.intensity);
      sky = blendSky(sky, blendSky(C.night, C.cloudyNight, overcast), n);
    }
  }

  const g = drawingContext.createLinearGradient(0, oy, 0, oy + h * STAR_HORIZON);
  g.addColorStop(0, `rgb(${sky.top.map(v => Math.round(v)).join(',')})`);
  g.addColorStop(1, `rgb(${sky.bottom.map(v => Math.round(v)).join(',')})`);
  drawingContext.save();
  drawingContext.fillStyle = g;
  drawingContext.fillRect(ox, oy, w, h);
  drawingContext.restore();
}

function drawStars(ox, oy, s, w, h) {
  const v = starVisibility() * STAR_BRIGHTNESS;
  if (v <= 0) return;

  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(ox, oy, w, h);
  drawingContext.clip();

  push();
  translate(ox, oy);
  scale(s);
  noStroke();
  for (const st of stars) {
    const twinkle = STAR_TWINKLE ? 0.75 + 0.25 * sin(millis() * 0.002 * st.speed + st.phase) : 1;
    const fade = map(st.y, 0, ART_H * STAR_HORIZON, 1, 0.35); // dimmer near the horizon
    fill(...st.tint, min(255, 255 * v * st.bright * twinkle * fade));
    circle(st.x, st.y, st.size / s);
  }
  pop();
  drawingContext.restore();
}

// Make a copy of a layer once, multiplied by a colour (used for night and rain)
function makeTinted(img, col) {
  const dark = img.get();
  dark.loadPixels();
  const px = dark.pixels;
  for (let k = 0; k < px.length; k += 4) {
    px[k]     = px[k]     * col[0] / 255;
    px[k + 1] = px[k + 1] * col[1] / 255;
    px[k + 2] = px[k + 2] * col[2] / 255;
  }
  dark.updatePixels();
  return dark;
}

// How sunny it is, from 0 (not at all) to 1 (clear daytime sky)
function sunniness() {
  if (!weather || precip.intensity > 0) return 0;
  if (weather.isDay === false) return 0;
  const dayFactor = 1 - nightness();
  return constrain(1 - cloudAmount() / 100, 0, 1) * dayFactor;
}

// Cloud cover in %, estimated from the weather code if not given (e.g. in a test)
function cloudAmount() {
  if (weather.cloud != null) return weather.cloud;
  const guess = { 0: 0, 1: 25, 2: 50, 3: 100 }[weather.code];
  return guess != null ? guess : 100;
}

// How visible the stars are, from 0 (none) to 1 (clear, full night)
function starVisibility() {
  if (!weather || precip.intensity > 0 || stars.length === 0) return 0;
  return nightness() * constrain(1 - cloudAmount() / 100, 0, 1);
}

// How dark it is, from 0 (daytime) to 1 (full night), fading over twilight
// (uses the weather on screen unless another weather object is passed in)
function nightness(w = weather) {
  if (!w) return 0;
  if (w.night != null) return constrain(w.night, 0, 1); // test value
  if (w.sunrise && w.sunset) {
    const now = Date.now() / 1000;
    const fade = TWILIGHT_MINUTES * 60;
    if (now < w.sunrise) return constrain((w.sunrise - now) / fade, 0, 1);
    if (now > w.sunset) return constrain((now - w.sunset) / fade, 0, 1);
    return 0;
  }
  return w.isDay === false ? 1 : 0;
}

function newParticle(anywhere) {
  return {
    x: random(-200, ART_W + 200),
    y: anywhere ? random(-50, ART_H) : random(-80, -10),
    jitter: random(0.7, 1.3),
    // Rain streak length: mostly short, some long (skewed toward short)
    len: 0.25 + pow(random(), 1.8) * 1.75,
    // Per-drop opacity so streaks don't all look identical
    fade: random(0.45, 1),
    phase: random(TWO_PI)
  };
}

// Sideways wind in mph: positive blows left to right on screen.
// Open-Meteo gives the direction the wind comes FROM, so a west
// wind (270°) pushes to the right.
function windX() {
  if (!weather || weather.windSpeed == null) return 0;
  const steady = -sin(radians(weather.windDir)) * weather.windSpeed;
  const gust = 1 + GUSTINESS * (noise(frameCount * 0.015) - 0.5) * 2;
  return steady * gust;
}

// Where the painting sits on screen: scale, size and top-left corner
function artLayout() {
  const scaleX = width / ART_W;
  const scaleY = height / ART_H;
  const s = FIT_MODE === 'cover' ? max(scaleX, scaleY) : min(scaleX, scaleY);
  const w = ART_W * s;
  const h = ART_H * s;
  return { s, w, h, ox: (width - w) / 2, oy: (height - h) / 2 };
}


function draw() {
  background(255);
  // Nothing but the loading text and weather text until every layer has arrived
  if (revealStart === null) {
    if (LOADING_TEXT) {
      noStroke();
      fill('#414141');
      textSize(12);
      textAlign(CENTER, CENTER);
      text(LOADING_TEXT, width / 2, height / 2);
    }
    drawInfo();
    return;
  }

  const { s, w, h, ox, oy } = artLayout();

  // Sky and stars first, behind every mountain layer
  drawSky(ox, oy, w, h);
  drawStars(ox, oy, s, w, h);

  layers.forEach((img, i) => {
    drawLayer(i, w, h);

    if (BANDS[i]) drawBand(i, ox, oy, s, w, h);
  });

  // Fade in from white: a white cover over the painting that thins out
  const t = REVEAL_MS > 0 ? constrain((millis() - revealStart) / REVEAL_MS, 0, 1) : 1;
  if (t < 1) {
    noStroke();
    fill(255, 255 * (1 - t));
    rect(ox, oy, w, h);
  } else if (!revealFinished) {
    revealFinished = true;
    updateLooping(); // back to animating only when the weather needs it
  }

  drawInfo();
}

// Draw one layer with its weather effects faded in on top:
// sunny colour, rain/snow blur, then night darkening.
function drawLayer(i, w, h) {
  const img = layers[i];
  if (!img) return;
  const fx = effects[i];
  const fadeIn = (effectImg, a) => {
    if (!effectImg || a <= 0) return;
    drawingContext.globalAlpha = min(a, 1);
    image(effectImg, width / 2, height / 2, w, h);
    drawingContext.globalAlpha = 1;
  };

  image(img, width / 2, height / 2, w, h);

  if (fx.sunny) fadeIn(fx.sunny, SUNNY_STRENGTH * sunniness());

  const b = fx.blurred && precip.intensity > 0
    ? BG_BLUR * (0.4 + 0.6 * precip.intensity) : 0;
  fadeIn(fx.blurred, b);

  // Fade in a tinted sharp copy and a tinted blurred copy together,
  // so a blurred layer stays blurred when its colour changes
  const fadePair = (sharp, soft, a) => {
    if (!sharp || a <= 0) return;
    const ab = soft ? a * b : 0;
    fadeIn(sharp, ab < 1 ? (a - ab) / (1 - ab) : 0);
    fadeIn(soft, ab);
  };

  // Rain: bluer and darker, more so in heavier rain
  if (precip.type === 'rain') {
    fadePair(fx.rain, fx.rainBlurred, RAIN_TINT * (0.5 + 0.5 * precip.intensity));
  }

  // Snow: cooler and greyer, more so in heavier snow
  if (precip.type === 'snow') {
    fadePair(fx.snow, fx.snowBlurred, SNOW_TINT * (0.5 + 0.5 * precip.intensity));
  }

  // Night
  fadePair(fx.night, fx.nightBlurred, nightness() * NIGHT_STRENGTH);
}

function drawBand(i, ox, oy, s, w, h) {
  if (precip.intensity === 0) return;
  if (BANDS[i].veil === 0 && particles[i].length === 0) return;

  const band = BANDS[i];
  const d = band.depth;
  const dt = min(deltaTime / 33.3, 3); // keep speed steady if frames drop
  const wx = windX();

  // Keep precipitation inside the painting, not over the white margins
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(ox, oy, w, h);
  drawingContext.clip();

  push();
  translate(ox, oy);
  scale(s);

  // Wash out everything behind this band, stronger in heavier weather
  if (band.veil > 0) {
    noStroke();
    const veilColor = precip.type === 'rain' ? RAIN_VEIL : SNOW_VEIL;
    fill(...veilColor, band.veil * precip.intensity);
    rect(0, 0, ART_W, ART_H);
  }

  if (precip.type === 'rain') {
    const baseAlpha = 150 + 60 * min(d, 1);
    // At least ~1 screen pixel wide, however small the canvas is
    strokeWeight(max(2 * d, 1) / s);
    for (const p of particles[i]) {
      const vy = 24 * d * p.jitter;
      const vx = wx * WIND_PUSH * d;
      const len = 30 * d * p.jitter * p.len;
      stroke(...RAIN_COLOR, baseAlpha * p.fade);
      line(p.x, p.y, p.x - (vx / vy) * len, p.y - len);
      p.x += vx * dt;
      p.y += vy * dt;
      recycle(p, len);
    }
  } else {
    noStroke();
    fill(...SNOW_COLOR, 150 + 90 * min(d, 1));
    for (const p of particles[i]) {
      const r = max(6 * d, 2.5 / s) * p.jitter;
      circle(p.x, p.y, r);
      const sway = sin(frameCount * 0.03 + p.phase) * 0.8 * d;
      p.x += (wx * WIND_PUSH * 0.25 * d + sway) * dt;
      p.y += 1.8 * d * p.jitter * dt;
      recycle(p, r);
    }
  }

  pop();
  drawingContext.restore();
}

// Send a particle back to the top once it leaves the painting
function recycle(p, margin) {
  if (p.y > ART_H + margin) {
    Object.assign(p, newParticle(false));
  }
  if (p.x < -250) p.x += ART_W + 500;
  if (p.x > ART_W + 250) p.x -= ART_W + 500;
}

function drawInfo() {
  noStroke();
  fill('#414141');
  textSize(10);
  textAlign(LEFT, TOP);

  if (failed.length > 0) {
    text('Could not load:\n' + failed.join('\n'), 20, 20);
  }
  if (effectErrors.length > 0) {
    text('Effects unavailable for:\n' + effectErrors.join('\n'), 20, 20 + 20 * (failed.length + 1.5));
  }

  if (!SHOW_INFO) return;
  // Always describes the live weather, whichever preset the button shows
  textAlign(LEFT, TOP);
  const lw = liveWeather;
  let msg;
  if (weatherError) msg = 'Weather unavailable: ' + weatherError;
  else if (!lw) msg = 'Loading weather…';
  else {
    const lp = precipFromCode(lw.code);
    const what = lp.type === 'none'
      ? 'no precipitation'
      : `${lp.type} (${round(lp.intensity * 100)}%)`;
    const sky = lw.cloud != null ? `${round(lw.cloud)}% cloud, ` : '';
    const n = nightness(lw);
    const time = n >= 1 ? 'night, ' : n > 0 ? 'twilight, ' : '';
    msg = `Promontory Mtns: ${round(lw.temp)}°F, ${time}${sky}${what}, ` +
          `wind ${round(lw.windSpeed)} mph`;
  }
  // Just below the painting, lined up with its left edge
  const { ox, oy, h } = artLayout();
  const x = max(EDGE_GAP, ox);
  const y = min(oy + h + ART_GAP, height - EDGE_GAP - textAscent() - textDescent());
  text(msg, x, y);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  positionButton();
  redraw();
}