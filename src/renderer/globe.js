// 3D blockchain-network background: glowing block-nodes linked by edges, with
// data packets streaming along the links. Lighting (ambient + moving point lights)
// per threejs-lighting; mouse parallax via ray→plane per threejs-interaction.
// State drives the palette: gold (idle) → cyan (connecting) → green (connected).
// Degrades gracefully if three.js is missing.
let THREE;
try { THREE = await import("three"); } catch (e) { console.warn("three.js missing — bg disabled", e); }

const STATE = {
  disconnected: { node: 0xe8c074, edge: 0x6b4f20, flow: 0.18 },
  connecting:   { node: 0x5ad0e8, edge: 0x1e6f9a, flow: 0.55 },
  connected:    { node: 0x41d98a, edge: 0x176b43, flow: 1.0 },
  error:        { node: 0xff6b6b, edge: 0x7a2020, flow: 0.12 },
};

function init() {
  const canvas = document.getElementById("globe");
  if (!THREE || !canvas) { window.IranGlobe = { setState() {} }; return; }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const root = new THREE.Group();
  scene.add(root);

  // --- lighting (threejs-lighting: ambient fill + two point lights) ---
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.PointLight(0xffffff, 60, 60, 2); key.position.set(6, 6, 8); scene.add(key);
  const accent = new THREE.PointLight(0x5ad0e8, 40, 50, 2); accent.position.set(-6, -3, 6); scene.add(accent);

  // --- nodes (blocks) on a sphere-ish cloud ---
  const N = 22, R = 4.2;
  const nodeGeo = new THREE.IcosahedronGeometry(0.17, 0);
  const nodeMat = new THREE.MeshStandardMaterial({
    color: 0x14233f, emissive: 0xe8c074, emissiveIntensity: 1.4,
    metalness: 0.6, roughness: 0.3,
  });
  const nodes = [];
  for (let i = 0; i < N; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / N);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = R * (0.78 + Math.random() * 0.22);
    const p = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
    const m = new THREE.Mesh(nodeGeo, nodeMat);
    m.position.copy(p); m.scale.setScalar(0.7 + Math.random() * 0.9);
    root.add(m); nodes.push(p);
  }

  // --- edges: link each node to its 2 nearest neighbours ---
  const edges = [];
  const seen = new Set();
  for (let i = 0; i < N; i++) {
    const d = nodes.map((p, j) => ({ j, dist: p.distanceTo(nodes[i]) })).filter((o) => o.j !== i).sort((a, b) => a.dist - b.dist);
    for (let k = 0; k < 2; k++) {
      const j = d[k].j; const key2 = Math.min(i, j) + "-" + Math.max(i, j);
      if (!seen.has(key2)) { seen.add(key2); edges.push([i, j]); }
    }
  }
  const linePos = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], e) => {
    linePos.set([nodes[a].x, nodes[a].y, nodes[a].z, nodes[b].x, nodes[b].y, nodes[b].z], e * 6);
  });
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x6b4f20, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
  root.add(new THREE.LineSegments(lineGeo, lineMat));

  // --- data packets travelling along edges ---
  const P = 16;
  const packets = [];
  for (let i = 0; i < P; i++) packets.push({ e: (Math.random() * edges.length) | 0, t: Math.random(), spd: 0.004 + Math.random() * 0.006 });
  const pPos = new Float32Array(P * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  // soft round sprite
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const cx = cv.getContext("2d"); const g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(255,255,255,.8)"); g.addColorStop(1, "rgba(255,255,255,0)");
  cx.fillStyle = g; cx.fillRect(0, 0, 64, 64);
  const sprite = new THREE.CanvasTexture(cv);
  const pMat = new THREE.PointsMaterial({ size: 0.45, map: sprite, color: 0xe8c074, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(pGeo, pMat);
  root.add(pts);

  // --- faint starfield ---
  const stars = new Float32Array(500 * 3);
  for (let i = 0; i < stars.length; i++) stars[i] = (Math.random() - 0.5) * 60;
  const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0x9fb4d8, size: 0.05, transparent: true, opacity: 0.45 })));

  // --- state colour machine ---
  const curN = new THREE.Color(STATE.disconnected.node), tgtN = new THREE.Color(STATE.disconnected.node);
  const curE = new THREE.Color(STATE.disconnected.edge), tgtE = new THREE.Color(STATE.disconnected.edge);
  let flow = STATE.disconnected.flow, tgtFlow = flow;
  window.IranGlobe = {
    setState(s) {
      const c = STATE[s] || STATE.disconnected;
      tgtN.set(c.node); tgtE.set(c.edge); tgtFlow = c.flow;
      accent.color.set(c.node);
    },
  };

  // --- mouse parallax via ray→plane (threejs-interaction) ---
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(0, 0);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const target = new THREE.Vector2(0, 0);
  addEventListener("mousemove", (e) => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) { target.x = hit.y * 0.04; target.y = hit.x * 0.04; }
  });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  }

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0, t0 = performance.now();
  function tick() {
    resize();
    const dt = Math.min(0.05, (performance.now() - t0) / 1000); t0 = performance.now();
    curN.lerp(tgtN, 0.05); curE.lerp(tgtE, 0.05); flow += (tgtFlow - flow) * 0.05;
    nodeMat.emissive.copy(curN); lineMat.color.copy(curE); pMat.color.copy(curN);
    key.intensity = 50 + Math.sin(t0 / 600) * 14;

    if (!reduced) {
      root.rotation.y += 0.0016 + flow * 0.0016;
      root.rotation.x += (target.x - root.rotation.x) * 0.05;
      root.rotation.y += (target.y - (root.rotation.y % (Math.PI * 2))) * 0.0;
    }
    // advance packets
    for (let i = 0; i < P; i++) {
      const pk = packets[i]; pk.t += pk.spd * (0.4 + flow);
      if (pk.t >= 1) { pk.t = 0; pk.e = (Math.random() * edges.length) | 0; }
      const [a, b] = edges[pk.e]; const A = nodes[a], B = nodes[b];
      pPos[i * 3] = A.x + (B.x - A.x) * pk.t;
      pPos[i * 3 + 1] = A.y + (B.y - A.y) * pk.t;
      pPos[i * 3 + 2] = A.z + (B.z - A.z) * pk.t;
    }
    pGeo.attributes.position.needsUpdate = true;
    pMat.opacity = 0.5 + flow * 0.5;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else { t0 = performance.now(); tick(); }
  });
  if (window.__globeState) window.IranGlobe.setState(window.__globeState);
}

init();
