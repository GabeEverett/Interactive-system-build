import * as THREE from "three";

/* ------------------------------------------------------------------ *
 * COVID RIVER — v2
 * One data-driven surface. Data sets color, choppiness and flow.
 * The cursor pushes one swell. Nothing else.
 * ------------------------------------------------------------------ */

// Static snapshot dataset (illustrative cumulative figures).
// cases = cumulative, daily = representative new/day, pop = population.
const DATA = [
  { name: "United States", cases: 103000000, daily: 45000, pop: 331000000 },
  { name: "India", cases: 44700000, daily: 12000, pop: 1380000000 },
  { name: "Brazil", cases: 37500000, daily: 20000, pop: 212000000 },
  { name: "France", cases: 38000000, daily: 25000, pop: 67000000 },
  { name: "Germany", cases: 38400000, daily: 30000, pop: 83000000 },
  { name: "United Kingdom", cases: 24600000, daily: 15000, pop: 67000000 },
  { name: "Italy", cases: 25600000, daily: 18000, pop: 60000000 },
  { name: "Japan", cases: 33300000, daily: 40000, pop: 125000000 },
  { name: "South Korea", cases: 30600000, daily: 35000, pop: 51000000 },
  { name: "Australia", cases: 11400000, daily: 8000, pop: 25000000 },
  { name: "China", cases: 99300000, daily: 60000, pop: 1412000000 },
  { name: "Canada", cases: 4600000, daily: 3000, pop: 38000000 },
  { name: "Mexico", cases: 7500000, daily: 4000, pop: 126000000 },
  { name: "South Africa", cases: 4000000, daily: 1500, pop: 59000000 },
];

// Normalization anchors, derived once from the dataset.
const MAX_SAT = Math.max(...DATA.map((d) => d.cases / d.pop)); // peak saturation
const MAX_DAILY = Math.max(...DATA.map((d) => d.daily)); // peak daily flow

// ---- Three.js setup ----
const canvas = document.getElementById("river");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const INK = new THREE.Color("#070b0d");
const scene = new THREE.Scene();
scene.background = INK;

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 600);
camera.position.set(0, 13, 46);
camera.lookAt(0, -2, -40);

// Wide, long, dense surface. This IS the atmosphere.
const geometry = new THREE.PlaneGeometry(160, 340, 200, 380);

const uniforms = {
  uTime: { value: 0 },
  uFlow: { value: 0.4 },
  uTurb: { value: 1.0 },
  uPressure: { value: 0.2 },
  uPointer: { value: new THREE.Vector2(9999, 9999) },
  uPointerStrength: { value: 0 },
  uCalm: { value: new THREE.Color("#12454e") },
  uCrit: { value: new THREE.Color("#8f3d22") },
  uCrest: { value: new THREE.Color("#dfe6e3") },
  uFog: { value: INK },
};

const vertexShader = /* glsl */ `
  uniform float uTime, uFlow, uTurb, uPressure, uPointerStrength;
  uniform vec2 uPointer;
  varying float vH;
  varying vec3 vNormal;
  varying float vDepth;

  float heightAt(vec2 p) {
    float t = uTime;
    float f = 0.0;
    f += sin(p.y * 0.15 + t * 1.2 * uFlow) * 1.0;
    f += sin(p.y * 0.31 + p.x * 0.12 + t * 1.7 * uFlow) * 0.5;
    f += sin(p.y * 0.63 + p.x * 0.25 + t * 2.6 * uFlow) * 0.28 * (0.5 + uPressure);
    f += sin((p.x * 0.5 + p.y * 0.4) + t * 3.3 * uFlow) * 0.16 * uPressure;
    // single cursor swell
    float d = distance(p, uPointer);
    f += exp(-d * d * 0.012) * uPointerStrength * 2.6;
    return f * uTurb;
  }

  void main() {
    vec2 p = position.xy;
    float H = heightAt(p);
    float e = 1.0;
    float hx = heightAt(p + vec2(e, 0.0));
    float hy = heightAt(p + vec2(0.0, e));
    vNormal = normalize(vec3(H - hx, H - hy, 1.0));
    vH = H;
    vec3 pos = vec3(position.x, position.y, H);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uCalm, uCrit, uCrest, uFog;
  uniform float uPressure;
  varying float vH;
  varying vec3 vNormal;
  varying float vDepth;

  void main() {
    vec3 base = mix(uCalm, uCrit, uPressure);
    vec3 L = normalize(vec3(0.25, 0.55, 0.75));
    float diff = clamp(dot(normalize(vNormal), L) * 0.5 + 0.5, 0.0, 1.0);
    float crest = smoothstep(0.35, 1.7, vH);
    vec3 col = mix(base * (0.34 + 0.66 * diff), uCrest, crest * 0.55);
    float fog = smoothstep(24.0, 150.0, vDepth);
    col = mix(col, uFog, fog);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
const river = new THREE.Mesh(geometry, material);
river.rotation.x = -Math.PI / 2; // lay flat: local +y recedes into distance
scene.add(river);

// ---- Data -> targets (eased toward every frame) ----
const target = { flow: 0.4, turb: 1.0, pressure: 0.2 };

function applyRegion(d) {
  const saturation = d.cases / d.pop; // 0..MAX_SAT
  const pressure = saturation / MAX_SAT; // 0..1 normalized to peak region
  const flow = 0.15 + (d.daily / MAX_DAILY) * 0.95; // scroll speed
  const turb = 0.7 + pressure * 1.7; // choppiness grows with pressure

  target.flow = flow;
  target.turb = turb;
  target.pressure = pressure;

  // Readouts
  satVal.textContent = (saturation * 100).toFixed(1) + "%";
  flowVal.textContent = (0.15 + (d.daily / MAX_DAILY) * 0.95).toFixed(2) + "x";
  newVal.textContent = "+" + d.daily.toLocaleString();

  // State bands (the tightened rule)
  let label, cls;
  if (pressure < 0.4) {
    label = "CALM";
    cls = "state-calm";
  } else if (pressure < 0.75) {
    label = "TURBULENT";
    cls = "state-turbulent";
  } else {
    label = "CRITICAL";
    cls = "state-critical";
  }
  statePill.textContent = label;
  statePill.className = "state " + cls;
}

// ---- DOM wiring ----
const countrySel = document.getElementById("country");
const satVal = document.getElementById("satVal");
const flowVal = document.getElementById("flowVal");
const newVal = document.getElementById("newVal");
const statePill = document.getElementById("statePill");

DATA.forEach((d, i) => {
  const opt = document.createElement("option");
  opt.value = String(i);
  opt.textContent = d.name;
  countrySel.appendChild(opt);
});
countrySel.addEventListener("change", () => applyRegion(DATA[+countrySel.value]));
applyRegion(DATA[0]);

// Notes panel
const notes = document.getElementById("notes");
const notesToggle = document.getElementById("notesToggle");
const notesClose = document.getElementById("notesClose");
function setNotes(open) {
  notes.classList.toggle("hidden", !open);
  notes.setAttribute("aria-hidden", String(!open));
  notesToggle.setAttribute("aria-expanded", String(open));
}
notesToggle.addEventListener("click", () => setNotes(notes.classList.contains("hidden")));
notesClose.addEventListener("click", () => setNotes(false));

// ---- Cursor: the single surviving gesture ----
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

function onPointer(clientX, clientY) {
  ndc.x = (clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(groundPlane, hit)) {
    // world -> local plane coords (local y = -world z after rotation)
    uniforms.uPointer.value.set(hit.x, -hit.z);
    uniforms.uPointerStrength.value = 1.0;
  }
}
window.addEventListener("pointermove", (e) => onPointer(e.clientX, e.clientY));
window.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches[0]) onPointer(e.touches[0].clientX, e.touches[0].clientY);
  },
  { passive: true }
);

// ---- Resize ----
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ---- Loop ----
const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  uniforms.uTime.value += dt;

  // ease uniforms toward data targets (smooth region transitions)
  const k = 1 - Math.pow(0.0001, dt); // frame-rate independent lerp
  uniforms.uFlow.value += (target.flow - uniforms.uFlow.value) * k;
  uniforms.uTurb.value += (target.turb - uniforms.uTurb.value) * k;
  uniforms.uPressure.value += (target.pressure - uniforms.uPressure.value) * k;

  // cursor swell relaxes back to flat
  uniforms.uPointerStrength.value *= Math.pow(0.12, dt);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
