// High-graphics animated globe behind the power button.
// State-driven colour: gold (idle) → cyan (connecting) → green (connected).
// Degrades gracefully: if three.js is missing the app still works (CSS only).
let THREE;
try {
  THREE = await import("three");
} catch (e) {
  console.warn("three.js not bundled — globe disabled", e);
}

const STATE_COLORS = {
  disconnected: { a: 0xe8c074, b: 0x6b4f20 },
  connecting:   { a: 0x5ad0e8, b: 0x1e6f9a },
  connected:    { a: 0x41d98a, b: 0x12603a },
  error:        { a: 0xff6b6b, b: 0x7a2020 },
};

function initGlobe() {
  const canvas = document.getElementById("globe");
  if (!THREE || !canvas) {
    window.IranGlobe = { setState() {} };
    return;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0.2, 5.2);

  const root = new THREE.Group();
  root.rotation.z = 0.41; // ~23.5° axial tilt
  scene.add(root);

  // --- wireframe globe ---
  const sphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, 4),
    new THREE.MeshBasicMaterial({ color: 0x1a2b4d, transparent: true, opacity: 0.35, wireframe: true })
  );
  root.add(sphere);

  // --- glowing dot "cities" scattered on the surface ---
  const N = 320;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = 2 * Math.PI * Math.random();
    const r = 1.52;
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const dotsGeo = new THREE.BufferGeometry();
  dotsGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dotsMat = new THREE.PointsMaterial({
    color: 0xe8c074, size: 0.045, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const dots = new THREE.Points(dotsGeo, dotsMat);
  root.add(dots);

  // --- atmosphere halo (back-side additive shell) ---
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1.72, 48, 48),
    new THREE.MeshBasicMaterial({
      color: 0x5ad0e8, transparent: true, opacity: 0.06,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  root.add(halo);

  // --- distant starfield ---
  const stars = new Float32Array(600 * 3);
  for (let i = 0; i < stars.length; i++) stars[i] = (Math.random() - 0.5) * 40;
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0x9fb4d8, size: 0.04, transparent: true, opacity: 0.5,
  })));

  // --- colour state machine (lerped) ---
  const cur = new THREE.Color(STATE_COLORS.disconnected.a);
  const tgt = new THREE.Color(STATE_COLORS.disconnected.a);
  const curHalo = new THREE.Color(STATE_COLORS.disconnected.b);
  const tgtHalo = new THREE.Color(STATE_COLORS.disconnected.b);
  let speed = 0.0016;

  window.IranGlobe = {
    setState(state) {
      const c = STATE_COLORS[state] || STATE_COLORS.disconnected;
      tgt.set(c.a);
      tgtHalo.set(c.b);
      speed = state === "connecting" ? 0.006 : state === "connected" ? 0.0026 : 0.0016;
    },
  };

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  let raf = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function tick() {
    resize();
    if (!reduced) { root.rotation.y += speed; halo.rotation.y -= speed * 0.3; }
    cur.lerp(tgt, 0.05); curHalo.lerp(tgtHalo, 0.05);
    dotsMat.color.copy(cur);
    sphere.material.color.copy(curHalo).multiplyScalar(0.6);
    halo.material.color.copy(curHalo);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  // pause when hidden to save battery
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else tick();
  });

  // apply any state app.js set before the globe was ready
  if (window.__globeState) window.IranGlobe.setState(window.__globeState);
}

initGlobe();
