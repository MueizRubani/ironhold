import * as THREE from '../assets/lib/three.module.js?v=160';

// ============================================================
// Shared geometry / material helpers (low draw-call, low poly)
// ============================================================
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + '|' + (opts.emissive || '') + '|' + (opts.transparent ? 't' + (opts.opacity ?? 1) : '') + '|' + (opts.side || '') + (opts.depthWrite === false ? 'nw' : '');
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({
    color,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side || THREE.FrontSide,
    depthWrite: opts.depthWrite !== false,
    flatShading: true,
  });
  matCache.set(key, m);
  return m;
}
const geoCache = new Map();
export function boxGeo(w, h, d) {
  const k = `b${w},${h},${d}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); }
  return g;
}
export function cylGeo(rt, rb, h, seg = 8) {
  const k = `c${rt},${rb},${h},${seg}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); geoCache.set(k, g); }
  return g;
}
export function coneGeo(r, h, seg = 8) {
  const k = `k${r},${h},${seg}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.ConeGeometry(r, h, seg); geoCache.set(k, g); }
  return g;
}
export function sphereGeo(r, seg = 8) {
  const k = `s${r},${seg}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)); geoCache.set(k, g); }
  return g;
}
export function planeGeo(w, h) {
  const k = `p${w},${h}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.PlaneGeometry(w, h); geoCache.set(k, g); }
  return g;
}

export const C = {
  wood: 0x6b4a2c, woodDark: 0x4a3220, woodLight: 0x94683c,
  plaster: 0xd9c7a3, plasterDark: 0xbca986,
  stone: 0x9aa0a0, stoneDark: 0x737a7b, stoneLight: 0xb9bdb9,
  roof: 0x8d4c37, roofDark: 0x6f3b2b, roofBlue: 0x4a5d68, roofGreen: 0x4c6448,
  thatch: 0xb29255, thatchDark: 0x8f703b,
  gold: 0xd6ab55, iron: 0x8b969e, ironDark: 0x59636a,
  clothBlue: 0x3c5d7a, clothRed: 0x923f33, clothGold: 0xd6a84e, clothGreen: 0x4f6c44,
  skin: 0xd8b18a, skinDark: 0xb98c66,
  wheat: 0xd6b45c, leaf: 0x5f8c42, leafDark: 0x477030, dirt: 0x7b6242,
  fire: 0xff9b3d, window: 0xffc768, water: 0x4d7d86,
};

export function bx(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, opts) {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof color === 'number' ? mat(color, opts) : color);
  m.position.set(x, y, z); m.rotation.y = ry;
  return m;
}
export function cy(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 8, opts) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), typeof color === 'number' ? mat(color, opts) : color);
  m.position.set(x, y, z);
  return m;
}
export function co(r, h, color, x = 0, y = 0, z = 0, seg = 8, opts) {
  const m = new THREE.Mesh(coneGeo(r, h, seg), typeof color === 'number' ? mat(color, opts) : color);
  m.position.set(x, y, z);
  return m;
}
export function sp(r, color, x = 0, y = 0, z = 0, seg = 8, opts) {
  const m = new THREE.Mesh(sphereGeo(r, seg), typeof color === 'number' ? mat(color, opts) : color);
  m.position.set(x, y, z);
  return m;
}

// Gable roof (triangular prism)
const roofGeoCache = new Map();
export function roofGeo(w, h, d) {
  const k = `${w},${h},${d}`;
  if (roofGeoCache.has(k)) return roofGeoCache.get(k);
  const hw = w / 2, hd = d / 2;
  const verts = [
    // left slope
    -hw, 0, -hd, 0, h, -hd, 0, h, hd,
    -hw, 0, -hd, 0, h, hd, -hw, 0, hd,
    // right slope
    hw, 0, -hd, hw, 0, hd, 0, h, hd,
    hw, 0, -hd, 0, h, hd, 0, h, -hd,
    // gable front
    -hw, 0, hd, 0, h, hd, hw, 0, hd,
    // gable back
    -hw, 0, -hd, hw, 0, -hd, 0, h, -hd,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  roofGeoCache.set(k, g);
  return g;
}
export function roof(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(roofGeo(w, h, d), mat(color));
  m.position.set(x, y, z); m.rotation.y = ry;
  return m;
}

// merge geometries (non-indexed) with transforms — for instancing
export function mergeGeoms(list) {
  let total = 0;
  const parts = list.map(({ geo, m }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    total += g.attributes.position.count;
    return g;
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// ---- blob shadow texture (cheap contact shadows) ----
let blobTex = null;
export function getBlobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(18,14,8,0.52)');
  g.addColorStop(0.55, 'rgba(18,14,8,0.30)');
  g.addColorStop(1, 'rgba(18,14,8,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c);
  blobTex.colorSpace = THREE.SRGBColorSpace;
  return blobTex;
}
let blobMat = null;
export function getBlobMaterial() {
  if (!blobMat) blobMat = new THREE.MeshBasicMaterial({ map: getBlobTexture(), transparent: true, depthWrite: false, opacity: 1 });
  return blobMat;
}
export function blob(size, x, y, z) {
  const m = new THREE.Mesh(planeGeo(1, 1), getBlobMaterial());
  m.rotation.x = -Math.PI / 2;
  m.scale.set(size, size, 1);
  m.position.set(x, y, z);
  m.renderOrder = 1;
  return m;
}

// ============================================================
// Decorations
// ============================================================
export function makeFlag(color = C.clothBlue, poleH = 6, scale = 1) {
  const g = new THREE.Group();
  g.add(cy(0.08, 0.1, poleH, C.woodDark, 0, poleH / 2, 0, 6));
  g.add(sp(0.14, C.gold, 0, poleH + 0.08, 0, 6));
  const cloth = bx(2.0 * scale, 1.15 * scale, 0.06, color, 1.0 * scale, poleH - 0.7 * scale, 0, 0, { side: THREE.DoubleSide });
  g.add(cloth);
  g.add(bx(0.05, 1.15 * scale, 0.3 * scale, C.gold, 0.02, poleH - 0.7 * scale, 0));
  // swallow tail
  g.add(bx(0.3 * scale, 0.55 * scale, 0.06, color, 1.9 * scale, poleH - 0.42 * scale, 0));
  return g;
}

export function makeBanner(color = C.clothRed, scale = 1) {
  const g = new THREE.Group();
  g.add(cy(0.09, 0.12, 4.6 * scale, C.woodDark, 0, 2.3 * scale, 0, 6));
  g.add(bx(1.7 * scale, 2.6 * scale, 0.06, color, 0.85 * scale, 2.9 * scale, 0, 0, { side: THREE.DoubleSide }));
  g.add(bx(0.6 * scale, 0.6 * scale, 0.08, C.gold, 0.85 * scale, 3.0 * scale, 0.04));
  g.add(bx(0.2 * scale, 0.2 * scale, 0.1, color, 0.85 * scale, 3.0 * scale, 0.09));
  return g;
}

export function makeCrate(s = 0.8, color = C.woodLight) {
  const g = new THREE.Group();
  g.add(bx(s, s, s, color, 0, s / 2, 0));
  g.add(bx(s * 1.02, s * 0.14, s * 1.02, C.woodDark, 0, s * 0.25, 0));
  return g;
}
export function makeBarrel(s = 0.7) {
  const g = new THREE.Group();
  g.add(cy(s * 0.42, s * 0.5, s, C.woodLight, 0, s / 2, 0, 8));
  g.add(cy(s * 0.53, s * 0.53, s * 0.1, C.ironDark, 0, s * 0.22, 0, 8));
  g.add(cy(s * 0.53, s * 0.53, s * 0.1, C.ironDark, 0, s * 0.78, 0, 8));
  return g;
}
export function makeLogs(n = 4) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const l = cy(0.24, 0.26, 2.2, C.wood, 0, 0.27, 0, 6);
    l.rotation.z = Math.PI / 2;
    l.position.set(0, 0.27 + (i > 1 ? 0.48 : 0), (i % 2) * 0.55 - 0.27);
    g.add(l);
  }
  return g;
}
export function makeFence(w = 4) {
  const g = new THREE.Group();
  for (let i = 0; i <= w; i += 1) g.add(bx(0.12, 1.0, 0.12, C.woodDark, -w / 2 + i, 0.5, 0));
  g.add(bx(w, 0.11, 0.09, C.wood, 0, 0.7, 0));
  g.add(bx(w, 0.11, 0.09, C.wood, 0, 0.35, 0));
  return g;
}
export function makeFire(size = 1) {
  const g = new THREE.Group();
  const stones = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    stones.push(sp(0.2 * size, C.stoneDark, Math.cos(a) * 0.6 * size, 0.1, Math.sin(a) * 0.6 * size, 5));
  }
  stones.forEach(s => g.add(s));
  const flame = co(0.35 * size, 0.75 * size, C.fire, 0, 0.5 * size, 0, 6, { emissive: 0xff6a18, emissiveIntensity: 0.9 });
  flame.name = 'flame';
  g.add(flame);
  g.add(bx(0.9 * size, 0.12 * size, 0.12 * size, C.woodDark, 0, 0.1, 0));
  return g;
}

// ============================================================
// BUILDINGS
// ============================================================
function windowGlow(parent, x, y, z, ry = 0) {
  parent.add(bx(0.5, 0.62, 0.06, C.window, x, y, z, ry, { emissive: 0xffa93d, emissiveIntensity: 0.55 }));
}
function timberFrame(g, w, h, d, y) {
  g.add(bx(w * 1.01, 0.16, d * 1.01, C.woodDark, 0, y + h * 0.5, 0));
  g.add(bx(w * 1.01, 0.16, d * 1.01, C.woodDark, 0, y, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(bx(0.16, h, 0.16, C.woodDark, sx * w * 0.47, y + h / 2, sz * d * 0.47));
  }
  // diagonal beams
  const b1 = bx(0.13, h * 0.95, 0.13, C.woodDark, 0, y + h / 2, d * 0.5 + 0.01);
  b1.rotation.z = 0.55; g.add(b1);
}
function houseBase(g, w, h, d, wall = C.plaster) {
  g.add(bx(w + 0.4, 0.5, d + 0.4, C.stoneDark, 0, 0.25, 0));
  g.add(bx(w, h, d, wall, 0, h / 2 + 0.4, 0));
  timberFrame(g, w, h, d, 0.4);
  g.add(bx(1.0, 1.7, 0.12, C.woodDark, 0, 0.4 + 0.85, d / 2 + 0.04));
  windowGlow(g, -w * 0.28, 0.4 + h * 0.58, d / 2 + 0.06);
  windowGlow(g, w * 0.28, 0.4 + h * 0.58, d / 2 + 0.06);
}

function buildKeep(level) {
  const g = new THREE.Group();
  const L = level;
  const stone = L >= 2 ? C.stone : 0x8b8373;
  const stoneDark = L >= 2 ? C.stoneDark : 0x6b6456;
  const w = 9 + L * 2.1, d = 8 + L * 1.9, h = 4.5 + L * 1.4;
  // foundation
  g.add(bx(w + 2, 1.1, d + 2, C.stoneDark, 0, 0.55, 0));
  g.add(bx(w + 1.2, 0.5, d + 1.2, C.stone, 0, 1.2, 0));
  // main hall
  g.add(bx(w, h, d, stone, 0, 1.2 + h / 2, 0));
  // timber detail on lower levels
  if (L <= 1) {
    for (let i = -1; i <= 1; i += 2) {
      g.add(bx(0.25, h, 0.25, C.woodDark, i * w * 0.42, 1.2 + h / 2, d / 2 + 0.02));
      g.add(bx(w * 0.9, 0.2, 0.2, C.woodDark, 0, 1.2 + h * 0.55, d / 2 + 0.02));
    }
  }
  // roof
  if (L === 1) {
    // only the rear half of the hall roof still stands
    g.add(roof(w * 0.94, 2.0, d * 0.52, C.thatchDark, 0, 1.2 + h, -d * 0.23));
    g.add(bx(w * 0.9, 0.12, d * 0.44, 0x241d15, 0, 1.2 + h + 0.04, d * 0.23));
    for (let i = -2; i <= 2; i++) {
      g.add(bx(0.13, 0.13, d * 0.42, C.woodDark, i * w * 0.17, 1.2 + h + 0.16, d * 0.24));
    }
  } else if (L === 2) {
    g.add(roof(w * 0.96, 2.6, d * 0.96, C.roofBlue, 0, 1.2 + h, 0));
  }
  // central tower
  const tw = 4.2 + L * 0.35, th = h + 2.6 + L * 1.2;
  g.add(bx(tw, th, tw, stone, 0, 1.2 + th / 2, 0));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    g.add(bx(tw * 0.5, 4 + L * 1.3, tw * 0.5, stoneDark, Math.cos(a) * (w / 2 - 0.8), 1.2 + (4 + L * 1.3) / 2, Math.sin(a) * (d / 2 - 0.8)));
  }
  // battlements
  const crenY = 1.2 + h;
  for (let i = 0; i < Math.floor(w / 1.6); i++) {
    const x = -w / 2 + 0.8 + i * 1.6;
    if (Math.abs(x) < tw / 2 + 0.6) continue;
    g.add(bx(0.9, 0.9, 0.55, stoneDark, x, crenY + 0.45, d / 2 - 0.2));
    g.add(bx(0.9, 0.9, 0.55, stoneDark, x, crenY + 0.45, -d / 2 + 0.2));
  }
  // tower roof / top
  const topY = 1.2 + th;
  if (L >= 2) {
    g.add(roof(tw + 1.2, 2.8 + L * 0.5, tw + 1.2, L >= 4 ? C.clothGold : C.roofBlue, 0, topY, 0));
    const flag = makeFlag(L >= 4 ? C.clothRed : C.clothBlue, 3.4, 0.9);
    flag.position.set(0, topY + 2.6 + L * 0.4, 0);
    g.add(flag);
  } else {
    // ruined tower: flat, crenellated top with one broken run
    g.add(bx(tw + 0.7, 0.5, tw + 0.7, stoneDark, 0, topY + 0.25, 0));
    for (let side = 0; side < 4; side++) {
      for (let m = -1; m <= 1; m++) {
        if (side === 0 && m === 1) continue; // collapsed merlon
        const off = m * (tw + 0.7) * 0.34;
        const edge = (tw + 0.7) / 2;
        let mx = 0, mz = 0;
        if (side === 0) { mx = off; mz = edge; }
        else if (side === 1) { mx = off; mz = -edge; }
        else if (side === 2) { mx = edge; mz = off; }
        else { mx = -edge; mz = off; }
        g.add(bx(0.85, 0.85, 0.55, stoneDark, mx, topY + 0.9, mz));
      }
    }
    const flag = makeFlag(C.clothGold, 2.6, 0.8);
    flag.position.set(0, topY + 0.9, 0);
    g.add(flag);
  }
  // windows
  for (let i = -1; i <= 1; i++) {
    windowGlow(g, i * 2.2, 2.4 + h * 0.5, d / 2 + 0.06);
    if (L >= 3) windowGlow(g, i * 1.1, topY - 2.4, tw / 2 + 0.06);
  }
  // banners
  if (L >= 2) {
    const b1 = makeBanner(C.clothRed, 0.9); b1.position.set(w / 2 - 0.7, 1.2, d / 2 + 0.5); g.add(b1);
    const b2 = makeBanner(C.clothBlue, 0.9); b2.position.set(-w / 2 + 0.7, 1.2, d / 2 + 0.5); g.add(b2);
  }
  if (L >= 3) {
    // side turrets
    for (const sx of [-1, 1]) {
      g.add(cy(1.3, 1.5, 7 + L, C.stone, sx * (w / 2 - 0.4), 1.2 + (7 + L) / 2, d / 2 - 0.4, 8));
      g.add(co(1.9, 2.4, C.roofBlue, sx * (w / 2 - 0.4), 1.2 + 7 + L + 1.2, d / 2 - 0.4, 8));
    }
  }
  // forge / supply crates
  g.add(bx(2.4, 1.0, 1.4, C.woodLight, w * 0.32, 1.7, -d * 0.35));
  const crate = makeCrate(0.7); crate.position.set(-w * 0.38, 1.2, -d * 0.35); g.add(crate);
  if (L === 1) {
    // gaping holes and exposed timbers in the old hall
    g.add(bx(1.5, 1.9, 0.1, 0x2a241b, -w * 0.2, 1.2 + h * 0.52, d / 2 + 0.06));
    g.add(bx(0.9, 1.2, 0.1, 0x2a241b, w * 0.24, 1.2 + h * 0.7, d / 2 + 0.06));
    const beam1 = bx(0.24, 3.4, 0.16, C.woodDark, -w * 0.34, 1.2 + h * 0.48, d / 2 + 0.1);
    beam1.rotation.z = 0.55; g.add(beam1);
    const beam2 = bx(0.24, 2.6, 0.16, C.woodDark, w * 0.38, 1.2 + h * 0.42, d / 2 + 0.1);
    beam2.rotation.z = -0.5; g.add(beam2);
    // lean-to repair shelter
    for (const sz of [-2.1, 2.1]) {
      g.add(bx(0.13, 2.8, 0.13, C.woodDark, -w / 2 - 1.7, 1.4, sz));
      g.add(bx(0.13, 2.0, 0.13, C.woodDark, -w / 2 - 0.2, 1.0, sz));
    }
    const lean = bx(2.2, 0.12, 4.8, C.thatchDark, -w / 2 - 0.95, 2.75, 0);
    lean.rotation.z = 0.3; g.add(lean);
    // rubble around the base
    const rubble = [
      [-w * 0.55, 0.5, 0.9], [-w * 0.5, 0.35, 1.8], [w * 0.55, 0.4, 0.7],
      [w * 0.6, 0.3, 1.6], [w * 0.15, 0.35, d * 0.56], [-w * 0.1, 0.3, d * 0.58],
      [w * 0.42, 0.32, -d * 0.55],
    ];
    for (let i = 0; i < rubble.length; i++) {
      const [rx, ry, rz] = rubble[i];
      g.add(bx(0.45 + (i % 3) * 0.16, 0.3 + (i % 2) * 0.14, 0.4 + (i % 2) * 0.2, stoneDark, rx, ry, rz, i * 0.7));
    }
    // patched cloth over the worst hole
    g.add(bx(1.1, 0.7, 0.05, C.clothRed, w * 0.24, 1.2 + h * 0.55, d / 2 + 0.12));
    const brl = makeBarrel(0.7); brl.position.set(w * 0.44, 1.2, d * 0.42); g.add(brl);
    g.userData.smoke = new THREE.Vector3(-w / 2 - 1.15, 2.2, 1.0);
  }
  return g;
}

function buildHouse(level) {
  const g = new THREE.Group();
  const w = 4.6 + level * 0.5, h = 2.9 + level * 0.25, d = 4.0 + level * 0.4;
  houseBase(g, w, h, d, level >= 2 ? C.plaster : C.plasterDark);
  const roofY = h + 0.42;
  if (level >= 3) {
    g.add(bx(w + 0.5, h * 0.5, d + 0.5, C.plaster, 0, roofY + h * 0.25, 0));
    g.add(roof(w + 1.2, 1.8, d + 1.2, C.roofBlue, 0, roofY + h * 0.5, 0));
    windowGlow(g, 0, roofY + h * 0.25, d / 2 + 0.3);
  } else {
    g.add(roof(w + 1.05, 2.0, d + 1.05, level >= 2 ? C.roofBlue : C.thatchDark, 0, roofY, 0));
  }
  // chimney
  g.add(bx(0.55, 1.7, 0.55, C.stoneDark, w * 0.28, roofY + 0.7, -d * 0.2));
  g.userData.smoke = new THREE.Vector3(w * 0.28, roofY + 1.6, -d * 0.2);
  // little fence
  if (level >= 2) {
    const f = makeFence(3.2); f.position.set(-w * 0.75, 0, d * 0.35); g.add(f);
  }
  return g;
}

function buildLonghouse(level) {
  const g = new THREE.Group();
  const L = Math.min(5, level);
  const w = 7.2 + L * 0.55, h = 3.1 + L * 0.18, d = 5.0 + L * 0.3;
  houseBase(g, w, h, d, L >= 3 ? C.plaster : C.plasterDark);
  // A long central ridge with a cross-wing, the mark of a proper longhouse.
  g.add(roof(w + 1.1, 2.3 + L * 0.12, d + 1.1, L >= 3 ? C.roofBlue : C.thatchDark, 0, h + 0.42, 0));
  const wingW = 3.1, wingD = 6.2;
  g.add(bx(wingW, h * 0.82, wingD, C.plasterDark, w * 0.34, h * 0.41 + 0.4, d * 0.18));
  g.add(roof(wingW + 0.7, 1.45, wingD + 0.8, C.thatchDark, w * 0.34, h * 0.82 + 0.4, d * 0.18));
  windowGlow(g, w * 0.34, h * 0.56 + 0.4, d * 0.18 + wingD / 2 + 0.05);
  // Benches along the front.
  g.add(bx(2.0, 0.22, 0.5, C.wood, -w * 0.24, 0.55, d / 2 + 0.3));
  g.add(bx(2.0, 0.22, 0.5, C.wood, w * 0.24, 0.55, d / 2 + 0.3));
  // Clustered chimneys and smoke.
  g.add(bx(0.62, 2.0, 0.62, C.stoneDark, -w * 0.3, h + 1.0, -d * 0.22));
  g.userData.smoke = new THREE.Vector3(-w * 0.3, h + 2.0, -d * 0.22);
  if (L >= 3) {
    const f = makeFence(4.6); f.position.set(-w * 0.72, 0, d * 0.42); g.add(f);
    const brl = makeBarrel(0.65); brl.position.set(w * 0.46, 0.33, d * 0.42); g.add(brl);
  }
  if (L >= 4) {
    // raised loft and a second hearth
    g.add(bx(w * 0.5, h * 0.4, d * 0.5, C.plaster, 0, h + 0.8, -d * 0.1));
    g.add(roof(w * 0.5 + 0.5, 1.2, d * 0.5 + 0.5, C.roofBlue, 0, h + 1.5, -d * 0.1));
    windowGlow(g, 0, h + 0.95, -d * 0.1 + d * 0.25 + 0.04);
  }
  return g;
}

function buildManor(level) {
  const g = new THREE.Group();
  const L = Math.min(5, level);
  const w = 7.8 + L * 0.5, h = 3.4 + L * 0.2, d = 5.8 + L * 0.35;
  // Stone ground floor, jettied timber upper floor.
  g.add(bx(w + 0.6, 0.6, d + 0.6, C.stoneDark, 0, 0.3, 0));
  g.add(bx(w, h, d, C.stone, 0, 0.6 + h / 2, 0));
  g.add(bx(w + 0.7, h * 0.72, d + 0.7, C.plaster, 0, 0.6 + h + h * 0.36, 0));
  timberFrame(g, w + 0.7, h * 0.72, d + 0.7, 0.6 + h);
  g.add(roof(w + 1.4, 2.4, d + 1.4, C.roofBlue, 0, 0.6 + h * 1.72, 0));
  // Door, windows, and a proper stone porch.
  g.add(bx(1.5, 2.1, 0.16, C.woodDark, 0, 0.6 + 1.05, d / 2 + 0.06));
  g.add(bx(2.5, 0.35, 1.1, C.stoneLight, 0, 0.35, d / 2 + 0.5));
  for (const x of [-w * 0.33, w * 0.33]) {
    windowGlow(g, x, 0.6 + h * 0.58, d / 2 + 0.06);
    windowGlow(g, x, 0.6 + h * 1.36, d / 2 + 0.06);
  }
  // Corner turret and banners at the higher levels.
  if (L >= 3) {
    g.add(cy(1.04, 1.22, h * 1.5, C.stone, -w * 0.5, 0.6 + h * 0.75, -d * 0.5, 8));
    g.add(co(1.55, 2.6, C.roofBlue, -w * 0.5, 0.6 + h * 1.5 + 1.3, -d * 0.5, 8));
    const flag = makeFlag(C.clothRed, 3.0, 0.8);
    flag.position.set(-w * 0.5, 0.6 + h * 1.5 + 2.6, -d * 0.5);
    g.add(flag);
  }
  if (L >= 4) {
    g.add(bx(w * 0.42, h * 0.55, d * 0.42, C.plaster, w * 0.3, 0.6 + h * 1.95, -d * 0.14));
    g.add(roof(w * 0.42 + 0.6, 1.1, d * 0.42 + 0.6, C.thatchDark, w * 0.3, 0.6 + h * 2.45, -d * 0.14));
    windowGlow(g, w * 0.3, 0.6 + h * 2.15, -d * 0.14 + d * 0.21 + 0.04);
  }
  g.add(bx(0.68, 2.2, 0.68, C.stoneDark, w * 0.3, 0.6 + h * 1.7, -d * 0.28));
  g.userData.smoke = new THREE.Vector3(w * 0.3, 0.6 + h * 2.5, -d * 0.28);
  const f = makeFence(4.8); f.position.set(-w * 0.7, 0, d * 0.42); g.add(f);
  const brl = makeBarrel(0.72); brl.position.set(w * 0.5, 0.36, d * 0.4); g.add(brl);
  return g;
}

function buildWell(level) {
  const g = new THREE.Group();
  const L = Math.min(5, level);
  g.add(cy(1.35 + L * 0.05, 1.45 + L * 0.05, 0.85, C.stone, 0, 0.43, 0, 10));
  g.add(cy(0.95, 1.0, 0.1, C.water, 0, 0.86, 0, 10));
  g.add(cy(0.82, 0.82, 0.06, C.woodDark, 0, 1.0, 0, 10));
  for (const sx of [-1, 1]) {
    g.add(bx(0.18, 2.6, 0.18, C.woodDark, sx * 1.05, 1.55, 0));
  }
  g.add(bx(2.5, 0.16, 0.16, C.wood, 0, 2.82, 0));
  g.add(roof(2.9, 0.75, 1.7, C.thatchDark, 0, 2.95, 0));
  const bucket = makeBarrel(0.3); bucket.position.set(0, 1.35, 0.1); g.add(bucket);
  if (L >= 2) {
    const f = makeFence(3.0); f.position.set(-2.0, 0, 0.8); g.add(f);
  }
  return g;
}

function buildGarden(level) {
  const g = new THREE.Group();
  const L = Math.min(5, level);
  const soil = bx(4.6, 0.22, 3.6, C.dirt, 0, 0.11, 0);
  g.add(soil);
  for (let i = 0; i < 3 + L; i++) {
    const x = -1.55 + (i % 2) * 1.55, z = -1.25 + Math.floor(i / 2) * 0.85;
    const row = bx(1.1, 0.16, 0.45, C.leafDark, x, 0.27, z);
    g.add(row);
    for (let j = 0; j < 3; j++) {
      g.add(sp(0.14, j % 2 ? C.leaf : C.wheat, x - 0.35 + j * 0.35, 0.42, z, 6));
    }
  }
  const fence = makeFence(4.8); fence.position.set(0, 0, 2.0); g.add(fence);
  const fence2 = makeFence(3.8); fence2.position.set(-2.35, 0, 0); fence2.rotation.y = Math.PI / 2; g.add(fence2);
  // Beehives and a little drying rack.
  for (const sx of [-1.65, -1.15]) {
    g.add(bx(0.52, 0.55, 0.52, C.thatch, sx, 0.38, -1.35));
    g.add(co(0.35, 0.35, C.thatchDark, sx, 0.82, -1.35, 6));
  }
  g.add(bx(1.5, 0.12, 0.12, C.woodDark, 1.45, 1.15, -0.7));
  g.add(bx(0.12, 0.9, 0.12, C.woodDark, 0.82, 0.6, -0.7));
  g.add(bx(0.12, 0.9, 0.12, C.woodDark, 2.08, 0.6, -0.7));
  return g;
}

function buildWoodcutter(level) {
  const g = new THREE.Group();
  g.add(bx(4.2, 2.6, 3.4, level >= 2 ? C.plaster : C.wood, 0, 1.3, 0));
  g.add(roof(5.0, 1.5, 4.2, C.thatchDark, 0, 2.6, 0));
  g.add(bx(1.0, 1.8, 0.1, C.woodDark, 0, 0.9, 1.72));
  g.add(bx(0.5, 1.4, 0.5, C.stoneDark, 1.4, 3.0, -0.8));
  g.userData.smoke = new THREE.Vector3(1.4, 3.6, -0.8);
  const logs = makeLogs(5); logs.position.set(3.2, 0, 0.6); g.add(logs);
  // chopping stump + axe
  g.add(cy(0.5, 0.6, 0.65, C.wood, -3.1, 0.33, 0.8, 8));
  const axe = bx(0.08, 1.1, 0.08, C.woodDark, -3.1, 1.0, 0.8);
  axe.rotation.z = 0.7; g.add(axe);
  g.add(bx(0.42, 0.3, 0.1, C.iron, -2.7, 1.4, 0.8));
  // stump pile
  g.add(cy(0.3, 0.34, 0.5, C.woodDark, -3.4, 0.25, -1.3, 7));
  if (level >= 2) {
    g.add(bx(0.5, 0.5, 0.5, C.stoneDark, -4.0, 0.25, 0.5));
  }
  return g;
}

function buildQuarry(level) {
  const g = new THREE.Group();
  // stone blocks
  for (let i = 0; i < 7; i++) {
    const s = 0.8 + Math.random() * 0.6;
    const b = bx(s, s * 0.7, s, i % 2 ? C.stone : C.stoneLight, (i % 3 - 1) * 1.5, s * 0.35, Math.floor(i / 3) * 1.4 - 0.6, Math.random() * 0.4);
    g.add(b);
  }
  // wooden crane
  g.add(cy(0.12, 0.16, 4.2, C.woodDark, -2.8, 2.1, 0, 6));
  const arm = bx(4.0, 0.16, 0.16, C.woodDark, -1.0, 4.0, 0);
  g.add(arm);
  g.add(bx(0.06, 1.8, 0.06, C.woodDark, 0.7, 3.15, 0));
  g.add(bx(0.7, 0.7, 0.7, C.stone, 0.7, 2.1, 0));
  // cutting face
  g.add(bx(4.4, 2.4, 2.4, C.stoneDark, 2.0, 1.2, 0));
  g.add(bx(4.5, 0.4, 2.5, C.stone, 2.0, 2.5, 0));
  if (level >= 2) {
    g.add(bx(3.0, 2.0, 2.6, C.wood, -1.6, 1.0, 1.8));
    g.add(roof(3.6, 1.2, 3.0, C.thatchDark, -1.6, 2.0, 1.8));
  }
  return g;
}

function buildFarm(level) {
  const g = new THREE.Group();
  // field rows
  const rows = 5, cols = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      g.add(bx(0.55, 0.33, 1.5, C.wheat, (c - cols / 2) * 0.95 + 0.5, 0.17, (r - rows / 2) * 1.5 + 0.5, 0));
    }
  }
  g.add(bx(7.2, 0.1, 7.2, 0x6f5b3a, 0.5, 0.04, 0.5));
  // barn
  g.add(bx(3.6, 2.6, 2.8, C.wood, -2.6, 1.3, -3.3));
  g.add(roof(4.3, 1.7, 3.4, C.thatchDark, -2.6, 2.6, -3.3));
  g.add(bx(1.2, 1.6, 0.1, C.woodDark, -2.6, 0.8, -1.85));
  // scarecrow
  g.add(cy(0.06, 0.06, 2.0, C.woodDark, 3.6, 1.0, 2.6, 5));
  g.add(bx(1.2, 0.08, 0.08, C.woodDark, 3.6, 1.5, 2.6));
  g.add(sp(0.24, C.wheat, 3.6, 2.1, 2.6, 5));
  if (level >= 2) {
    g.add(bx(2.0, 0.9, 1.2, C.woodDark, 0.4, 0.45, 3.7));
    g.add(bx(0.6, 0.5, 0.6, C.wheat, 1.3, 1.0, 3.7));
  }
  return g;
}

function buildFishery(level) {
  const g = new THREE.Group();
  // dock
  for (let i = 0; i < 5; i++) g.add(bx(0.35, 0.18, 3.4, C.woodLight, i * 1.1 - 2.2, 0.55, 0));
  for (const x of [-2.4, 2.4]) for (const z of [-1.5, 1.5]) g.add(cy(0.12, 0.14, 1.2, C.woodDark, x, 0.3, z, 5));
  // hut
  g.add(bx(2.8, 2.2, 2.4, C.wood, -0.9, 1.55, -1.6));
  g.add(roof(3.4, 1.3, 3.0, C.thatchDark, -0.9, 2.65, -1.6));
  // boat
  const boat = new THREE.Group();
  boat.add(bx(2.6, 0.4, 0.9, C.woodDark, 0, 0.2, 0));
  boat.add(bx(2.2, 0.2, 0.7, C.wood, 0, 0.38, 0));
  boat.add(bx(0.15, 1.1, 0.15, C.woodDark, 0.3, 0.8, 0));
  boat.add(bx(0.9, 0.5, 0.05, C.plaster, 1.4, 0.9, 0));
  boat.position.set(2.0, 0, 2.6); boat.rotation.y = 0.4;
  g.add(boat);
  // nets
  g.add(cy(0.06, 0.06, 2.4, C.woodDark, 2.6, 1.6, -1.6, 5));
  g.add(bx(1.6, 1.2, 0.05, 0x8a7c5c, 2.9, 1.9, -1.6));
  if (level >= 2) {
    g.add(makeBarrel(0.6));
    g.children[g.children.length - 1].position.set(-2.0, 0.55, 1.1);
  }
  return g;
}

function buildIronMine(level) {
  const g = new THREE.Group();
  // rock mound
  g.add(sp(4.2, C.stoneDark, 0, 0.6, 0, 7));
  g.add(sp(3.0, C.stone, -1.0, 1.0, 1.0, 7));
  // entrance
  g.add(bx(3.2, 2.6, 0.6, 0x2b2722, 0, 1.5, 2.9));
  g.add(bx(0.5, 3.4, 0.5, C.woodDark, -1.9, 1.7, 3.3));
  g.add(bx(0.5, 3.4, 0.5, C.woodDark, 1.9, 1.7, 3.3));
  g.add(bx(4.6, 0.5, 0.5, C.woodDark, 0, 3.4, 3.3));
  // rails & cart
  g.add(bx(0.15, 0.08, 5.0, C.ironDark, -0.7, 0.08, 4.0));
  g.add(bx(0.15, 0.08, 5.0, C.ironDark, 0.7, 0.08, 4.0));
  const cart = new THREE.Group();
  cart.add(bx(1.3, 0.7, 1.0, C.woodDark, 0, 0.65, 0));
  cart.add(bx(1.2, 0.3, 0.9, C.iron, 0, 0.95, 0));
  for (const sx of [-0.55, 0.55]) for (const sz of [-0.4, 0.4]) {
    const w = cy(0.26, 0.26, 0.1, C.ironDark, sx, 0.26, sz, 7); w.rotation.z = Math.PI / 2; cart.add(w);
  }
  cart.position.set(0, 0, 4.8); g.add(cart);
  g.userData.cart = cart;
  // ore pile
  for (let i = 0; i < 5; i++) g.add(sp(0.4, C.iron, 2.8 + (i % 2) * 0.4, 0.3, 2.2 + i * 0.3, 0, 5));
  if (level >= 2) {
    g.add(bx(2.4, 2.0, 2.0, C.stone, -3.4, 1.0, 0.4));
    g.add(roof(3.0, 1.0, 2.6, C.roofBlue, -3.4, 2.0, 0.4));
  }
  return g;
}

function buildSawmill(level) {
  const g = new THREE.Group();
  g.add(bx(4.6, 2.8, 3.8, C.wood, 0, 1.4, 0));
  g.add(roof(5.4, 1.6, 4.6, C.roofBlue, 0, 2.8, 0));
  // open side with saw
  g.add(bx(2.0, 2.0, 0.2, C.woodDark, 0.2, 1.0, 1.95));
  const blade = cy(1.05, 1.05, 0.12, C.iron, 0.2, 1.6, 2.1, 12);
  blade.rotation.x = Math.PI / 2; g.add(blade);
  g.userData.blade = blade;
  // logs & planks
  const logs = makeLogs(6); logs.position.set(-3.4, 0, 1.0); logs.rotation.y = 0.4; g.add(logs);
  const planks = new THREE.Group();
  for (let i = 0; i < 5; i++) planks.add(bx(2.4, 0.12, 0.35, C.woodLight, 0, 0.08 + i * 0.14, i % 2 * 0.4));
  planks.position.set(2.8, 0, 0.4); planks.rotation.y = -0.3; g.add(planks);
  // chimney
  g.add(bx(0.5, 1.5, 0.5, C.stoneDark, -1.4, 3.2, -1.0));
  g.userData.smoke = new THREE.Vector3(-1.4, 4.0, -1.0);
  if (level >= 2) {
    g.add(bx(1.6, 1.2, 1.4, C.stoneDark, -3.2, 0.6, -2.4));
    g.add(makeBarrel(0.7));
    g.children[g.children.length - 1].position.set(3.6, 0, -1.8);
  }
  return g;
}

function buildSmithy(level) {
  const g = new THREE.Group();
  g.add(bx(4.0, 2.6, 3.4, C.stoneDark, 0, 1.3, 0));
  g.add(bx(0.7, 1.0, 0.7, C.stone, 1.5, 3.2, -0.6));
  g.add(bx(0.4, 0.8, 0.4, C.stoneDark, 1.5, 4.0, -0.6));
  g.userData.smoke = new THREE.Vector3(1.5, 4.4, -0.6);
  g.add(roof(4.8, 1.2, 4.2, C.roofDark, 0, 2.6, 0));
  // open forge
  g.add(bx(2.2, 1.8, 0.3, 0x201a14, -0.2, 0.9, 1.76));
  const fire = bx(1.1, 0.6, 0.2, C.fire, -0.2, 0.75, 1.9, 0, { emissive: 0xff5a12, emissiveIntensity: 1.1 });
  fire.name = 'fire'; g.add(fire);
  // anvil
  g.add(bx(1.0, 0.25, 0.7, C.iron, -2.4, 0.9, 1.8));
  g.add(bx(0.6, 0.65, 0.5, C.woodDark, -2.4, 0.35, 1.8));
  g.add(bx(0.8, 0.12, 0.2, C.iron, -2.4, 1.05, 2.0));
  // weapon rack
  g.add(bx(0.1, 2.0, 0.1, C.woodDark, 2.8, 1.0, 1.6));
  g.add(bx(0.1, 2.0, 0.1, C.woodDark, 4.2, 1.0, 1.6));
  g.add(bx(1.5, 0.1, 0.1, C.woodDark, 3.5, 1.7, 1.6));
  for (let i = 0; i < 4; i++) {
    const s = bx(0.05, 1.6, 0.05, C.iron, 3.0 + i * 0.35, 1.2, 1.65);
    s.rotation.z = 0.08 * (i - 2); g.add(s);
  }
  if (level >= 2) {
    g.add(bx(3.4, 1.2, 1.1, C.woodDark, 0, 0.6, 2.8));
    g.add(bx(0.9, 0.5, 0.7, C.iron, 0.5, 1.25, 2.8));
  }
  return g;
}

function buildWorkshop(level) {
  const g = new THREE.Group();
  g.add(bx(4.8, 3.4, 4.0, C.plaster, 0, 1.7, 0));
  g.add(bx(4.9, 0.8, 4.1, C.woodDark, 0, 0.9, 0));
  g.add(roof(5.6, 2.0, 4.8, level >= 2 ? C.roofBlue : C.roofDark, 0, 3.4, 0));
  g.add(bx(2.0, 0.5, 0.5, C.stoneDark, 1.5, 4.3, -0.8));
  g.userData.smoke = new THREE.Vector3(1.5, 4.7, -0.8);
  for (let i = 0; i < 3; i++) windowGlow(g, -1.4 + i * 1.4, 2.3, 2.05);
  g.add(bx(1.1, 1.9, 0.12, C.woodDark, 0, 0.95, 2.05));
  // crates, table
  const c1 = makeCrate(0.8); c1.position.set(-3.2, 0, 1.6); g.add(c1);
  const c2 = makeCrate(0.6); c2.position.set(-2.9, 0, 2.4); g.add(c2);
  g.add(bx(2.0, 0.15, 0.9, C.woodLight, 2.9, 0.9, 2.2));
  g.add(makeBarrel(0.65));
  g.children[g.children.length - 1].position.set(2.8, 0, -2.2);
  if (level >= 2) {
    g.add(bx(0.6, 2.0, 0.6, C.stone, -2.4, 4.0, -1.2));
    g.add(makeFlag(C.clothGold, 2.2, 0.6).translateX(-2.4).translateY(4.5));
  }
  return g;
}

function buildBrewery(level) {
  const g = new THREE.Group();
  g.add(bx(4.4, 2.8, 3.6, C.wood, 0, 1.4, 0));
  g.add(roof(5.2, 1.8, 4.4, C.thatchDark, 0, 2.8, 0));
  g.add(bx(0.6, 1.6, 0.6, C.stoneDark, -1.6, 3.1, -0.7));
  g.userData.smoke = new THREE.Vector3(-1.6, 3.9, -0.7);
  g.add(bx(1.1, 1.9, 0.1, C.woodDark, 0, 0.95, 1.84));
  // barrels
  for (let i = 0; i < 4; i++) {
    const b = makeBarrel(0.8);
    b.position.set(-3.4 + (i % 2) * 0.1, 0, 1.6 + Math.floor(i / 2) * 0.9);
    g.add(b);
  }
  // sign
  g.add(bx(0.1, 1.8, 0.1, C.woodDark, 2.3, 1.6, 1.9));
  g.add(bx(1.2, 0.7, 0.08, C.woodLight, 2.9, 2.2, 1.9));
  if (level >= 2) {
    g.add(bx(1.4, 0.8, 1.2, C.iron, 0, 0.5, 2.8));
  }
  return g;
}

function marketStall(color) {
  const s = new THREE.Group();
  // counter and stock shelf
  s.add(bx(2.6, 0.7, 1.0, C.wood, 0, 0.35, 0.15));
  s.add(bx(2.8, 0.14, 1.2, C.woodLight, 0, 0.77, 0.15));
  s.add(bx(2.45, 0.85, 0.26, C.woodDark, 0, 1.28, -0.62));
  // four posts
  for (const sx of [-1.25, 1.25]) {
    for (const sz of [-0.72, 0.72]) s.add(bx(0.1, 2.3, 0.1, C.woodDark, sx, 1.15, sz));
  }
  s.add(bx(2.6, 0.1, 0.1, C.woodDark, 0, 2.22, -0.72));
  s.add(bx(2.6, 0.1, 0.1, C.woodDark, 0, 2.22, 0.72));
  // pitched striped canopy with a hanging valance
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const col = i % 2 ? C.plaster : color;
      const st = bx(0.53, 0.08, 1.1, col, -1.06 + i * 0.53, 2.3, side * 0.52);
      st.rotation.x = side * 0.3;
      s.add(st);
    }
    for (let i = 0; i < 5; i++) {
      const col = i % 2 ? C.plaster : color;
      s.add(bx(0.51, 0.18, 0.05, col, -1.06 + i * 0.53, 2.1, side * 1.06));
    }
  }
  s.add(bx(2.75, 0.08, 0.16, C.woodDark, 0, 2.45, 0));
  // wares
  s.add(bx(0.4, 0.28, 0.4, C.wheat, -0.72, 0.98, 0.24));
  s.add(sp(0.17, C.leaf, 0.02, 1.02, 0.2, 6));
  s.add(bx(0.4, 0.26, 0.4, C.iron, 0.72, 0.97, 0.24));
  const crate = makeCrate(0.42); crate.position.set(1.02, 0, -0.5); s.add(crate);
  return s;
}

function buildMarket(level) {
  const g = new THREE.Group();
  // compact timber plaza
  g.add(bx(8.8, 0.16, 8.8, C.woodLight, 0, 0.08, 0));
  for (const sz of [-4.45, 4.45]) g.add(bx(9.0, 0.12, 0.24, C.woodDark, 0, 0.18, sz));
  for (const sx of [-4.45, 4.45]) g.add(bx(0.24, 0.12, 9.0, C.woodDark, sx, 0.18, 0));
  // side and back stalls form a U around the central fire
  const stalls = [
    { x: -2.55, z: -0.2, ry: Math.PI / 2, color: C.clothRed },
    { x: 2.55, z: -0.2, ry: -Math.PI / 2, color: C.clothBlue },
    { x: 0, z: -2.5, ry: 0, color: C.clothGold },
  ];
  for (const s of stalls) {
    const st = marketStall(s.color);
    st.position.set(s.x, 0.16, s.z);
    st.rotation.y = s.ry;
    g.add(st);
  }
  // central fire ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(bx(0.44, 0.26, 0.34, C.stoneDark, Math.cos(a) * 1.15, 0.29, 0.55 + Math.sin(a) * 1.15, a));
  }
  const f = makeFire(0.85); f.position.set(0, 0.2, 0.55); g.add(f);
  g.userData.fire = f;
  g.userData.smoke = new THREE.Vector3(0, 2.25, 0.55);
  // sign over the back stall
  g.add(bx(1.2, 0.42, 0.07, C.woodLight, 0, 2.0, -1.42));
  g.add(bx(1.26, 0.07, 0.09, C.gold, 0, 2.23, -1.42));
  // corner lantern posts
  for (const sx of [-4.15, 4.15]) {
    for (const sz of [-4.15, 4.15]) {
      g.add(bx(0.16, 3.15, 0.16, C.woodDark, sx, 1.72, sz));
      g.add(bx(0.5, 0.44, 0.16, C.clothGold, sx, 3.1, sz));
      g.add(bx(0.24, 0.32, 0.24, C.window, sx, 2.62, sz, 0, { emissive: 0xffa53d, emissiveIntensity: 0.55 }));
    }
  }
  // front steps and clutter
  g.add(bx(3.4, 0.1, 0.55, C.woodLight, 0, 0.05, 4.7));
  g.add(bx(3.0, 0.1, 0.55, C.wood, 0, 0.02, 5.05));
  const c1 = makeCrate(0.8); c1.position.set(3.55, 0.16, 3.0); c1.rotation.y = 0.4; g.add(c1);
  const c2 = makeCrate(0.6); c2.position.set(2.95, 0.16, 3.55); c2.rotation.y = -0.3; g.add(c2);
  const b1 = makeBarrel(0.75); b1.position.set(-3.65, 0.16, 2.35); g.add(b1);
  const b2 = makeBarrel(0.55); b2.position.set(-2.95, 0.16, 2.85); g.add(b2);
  if (level >= 2) {
    g.add(makeBanner(C.clothRed, 1.0).translateZ(-4.15));
    // stone market cross
    g.add(bx(0.55, 1.6, 0.55, C.stoneDark, -3.3, 0.95, 3.3));
    g.add(bx(0.85, 0.28, 0.85, C.stone, -3.3, 1.85, 3.3));
    g.add(sp(0.22, C.gold, -3.3, 2.12, 3.3, 6));
  }
  return g;
}

function buildTavern(level) {
  const g = new THREE.Group();
  g.add(bx(5.4, 3.2, 4.4, C.plaster, 0, 1.6, 0));
  g.add(bx(5.5, 1.0, 4.5, C.woodDark, 0, 0.9, 0));
  g.add(roof(6.2, 2.2, 5.2, C.roofDark, 0, 3.2, 0));
  for (let i = 0; i < 3; i++) windowGlow(g, -1.8 + i * 1.8, 2.0, 2.25);
  g.add(bx(1.2, 2.1, 0.12, C.woodDark, 0, 1.05, 2.25));
  g.add(bx(0.6, 1.5, 0.6, C.stoneDark, 1.8, 4.0, -1.2));
  g.userData.smoke = new THREE.Vector3(1.8, 4.7, -1.2);
  // hanging sign
  g.add(bx(0.12, 0.12, 2.0, C.woodDark, 2.9, 2.8, 2.3));
  g.add(bx(0.06, 0.7, 0.06, C.woodDark, 2.9, 2.45, 3.2));
  g.add(bx(0.05, 0.75, 0.9, C.woodLight, 2.9, 1.85, 3.2));
  g.add(bx(0.06, 0.4, 0.5, C.gold, 2.94, 1.95, 3.2));
  // benches & barrels
  for (let i = 0; i < 3; i++) {
    g.add(bx(0.5, 0.15, 1.6, C.woodLight, -3.2, 0.5, -1.0 + i * 0.9));
    g.add(bx(0.15, 0.4, 0.7, C.woodDark, -3.2, 0.25, -1.0 + i * 0.9));
  }
  const brl = makeBarrel(0.8); brl.position.set(3.2, 0, 3.0); g.add(brl);
  if (level >= 2) {
    g.add(bx(0.9, 0.9, 0.9, C.stoneDark, -3.3, 0.45, 3.2));
    g.add(makeFlag(C.clothGold, 2.0, 0.5).translateX(-3.3).translateY(1.0));
  }
  return g;
}

function buildStorehouse(level) {
  const g = new THREE.Group();
  g.add(bx(6.0, 2.8, 4.0, C.wood, 0, 1.4, 0));
  g.add(roof(7.0, 2.2, 4.8, C.thatchDark, 0, 2.8, 0));
  g.add(bx(2.2, 2.2, 0.12, C.woodDark, 0, 1.1, 2.04));
  g.add(bx(2.4, 0.18, 0.14, C.woodDark, 0, 2.25, 2.06));
  g.add(bx(0.18, 2.2, 0.14, C.woodDark, 0, 1.1, 2.06));
  // crates outside
  for (let i = 0; i < 4; i++) {
    const c = makeCrate(0.8 + (i % 2) * 0.2);
    c.position.set(-3.9 + (i % 2) * 0.9, 0, 2.6 + Math.floor(i / 2) * 0.9);
    c.rotation.y = i * 0.3; g.add(c);
  }
  g.add(makeBarrel(0.9));
  g.children[g.children.length - 1].position.set(3.6, 0, 2.4);
  if (level >= 2) {
    g.add(bx(6.3, 0.4, 4.3, C.stoneDark, 0, 2.9, 0));
  }
  return g;
}

function buildBarracks(level) {
  const g = new THREE.Group();
  g.add(bx(7.0, 3.0, 4.6, C.stoneDark, 0, 1.5, 0));
  g.add(roof(7.8, 2.0, 5.4, C.roofBlue, 0, 3.0, 0));
  g.add(bx(2.0, 2.2, 0.14, C.woodDark, 0, 1.1, 2.34));
  for (let i = 0; i < 3; i++) windowGlow(g, -2.4 + i * 2.4, 2.1, 2.35);
  g.add(bx(0.7, 1.6, 0.7, C.stoneDark, -2.6, 3.6, -1.0));
  g.userData.smoke = new THREE.Vector3(-2.6, 4.3, -1.0);
  // banners
  const b1 = makeBanner(C.clothRed, 1.1); b1.position.set(-3.9, 0, 2.7); g.add(b1);
  const b2 = makeBanner(C.clothBlue, 1.1); b2.position.set(3.9, 0, 2.7); g.add(b2);
  // training dummy
  const dummy = new THREE.Group();
  dummy.add(cy(0.12, 0.14, 2.2, C.woodDark, 0, 1.1, 0, 6));
  dummy.add(bx(1.2, 0.15, 0.15, C.woodDark, 0, 1.7, 0));
  dummy.add(bx(0.5, 0.7, 0.3, C.thatchDark, 0, 1.8, 0));
  dummy.add(sp(0.28, C.thatch, 0, 2.4, 0, 6));
  dummy.position.set(3.9, 0, 0.8); g.add(dummy);
  // weapon rack
  g.add(bx(2.0, 0.12, 0.12, C.woodDark, -4.2, 1.7, 1.0));
  for (let i = 0; i < 4; i++) g.add(bx(0.06, 1.6, 0.06, C.iron, -4.8 + i * 0.4, 1.1, 1.0));
  if (level >= 2) {
    g.add(bx(6.5, 1.0, 1.0, C.woodLight, 0, 0.5, 3.1));
    g.add(bx(1.5, 1.0, 1.6, C.stone, 4.6, 0.5, -2.4));
  }
  return g;
}

function buildWall(level) {
  const g = new THREE.Group();
  const stone = level >= 2 ? C.stone : C.stoneDark;
  g.add(bx(4.0, 2.2, 0.9, stone, 0, 1.1, 0));
  g.add(bx(4.1, 0.3, 1.1, C.stoneLight, 0, 2.25, 0));
  for (let i = 0; i < 3; i++) {
    g.add(bx(0.7, 0.6, 0.9, stone, -1.4 + i * 1.4, 2.7, 0));
  }
  // support buttress
  g.add(bx(0.6, 1.4, 1.5, C.stoneDark, -1.7, 0.7, -0.5));
  g.add(bx(0.6, 1.4, 1.5, C.stoneDark, 1.7, 0.7, -0.5));
  if (level >= 2) {
    g.add(bx(4.2, 0.2, 1.0, C.woodDark, 0, 1.55, 0));
  }
  return g;
}

function buildTower(level) {
  const g = new THREE.Group();
  const h = 5.0 + level;
  g.add(cy(1.55, 2.0, h, C.stoneDark, 0, h / 2, 0, 8));
  g.add(cy(1.9, 1.9, 0.5, C.stone, 0, h + 0.25, 0, 8));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    g.add(bx(0.55, 0.8, 0.55, C.stone, Math.cos(a) * 1.45, h + 0.8, Math.sin(a) * 1.45));
  }
  g.add(co(2.1, 2.8, level >= 2 ? C.roofBlue : C.thatchDark, 0, h + 1.2 + 1.4, 0, 8));
  const flag = makeFlag(C.clothRed, 2.2, 0.7);
  flag.position.set(0, h + 3.2, 0); g.add(flag);
  g.add(bx(0.8, 0.5, 0.12, C.stoneDark, 0, h * 0.6, 1.9));
  windowGlow(g, 0, h * 0.4, 1.95);
  return g;
}

function buildGate(level) {
  const g = new THREE.Group();
  for (const sx of [-1.8, 1.8]) {
    g.add(cy(1.0, 1.2, 4.8, C.stoneDark, sx, 2.4, 0, 8));
    g.add(cy(1.25, 1.25, 0.4, C.stone, sx, 4.9, 0, 8));
    g.add(co(1.6, 2.0, C.roofBlue, sx, 5.9, 0, 8));
    windowGlow(g, sx, 3.0, 1.15);
  }
  g.add(bx(4.4, 1.4, 1.2, C.stoneDark, 0, 3.8, 0));
  g.add(bx(4.2, 0.4, 1.5, C.stone, 0, 4.6, 0));
  // gate doors
  g.add(bx(1.8, 2.8, 0.2, C.woodDark, -0.9, 1.4, 0.45));
  g.add(bx(1.8, 2.8, 0.2, C.woodDark, 0.9, 1.4, 0.45));
  for (let i = 0; i < 3; i++) g.add(bx(3.6, 0.15, 0.1, C.iron, 0, 0.7 + i * 0.9, 0.58));
  if (level >= 2) {
    g.add(bx(5.4, 0.25, 1.8, C.stone, 0, 5.2, 0));
    const f = makeFlag(C.clothGold, 2.4, 0.8); f.position.set(0, 5.4, 0); g.add(f);
  }
  return g;
}

export function buildBuilding(type, level = 1) {
  let g;
  switch (type) {
    case 'keep': g = buildKeep(level); break;
    case 'house': g = buildHouse(level); break;
    case 'longhouse': g = buildLonghouse(level); break;
    case 'manor': g = buildManor(level); break;
    case 'well': g = buildWell(level); break;
    case 'garden': g = buildGarden(level); break;
    case 'woodcutter': g = buildWoodcutter(level); break;
    case 'quarry': g = buildQuarry(level); break;
    case 'farm': g = buildFarm(level); break;
    case 'fishery': g = buildFishery(level); break;
    case 'ironmine': g = buildIronMine(level); break;
    case 'sawmill': g = buildSawmill(level); break;
    case 'smithy': g = buildSmithy(level); break;
    case 'workshop': g = buildWorkshop(level); break;
    case 'brewery': g = buildBrewery(level); break;
    case 'market': g = buildMarket(level); break;
    case 'tavern': g = buildTavern(level); break;
    case 'storehouse': g = buildStorehouse(level); break;
    case 'barracks': g = buildBarracks(level); break;
    case 'wall': g = buildWall(level); break;
    case 'tower': g = buildTower(level); break;
    case 'gate': g = buildGate(level); break;
    default: g = new THREE.Group();
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  g.userData.type = type;
  return g;
}

// ============================================================
// CAMP (hostile / captured)
// ============================================================
export function buildCamp(hostile = true) {
  const g = new THREE.Group();
  const cloth = hostile ? C.clothRed : C.clothBlue;
  // palisade ring
  const r = 9;
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2;
    if (i > 7 && i < 11) continue; // gate gap
    const p = bx(0.35, 2.4 + Math.random() * 0.6, 0.35, C.woodDark, Math.cos(a) * r, 1.1, Math.sin(a) * r);
    p.rotation.y = -a; p.rotation.z = (Math.random() - 0.5) * 0.12; g.add(p);
  }
  // tents
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * 4.6, z = Math.sin(a) * 4.6;
    const tent = new THREE.Group();
    const base = bx(3.2, 1.4, 2.6, cloth, 0, 0.7, 0);
    tent.add(base);
    tent.add(roof(3.6, 1.4, 3.0, hostile ? C.clothRed : C.clothBlue, 0, 1.4, 0));
    tent.add(bx(0.7, 1.0, 0.6, 0x2a2118, 0, 0.5, 1.35));
    tent.position.set(x, 0, z); tent.rotation.y = a + Math.PI / 2;
    g.add(tent);
  }
  // central fire
  const fire = makeFire(1.3); fire.position.set(0, 0, 0); g.add(fire);
  g.userData.fire = fire;
  // banner & loot
  const banner = makeBanner(cloth, 1.3); banner.position.set(-1.3, 0, 0.6); g.add(banner);
  for (let i = 0; i < 3; i++) {
    const c = makeCrate(0.6); c.position.set(1.8 + i * 0.4, 0, 2.0); g.add(c);
  }
  const campBarrel = makeBarrel(0.8); campBarrel.position.set(2.2, 0, 1.0); g.add(campBarrel);
  // watch post
  const post = new THREE.Group();
  post.add(bx(2.0, 1.2, 2.0, C.woodDark, 0, 3.0, 0));
  for (const sx of [-0.8, 0.8]) for (const sz of [-0.8, 0.8]) post.add(cy(0.12, 0.14, 3.0, C.woodDark, sx, 1.5, sz, 5));
  post.add(roof(2.6, 1.0, 2.6, C.thatchDark, 0, 3.6, 0));
  post.position.set(6.0, 0, -5.0); g.add(post);
  return g;
}

// ============================================================
// INSTANCED SOLDIERS — geometry parts
// ============================================================
const bodyGeo = mergeGeoms([
  { geo: boxGeo(0.62, 0.78, 0.36), m: new THREE.Matrix4().makeTranslation(0, 1.02, 0) },
  { geo: boxGeo(0.24, 0.55, 0.26), m: new THREE.Matrix4().makeTranslation(-0.17, 0.45, 0) },
  { geo: boxGeo(0.24, 0.55, 0.26), m: new THREE.Matrix4().makeTranslation(0.17, 0.45, 0) },
  { geo: boxGeo(0.7, 0.16, 0.42), m: new THREE.Matrix4().makeTranslation(0, 1.46, 0) },
  { geo: boxGeo(0.18, 0.62, 0.2), m: new THREE.Matrix4().makeTranslation(-0.42, 1.05, 0) },
  { geo: boxGeo(0.18, 0.62, 0.2), m: new THREE.Matrix4().makeTranslation(0.42, 1.05, 0) },
]);
const headGeo = mergeGeoms([
  { geo: sphereGeo(0.23, 8), m: new THREE.Matrix4().makeTranslation(0, 1.72, 0) },
]);
const helmetGeo = mergeGeoms([
  { geo: sphereGeo(0.255, 8, 4), m: new THREE.Matrix4().makeTranslation(0, 1.78, 0) },
  { geo: boxGeo(0.5, 0.1, 0.44), m: new THREE.Matrix4().makeTranslation(0, 1.68, 0) },
]);
const weaponGeo = mergeGeoms([
  { geo: boxGeo(0.055, 1.15, 0.055), m: new THREE.Matrix4().makeTranslation(0, 0.55, 0) },
  { geo: boxGeo(0.24, 0.055, 0.06), m: new THREE.Matrix4().makeTranslation(0, 0.1, 0) },
  { geo: boxGeo(0.11, 0.22, 0.05), m: new THREE.Matrix4().makeTranslation(0, 1.16, 0) },
]);
const shieldGeo = mergeGeoms([
  { geo: boxGeo(0.1, 0.62, 0.46), m: new THREE.Matrix4().makeTranslation(0, 0, 0) },
  { geo: boxGeo(0.12, 0.2, 0.2), m: new THREE.Matrix4().makeTranslation(-0.02, 0, 0.02) },
]);
const villagerGeo = mergeGeoms([
  { geo: boxGeo(0.36, 0.55, 0.28), m: new THREE.Matrix4().makeTranslation(0, 0.72, 0) },
  { geo: boxGeo(0.34, 0.42, 0.24), m: new THREE.Matrix4().makeTranslation(0, 0.2, 0) },
  { geo: sphereGeo(0.16, 6), m: new THREE.Matrix4().makeTranslation(0, 1.16, 0) },
  { geo: coneGeo(0.25, 0.22, 6), m: new THREE.Matrix4().makeTranslation(0, 1.33, 0) },
]);
export const SOLDIER_GEO = { bodyGeo, headGeo, helmetGeo, weaponGeo, shieldGeo, villagerGeo };

// ============================================================
// PLAYER AVATAR
// ============================================================
export function makePlayer() {
  const g = new THREE.Group();
  const steel = 0x9aa3a8, steelDark = 0x5c666c;
  const tunic = 0x7a2e27, trim = 0xd6ab55;
  // legs (pivots at hip)
  const legL = new THREE.Group(), legR = new THREE.Group();
  const legGeo = boxGeo(0.26, 0.72, 0.3);
  const lmL = new THREE.Mesh(legGeo, mat(0x41372e)); lmL.position.y = -0.36; legL.add(lmL);
  const lmR = new THREE.Mesh(legGeo, mat(0x41372e)); lmR.position.y = -0.36; legR.add(lmR);
  const bootL = bx(0.3, 0.18, 0.42, 0x2a2118, 0, -0.74, 0.05); legL.add(bootL);
  const bootR = bx(0.3, 0.18, 0.42, 0x2a2118, 0, -0.74, 0.05); legR.add(bootR);
  legL.position.set(-0.19, 0.92, 0); legR.position.set(0.19, 0.92, 0);
  g.add(legL, legR);
  // torso
  const torso = bx(0.72, 0.78, 0.42, tunic, 0, 1.33, 0); g.add(torso);
  g.add(bx(0.76, 0.16, 0.45, trim, 0, 1.0, 0));
  g.add(bx(0.18, 0.7, 0.44, steelDark, 0, 1.36, 0.02));
  g.add(bx(0.78, 0.3, 0.46, steel, 0, 1.5, 0));
  // pauldrons
  g.add(sp(0.26, steel, -0.45, 1.62, 0, 6));
  g.add(sp(0.26, steel, 0.45, 1.62, 0, 6));
  // head & helmet
  const head = new THREE.Group();
  head.add(sp(0.22, C.skin, 0, 0, 0, 8));
  head.add(bx(0.46, 0.22, 0.44, steel, 0, 0.1, 0));
  head.add(bx(0.1, 0.24, 0.42, steelDark, 0, -0.03, 0.02));
  head.add(bx(0.05, 0.05, 0.05, 0x1c1510, -0.09, -0.01, 0.21));
  head.add(bx(0.05, 0.05, 0.05, 0x1c1510, 0.09, -0.01, 0.21));
  head.position.set(0, 1.94, 0); g.add(head);
  // cape
  const cape = bx(0.8, 1.2, 0.06, tunic, 0, 1.3, -0.26);
  cape.rotation.x = -0.08; g.add(cape);
  // arms (pivots at shoulder)
  const armR = new THREE.Group();
  const armL = new THREE.Group();
  const armGeo = boxGeo(0.2, 0.66, 0.24);
  const ar = new THREE.Mesh(armGeo, mat(tunic)); ar.position.y = -0.3; armR.add(ar);
  const ars = bx(0.22, 0.24, 0.26, steel, 0, -0.58, 0); armR.add(ars);
  const al = new THREE.Mesh(armGeo, mat(tunic)); al.position.y = -0.3; armL.add(al);
  const als = bx(0.22, 0.24, 0.26, steel, 0, -0.58, 0); armL.add(als);
  armR.position.set(0.48, 1.62, 0); armL.position.set(-0.48, 1.62, 0);
  g.add(armR, armL);
  // sword in right hand
  const sword = new THREE.Group();
  sword.add(bx(0.07, 1.15, 0.03, 0xd7dde1, 0, 0.55, 0));
  sword.add(bx(0.06, 0.3, 0.03, 0xaeb8bd, 0, 1.15, 0));
  sword.add(bx(0.34, 0.08, 0.1, C.gold, 0, 0.0, 0));
  sword.add(cy(0.05, 0.06, 0.3, C.woodDark, 0, -0.2, 0, 6));
  sword.position.set(0, -0.62, 0.05); sword.rotation.x = 0.4;
  armR.add(sword);
  // shield in left hand
  const shield = new THREE.Group();
  shield.add(bx(0.08, 0.78, 0.6, tunic, 0, 0, 0));
  shield.add(bx(0.1, 0.7, 0.12, C.gold, 0, 0, 0));
  shield.add(bx(0.1, 0.16, 0.5, C.gold, 0, 0.26, 0));
  shield.add(bx(0.1, 0.16, 0.5, C.gold, 0, -0.26, 0));
  shield.position.set(-0.1, -0.58, 0.08); shield.rotation.y = 0.1;
  armL.add(shield);
  // helmet plume
  const plume = bx(0.1, 0.35, 0.5, 0xa5463a, 0, 0.28, -0.1); plume.rotation.x = -0.3; head.add(plume);

  // ----------------------------------------------------------
  // Mounted hero: move the rider into a raised group, then build the
  // horse underneath him. Keeping the rider as one child means all the
  // existing limb poses still work without rewriting them.
  // ----------------------------------------------------------
  const rider = new THREE.Group();
  while (g.children.length) rider.add(g.children[0]);
  rider.position.y = 0.95;
  g.add(rider);

  const horse = new THREE.Group();
  const coat = 0x403027, coatDark = 0x2b201a, mane = 0x1e1510;
  horse.add(bx(1.02, 0.95, 2.55, coat, 0, 1.35, 0));
  horse.add(bx(1.12, 1.02, 0.78, coat, 0, 1.45, 0.92));
  const neck = bx(0.56, 1.15, 0.62, coat, 0, 2.03, 1.08); neck.rotation.x = -0.5; horse.add(neck);
  horse.add(bx(0.52, 0.5, 1.02, coat, 0, 2.52, 1.7));
  horse.add(bx(0.43, 0.34, 0.5, coatDark, 0, 2.36, 2.18));
  horse.add(bx(0.16, 0.18, 0.62, mane, 0, 2.83, 1.32));
  for (const sx of [-0.15, 0.15]) {
    const ear = co(0.09, 0.24, coatDark, sx, 2.86, 1.76, 5); ear.rotation.x = -0.2; horse.add(ear);
  }
  for (const sx of [-0.22, 0.22]) horse.add(bx(0.06, 0.06, 0.05, 0x120d0a, sx, 2.56, 2.22));
  // saddle and blanket
  horse.add(bx(1.18, 0.08, 1.16, 0x7d2b25, 0, 1.83, 0));
  horse.add(bx(1.06, 0.2, 0.94, 0x4a2c1c, 0, 1.92, 0));
  horse.add(bx(0.12, 0.28, 0.1, C.gold, 0, 2.02, 0.52));
  // tail
  const tail = bx(0.16, 1.05, 0.16, mane, 0, 1.58, -1.38);
  tail.rotation.x = 0.35; horse.add(tail);
  // legs (animated groups)
  const horseLegs = [];
  for (const sx of [-0.4, 0.4]) {
    for (const sz of [-0.92, 0.92]) {
      const leg = new THREE.Group();
      leg.position.set(sx, 1.25, sz);
      leg.add(bx(0.19, 0.92, 0.22, coat, 0, -0.45, 0));
      leg.add(bx(0.16, 0.62, 0.18, coatDark, 0, -1.05, 0.02));
      leg.add(bx(0.26, 0.18, 0.34, 0x1b1410, 0, -1.37, 0.05));
      horse.add(leg);
      horseLegs.push(leg);
    }
  }
  // bridle and reins
  horse.add(bx(0.56, 0.08, 0.08, C.leather || 0x6c4a2b, 0, 2.36, 1.9));
  for (const sx of [-0.18, 0.18]) {
    const rein = bx(0.035, 0.035, 1.5, 0x2a1c14, sx, 2.14, 1.2);
    rein.rotation.x = -0.12; horse.add(rein);
  }
  g.add(horse);

  // Bow in the left hand, quiver on the rider's back.
  const bow = new THREE.Group();
  bow.add(bx(0.055, 1.05, 0.055, 0x5b3a20, 0, 0, 0));
  bow.add(bx(0.045, 0.38, 0.045, 0x5b3a20, 0, 0.65, 0.04).clone());
  const bTop = bx(0.05, 0.42, 0.05, 0x6a4527, 0, 0.66, 0.12); bTop.rotation.z = 0.42; bow.add(bTop);
  const bBot = bx(0.05, 0.42, 0.05, 0x6a4527, 0, -0.66, 0.12); bBot.rotation.z = -0.42; bow.add(bBot);
  bow.add(bx(0.012, 1.28, 0.012, 0xd9c89f, 0, 0, 0.26));
  bow.position.set(-0.06, -0.62, 0.18);
  bow.rotation.x = 0.08;
  armL.add(bow);
  const quiver = new THREE.Group();
  quiver.add(cy(0.12, 0.16, 0.95, 0x4b3220, 0, 0, 0, 6));
  for (let i = 0; i < 4; i++) quiver.add(bx(0.025, 0.62, 0.025, 0xc9b98e, (i - 1.5) * 0.06, 0.65, 0));
  quiver.position.set(0.38, 1.55, -0.28);
  quiver.rotation.z = -0.28; quiver.rotation.x = 0.18;
  rider.add(quiver);

  g.userData = { legL, legR, armL, armR, head, sword, shield, torso, cape, plume, bow, horse, horseLegs };
  return g;
}

// ============================================================
// TREE / ROCK GEOMETRY (for instancing)
// ============================================================
export function treeGeoms() {
  const trunk = mergeGeoms([
    { geo: cylGeo(0.16, 0.26, 2.2, 5), m: new THREE.Matrix4().makeTranslation(0, 1.1, 0) },
  ]);
  const leaves = mergeGeoms([
    { geo: coneGeo(1.5, 2.6, 7), m: new THREE.Matrix4().makeTranslation(0, 2.8, 0) },
    { geo: coneGeo(1.15, 2.1, 7), m: new THREE.Matrix4().makeTranslation(0, 4.0, 0) },
    { geo: coneGeo(0.75, 1.5, 7), m: new THREE.Matrix4().makeTranslation(0, 5.0, 0) },
  ]);
  return { trunk, leaves };
}
export function pineGeoms() {
  const trunk = mergeGeoms([
    { geo: cylGeo(0.14, 0.22, 2.0, 5), m: new THREE.Matrix4().makeTranslation(0, 1.0, 0) },
  ]);
  const leaves = mergeGeoms([
    { geo: coneGeo(1.15, 3.4, 7), m: new THREE.Matrix4().makeTranslation(0, 3.0, 0) },
    { geo: coneGeo(0.8, 2.3, 7), m: new THREE.Matrix4().makeTranslation(0, 4.5, 0) },
  ]);
  return { trunk, leaves };
}
export function rockGeom() {
  return mergeGeoms([
    { geo: new THREE.DodecahedronGeometry(1, 0), m: new THREE.Matrix4().makeTranslation(0, 0.4, 0) },
  ]);
}
export function grassGeom() {
  return mergeGeoms([
    { geo: new THREE.ConeGeometry(0.16, 0.55, 3), m: new THREE.Matrix4().makeTranslation(0, 0.27, 0) },
    { geo: new THREE.ConeGeometry(0.12, 0.4, 3), m: new THREE.Matrix4().makeTranslation(0.16, 0.2, 0.1) },
    { geo: new THREE.ConeGeometry(0.1, 0.35, 3), m: new THREE.Matrix4().makeTranslation(-0.13, 0.17, -0.08) },
  ]);
}
export function flowerGeom() {
  return mergeGeoms([
    { geo: new THREE.SphereGeometry(0.1, 5, 4), m: new THREE.Matrix4().makeTranslation(0, 0.24, 0) },
    { geo: new THREE.SphereGeometry(0.08, 5, 4), m: new THREE.Matrix4().makeTranslation(0.12, 0.19, 0.06) },
    { geo: new THREE.SphereGeometry(0.07, 5, 4), m: new THREE.Matrix4().makeTranslation(-0.09, 0.17, -0.05) },
  ]);
}
