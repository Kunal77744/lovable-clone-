type GameState = "ready" | "running" | "gameover";
type EntityType = "relic" | "block" | "arch" | "thorns";

interface Entity {
  id: number;
  type: EntityType;
  lane: number;
  z: number;
  phase: number;
  collected: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;
const startPanel = document.querySelector<HTMLElement>("#start-panel")!;
const gameOverPanel = document.querySelector<HTMLElement>("#game-over-panel")!;
const startButton = document.querySelector<HTMLButtonElement>("#start-button")!;
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button")!;
const soundButton = document.querySelector<HTMLButtonElement>("#sound-toggle")!;
const distanceNode = document.querySelector<HTMLElement>("#distance")!;
const relicsNode = document.querySelector<HTMLElement>("#relics")!;
const finalDistanceNode = document.querySelector<HTMLElement>("#final-distance")!;
const finalRelicsNode = document.querySelector<HTMLElement>("#final-relics")!;
const runSummaryNode = document.querySelector<HTMLElement>("#run-summary")!;
const meterFill = document.querySelector<HTMLElement>("#run-meter-fill")!;
const toast = document.querySelector<HTMLElement>("#toast")!;

let width = 0;
let height = 0;
let dpr = 1;
let state: GameState = "ready";
let lastTime = performance.now();
let elapsed = 0;
let distance = 0;
let relics = 0;
let speed = 0.34;
let spawnTimer = 0;
let lane = 0;
let laneVisual = 0;
let jumpY = 0;
let jumpVelocity = 0;
let slideTimer = 0;
let stride = 0;
let entityId = 0;
let screenShake = 0;
let entities: Entity[] = [];
let particles: Particle[] = [];
let audioEnabled = true;
let audioContext: AudioContext | null = null;
let toastTimer = 0;

const colors = {
  fog: "#9ec1a0",
  stone: "#294739",
  stoneLight: "#496957",
  deep: "#06100d",
  track: "#263b31",
  trackLight: "#3c5547",
  gold: "#f2be4d",
  cloth: "#be4735",
  skin: "#9a633f",
  dark: "#101916",
};

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.round(rect.width);
  height = Math.round(rect.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function setState(next: GameState): void {
  state = next;
  startPanel.hidden = next !== "ready";
  gameOverPanel.hidden = next !== "gameover";
}

function reset(): void {
  elapsed = 0;
  distance = 0;
  relics = 0;
  speed = 0.34;
  spawnTimer = 0.6;
  lane = 0;
  laneVisual = 0;
  jumpY = 0;
  jumpVelocity = 0;
  slideTimer = 0;
  stride = 0;
  screenShake = 0;
  entities = [];
  particles = [];
  updateHud();
}

function startGame(): void {
  ensureAudio();
  reset();
  setState("running");
  chime(280, 0.09, "triangle");
  window.setTimeout(() => chime(420, 0.12, "triangle"), 70);
}

function gameOver(): void {
  state = "gameover";
  screenShake = 0.7;
  finalDistanceNode.textContent = `${Math.floor(distance)}m`;
  finalRelicsNode.textContent = String(relics);
  runSummaryNode.textContent =
    distance > 900
      ? "The deep vault opened for you."
      : distance > 450
        ? "You reached the old stone passage."
        : "The wild is waiting for another run.";
  gameOverPanel.hidden = false;
  thud();
}

function ensureAudio(): void {
  if (!audioEnabled) return;
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
}

function tone(frequency: number, duration: number, type: OscillatorType, volume: number): void {
  if (!audioEnabled) return;
  ensureAudio();
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function chime(frequency: number, duration = 0.1, type: OscillatorType = "sine"): void {
  tone(frequency, duration, type, 0.08);
}

function thud(): void {
  tone(95, 0.25, "sawtooth", 0.12);
}

function move(direction: number): void {
  if (state !== "running") return;
  const nextLane = Math.max(-1, Math.min(1, lane + direction));
  if (nextLane !== lane) {
    lane = nextLane;
    chime(170 + lane * 18, 0.06, "square");
  }
}

function jump(): void {
  if (state !== "running" || jumpY > 0.01 || slideTimer > 0) return;
  jumpVelocity = 1.35;
  chime(240, 0.1, "triangle");
}

function slide(): void {
  if (state !== "running" || jumpY > 0.08) return;
  slideTimer = 0.65;
  chime(145, 0.08, "square");
}

function handleAction(action: string): void {
  if (action === "left") move(-1);
  if (action === "right") move(1);
  if (action === "jump") jump();
  if (action === "slide") slide();
}

function updateHud(): void {
  distanceNode.textContent = String(Math.floor(distance));
  relicsNode.textContent = String(relics);
  meterFill.style.width = `${Math.min(100, (distance % 500) / 5)}%`;
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = 0.8;
}

function spawnPattern(): void {
  const obstacleTypes: EntityType[] = ["block", "arch", "thorns"];
  const difficulty = Math.min(0.72, distance / 1600);
  const lanes = [-1, 0, 1];
  const obstacleLane = lanes[Math.floor(Math.random() * lanes.length)];
  const obstacleType = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];

  entities.push({
    id: entityId++,
    type: obstacleType,
    lane: obstacleLane,
    z: 1.08,
    phase: Math.random() * Math.PI,
    collected: false,
  });

  if (Math.random() > 0.18 + difficulty * 0.2) {
    const safeLanes = lanes.filter((value) => value !== obstacleLane);
    const relicLane = safeLanes[Math.floor(Math.random() * safeLanes.length)];
    const count = Math.random() > 0.62 ? 3 : 1;
    for (let i = 0; i < count; i += 1) {
      entities.push({
        id: entityId++,
        type: "relic",
        lane: relicLane,
        z: 1.18 + i * 0.1,
        phase: Math.random() * Math.PI,
        collected: false,
      });
    }
  }
}

function spawnRelicBurst(x: number, y: number): void {
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * (30 + Math.random() * 35),
      vy: Math.sin(angle) * (30 + Math.random() * 35),
      life: 0.55 + Math.random() * 0.25,
      color: i % 3 === 0 ? "#fff0ad" : colors.gold,
    });
  }
}

function update(dt: number): void {
  const safeDt = Math.min(dt, 0.033);
  elapsed += safeDt;
  stride += safeDt * (state === "running" ? 10 + speed * 8 : 1.5);
  laneVisual += (lane - laneVisual) * Math.min(1, safeDt * 12);
  screenShake = Math.max(0, screenShake - safeDt * 3.6);

  if (toastTimer > 0) {
    toastTimer -= safeDt;
    if (toastTimer <= 0) toast.classList.remove("visible");
  }

  if (state === "running") {
    distance += safeDt * (52 + speed * 38);
    speed = Math.min(0.88, 0.34 + distance / 2400);
    spawnTimer -= safeDt;
    if (spawnTimer <= 0) {
      spawnPattern();
      spawnTimer = Math.max(0.62, 1.05 - speed * 0.36) + Math.random() * 0.2;
    }

    if (jumpY > 0 || jumpVelocity > 0) {
      jumpY += jumpVelocity * safeDt;
      jumpVelocity -= 3.15 * safeDt;
      if (jumpY <= 0) {
        jumpY = 0;
        jumpVelocity = 0;
      }
    }
    slideTimer = Math.max(0, slideTimer - safeDt);

    for (const entity of entities) {
      entity.z -= safeDt * speed;
      if (entity.collected || entity.z > 0.13 || entity.z < -0.03) continue;
      const inLane = Math.abs(entity.lane - laneVisual) < 0.42;
      if (!inLane) continue;

      if (entity.type === "relic") {
        entity.collected = true;
        relics += 1;
        const point = worldToScreen(entity.lane, 0.13);
        spawnRelicBurst(point.x, point.y - 54);
        showToast(relics % 10 === 0 ? `${relics} relics • vault bonus` : "+ relic");
        chime(620 + (relics % 4) * 70, 0.13, "sine");
      } else {
        const avoided =
          (entity.type === "block" && jumpY > 0.34) ||
          (entity.type === "thorns" && jumpY > 0.25) ||
          (entity.type === "arch" && slideTimer > 0.08);
        if (!avoided) {
          gameOver();
          break;
        }
      }
    }

    entities = entities.filter((entity) => entity.z > -0.15 && !entity.collected);
    updateHud();
  } else if (state === "ready") {
    jumpY = 0;
    laneVisual *= 0.95;
  }

  for (const particle of particles) {
    particle.x += particle.vx * safeDt;
    particle.y += particle.vy * safeDt;
    particle.vy += 68 * safeDt;
    particle.life -= safeDt;
  }
  particles = particles.filter((particle) => particle.life > 0);
}

function worldToScreen(entityLane: number, z: number): { x: number; y: number; scale: number } {
  const clampedZ = Math.max(0, Math.min(1, z));
  const t = 1 - clampedZ;
  const horizonY = height * 0.29;
  const groundY = height * 0.88;
  const y = horizonY + Math.pow(t, 1.55) * (groundY - horizonY);
  const trackHalf = width * (0.035 + Math.pow(t, 1.28) * 0.33);
  const x = width / 2 + entityLane * trackHalf * 0.62;
  const scale = 0.1 + Math.pow(t, 1.75) * 1.08;
  return { x, y, scale };
}

function drawBackground(): void {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#071612");
  sky.addColorStop(0.44, "#18372a");
  sky.addColorStop(1, "#0b1c16");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * 0.5;
  const sunY = height * 0.22;
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, width * 0.24);
  glow.addColorStop(0, "rgba(244, 191, 83, 0.32)");
  glow.addColorStop(0.16, "rgba(196, 154, 74, 0.13)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height * 0.66);

  ctx.fillStyle = "rgba(242, 190, 77, 0.55)";
  ctx.beginPath();
  ctx.arc(sunX, sunY, Math.max(14, width * 0.018), 0, Math.PI * 2);
  ctx.fill();

  drawMountainLayer(0.29, "#11271f", 0.048, 0.3);
  drawMountainLayer(0.33, "#0d211a", 0.07, 1.4);

  const horizonY = height * 0.29;
  const groundY = height;
  const nearHalf = width * 0.48;
  const farHalf = width * 0.035;

  ctx.fillStyle = colors.track;
  ctx.beginPath();
  ctx.moveTo(width / 2 - farHalf, horizonY);
  ctx.lineTo(width / 2 + farHalf, horizonY);
  ctx.lineTo(width / 2 + nearHalf, groundY);
  ctx.lineTo(width / 2 - nearHalf, groundY);
  ctx.closePath();
  ctx.fill();

  const edge = ctx.createLinearGradient(0, horizonY, 0, groundY);
  edge.addColorStop(0, "rgba(117, 143, 112, 0.14)");
  edge.addColorStop(1, "rgba(8, 20, 16, 0.68)");
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(width / 2 - farHalf, horizonY);
  ctx.lineTo(width / 2 - nearHalf, groundY);
  ctx.lineTo(0, groundY);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width, horizonY);
  ctx.lineTo(width / 2 + farHalf, horizonY);
  ctx.lineTo(width / 2 + nearHalf, groundY);
  ctx.lineTo(width, groundY);
  ctx.closePath();
  ctx.fill();

  drawTrackLines();
  drawRuins();
  drawMist();
}

function drawMountainLayer(base: number, color: string, amplitude: number, phase: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, height * base);
  const segments = 8;
  for (let i = 0; i <= segments; i += 1) {
    const x = (i / segments) * width;
    const wave = Math.sin(i * 2.1 + phase) * amplitude * height;
    const peak = (i % 2 === 0 ? -1 : 0.2) * amplitude * height;
    ctx.lineTo(x, height * base + wave + peak);
  }
  ctx.lineTo(width, height * 0.62);
  ctx.lineTo(0, height * 0.62);
  ctx.closePath();
  ctx.fill();
}

function drawTrackLines(): void {
  const offset = (elapsed * speed * 1.5) % 0.12;
  for (let z = 0.05 - offset; z < 1; z += 0.12) {
    const left = worldToScreen(-1.56, z);
    const right = worldToScreen(1.56, z);
    ctx.strokeStyle = `rgba(211, 215, 181, ${0.04 + (1 - z) * 0.11})`;
    ctx.lineWidth = Math.max(1, left.scale * 2.1);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }

  [-0.5, 0.5].forEach((divider) => {
    const far = worldToScreen(divider, 1);
    const near = worldToScreen(divider, 0);
    ctx.strokeStyle = "rgba(213, 219, 190, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(near.x, near.y);
    ctx.stroke();
  });
}

function drawRuins(): void {
  const drift = (elapsed * speed * 0.36) % 0.18;
  for (let i = 0; i < 11; i += 1) {
    const z = (i * 0.18 + 0.04 - drift + 1.2) % 1.2;
    if (z > 1) continue;
    const side = i % 2 === 0 ? -1 : 1;
    const point = worldToScreen(side * 2.25, z);
    const scale = point.scale;
    ctx.fillStyle = i % 3 === 0 ? colors.stoneLight : colors.stone;
    ctx.fillRect(
      point.x - 14 * scale,
      point.y - 92 * scale,
      28 * scale,
      92 * scale,
    );
    ctx.fillStyle = "rgba(4, 12, 10, 0.38)";
    ctx.fillRect(
      point.x - 9 * scale,
      point.y - 77 * scale,
      18 * scale,
      16 * scale,
    );
    ctx.strokeStyle = "rgba(198, 209, 175, 0.15)";
    ctx.lineWidth = Math.max(1, scale);
    ctx.strokeRect(
      point.x - 14 * scale,
      point.y - 92 * scale,
      28 * scale,
      92 * scale,
    );
  }
}

function drawMist(): void {
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = colors.fog;
  for (let i = 0; i < 7; i += 1) {
    const x = ((i * 241 + elapsed * 8 * (i % 2 ? 1 : -1)) % (width + 300)) - 150;
    const y = height * (0.35 + (i % 3) * 0.1);
    ctx.beginPath();
    ctx.ellipse(x, y, 180, 24 + i * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEntity(entity: Entity): void {
  const point = worldToScreen(entity.lane, entity.z);
  const { x, y, scale } = point;
  if (scale < 0.1) return;
  ctx.save();
  ctx.translate(x, y);

  if (entity.type === "relic") {
    const hover = Math.sin(elapsed * 5 + entity.phase) * 5 * scale;
    ctx.translate(0, -50 * scale + hover);
    ctx.rotate(elapsed * 1.8 + entity.phase);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 30 * scale);
    glow.addColorStop(0, "rgba(255, 226, 126, 0.46)");
    glow.addColorStop(1, "rgba(242, 190, 77, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-34 * scale, -34 * scale, 68 * scale, 68 * scale);
    ctx.fillStyle = colors.gold;
    ctx.beginPath();
    ctx.moveTo(0, -15 * scale);
    ctx.lineTo(12 * scale, 0);
    ctx.lineTo(0, 15 * scale);
    ctx.lineTo(-12 * scale, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff0b3";
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.stroke();
  }

  if (entity.type === "block") {
    const w = 68 * scale;
    const h = 76 * scale;
    ctx.fillStyle = colors.stoneLight;
    ctx.fillRect(-w / 2, -h, w, h);
    ctx.fillStyle = "rgba(6, 16, 13, 0.28)";
    ctx.fillRect(-w / 2 + 9 * scale, -h + 10 * scale, w - 18 * scale, 14 * scale);
    ctx.strokeStyle = "rgba(230, 226, 191, 0.25)";
    ctx.lineWidth = Math.max(1, scale * 2);
    ctx.strokeRect(-w / 2, -h, w, h);
    ctx.beginPath();
    ctx.moveTo(-w * 0.28, -h * 0.24);
    ctx.lineTo(w * 0.05, -h * 0.48);
    ctx.lineTo(w * 0.26, -h * 0.42);
    ctx.stroke();
  }

  if (entity.type === "arch") {
    const w = 92 * scale;
    const h = 142 * scale;
    ctx.fillStyle = colors.stoneLight;
    ctx.fillRect(-w / 2, -h, 22 * scale, h);
    ctx.fillRect(w / 2 - 22 * scale, -h, 22 * scale, h);
    ctx.fillRect(-w / 2, -h, w, 38 * scale);
    ctx.fillStyle = colors.deep;
    ctx.beginPath();
    ctx.arc(0, -h + 54 * scale, 27 * scale, Math.PI, 0);
    ctx.lineTo(27 * scale, -h + 92 * scale);
    ctx.lineTo(-27 * scale, -h + 92 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(230, 226, 191, 0.24)";
    ctx.lineWidth = Math.max(1, scale * 2);
    ctx.strokeRect(-w / 2, -h, w, h);
  }

  if (entity.type === "thorns") {
    ctx.fillStyle = "#8d6541";
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 18 * scale - 9 * scale, 0);
      ctx.lineTo(i * 18 * scale, -52 * scale - Math.abs(i) * 4 * scale);
      ctx.lineTo(i * 18 * scale + 9 * scale, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(244, 219, 167, 0.22)";
    ctx.lineWidth = Math.max(1, scale);
    ctx.beginPath();
    ctx.moveTo(-52 * scale, 0);
    ctx.lineTo(52 * scale, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRunner(): void {
  const base = worldToScreen(laneVisual, 0.06);
  const scale = Math.min(1.1, Math.max(0.82, width / 1000));
  const bob = state === "running" ? Math.sin(stride * 2) * 3 : Math.sin(elapsed * 2) * 2;
  const airborne = jumpY * Math.min(height * 0.32, 260);
  const sliding = slideTimer > 0;
  const runnerY = base.y - airborne + bob;
  const lean = (lane - laneVisual) * 0.18;

  ctx.save();
  ctx.translate(base.x, runnerY);
  ctx.rotate(lean);
  ctx.scale(scale, scale);

  const shadowScale = Math.max(0.5, 1 - jumpY * 0.55);
  ctx.save();
  ctx.translate(0, airborne - 2);
  ctx.scale(shadowScale, shadowScale);
  ctx.fillStyle = `rgba(0, 0, 0, ${0.3 - jumpY * 0.14})`;
  ctx.beginPath();
  ctx.ellipse(0, 8, 28, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (sliding) {
    ctx.translate(0, 5);
    ctx.rotate(-0.23);
    drawLimb(-7, -20, -29, -1, 9, colors.skin);
    drawLimb(7, -17, 27, -7, 9, colors.skin);
    drawLimb(-5, -18, -25, 6, 11, colors.dark);
    drawLimb(8, -16, 30, 1, 11, colors.dark);
    drawTorso(-2, -38, 0.1);
    drawHead(10, -52);
  } else {
    const armSwing = Math.sin(stride) * 14;
    const legSwing = Math.sin(stride) * 17;
    drawLimb(-7, -43, -17 - armSwing * 0.45, -24 + armSwing, 8, colors.skin);
    drawLimb(7, -43, 17 + armSwing * 0.45, -24 - armSwing, 8, colors.skin);
    drawLimb(-7, -14, -10 - legSwing * 0.38, 12 + Math.abs(legSwing) * 0.2, 11, colors.dark);
    drawLimb(7, -14, 10 + legSwing * 0.38, 12 + Math.abs(legSwing) * 0.2, 11, colors.dark);
    drawTorso(0, -38, Math.sin(stride) * 0.03);
    drawHead(0, -67);
  }

  ctx.restore();
}

function drawLimb(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawTorso(x: number, y: number, rotation: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = colors.cloth;
  ctx.beginPath();
  ctx.moveTo(-15, -18);
  ctx.lineTo(14, -18);
  ctx.lineTo(18, 20);
  ctx.lineTo(-16, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d76b4a";
  ctx.fillRect(-12, -14, 5, 30);
  ctx.fillStyle = colors.gold;
  ctx.fillRect(-17, 10, 35, 5);
  ctx.restore();
}

function drawHead(x: number, y: number): void {
  ctx.fillStyle = colors.skin;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.dark;
  ctx.beginPath();
  ctx.arc(x, y - 3, 12.5, Math.PI, Math.PI * 2);
  ctx.lineTo(x + 11, y + 1);
  ctx.lineTo(x - 10, y - 1);
  ctx.closePath();
  ctx.fill();
}

function drawParticles(): void {
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life / 0.8);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw(): void {
  ctx.save();
  if (screenShake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * screenShake * 14,
      (Math.random() - 0.5) * screenShake * 9,
    );
  }
  drawBackground();
  const sorted = [...entities].sort((a, b) => b.z - a.z);
  for (const entity of sorted) {
    if (entity.z > 0.06) drawEntity(entity);
  }
  drawRunner();
  for (const entity of sorted) {
    if (entity.z <= 0.06) drawEntity(entity);
  }
  drawParticles();
  ctx.restore();
}

function frame(now: number): void {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function handleKey(event: KeyboardEvent): void {
  const controlKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s", " "];
  if (controlKeys.includes(event.key)) event.preventDefault();
  if ((event.key === "Enter" || event.key === " ") && state !== "running") {
    startGame();
    return;
  }
  if (event.repeat) return;
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") move(-1);
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") move(1);
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w" || event.key === " ") jump();
  if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") slide();
}

let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener("pointerdown", (event) => {
  touchStartX = event.clientX;
  touchStartY = event.clientY;
});

canvas.addEventListener("pointerup", (event) => {
  if (state !== "running") return;
  const dx = event.clientX - touchStartX;
  const dy = event.clientY - touchStartY;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
  else if (dy < 0) jump();
  else slide();
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
soundButton.addEventListener("click", () => {
  audioEnabled = !audioEnabled;
  soundButton.setAttribute("aria-label", audioEnabled ? "Mute sound" : "Enable sound");
  soundButton.querySelector("span")!.textContent = audioEnabled ? "◖" : "○";
  if (audioEnabled) chime(420, 0.08, "sine");
});

document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handleAction(button.dataset.action ?? "");
  });
});

window.addEventListener("resize", resize);
window.addEventListener("keydown", handleKey);
document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
});

resize();
setState("ready");
requestAnimationFrame(frame);
