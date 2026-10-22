import * as THREE from '../assets/lib/three.module.js?v=160';
import { buildCamp, makeBanner, makeFlag, makeFire, getBlobMaterial, treeGeoms, pineGeoms, rockGeom, grassGeom, flowerGeom, mat, C, SOLDIER_GEO } from './models.js';
import { REGIONS, SEASONS } from './config.js';

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.seed = 1337;
    this.time = 8.2;
    this.season = 0;
    this.owned = { vale: true };
    this.camps = {};
    this.friendlyCamps = {};
    this.campWorkers = {};
    this.campCapture = {};
    this.campProgress = {};
    this.rivalPower = 1;
    this.trees = [];
    this.rocks = [];
    this.treeMeshes = [];
    this.rockMeshes = [];
    this.regionFlags = {};
    this.clouds = [];
    this.fireLights = [];
    this._minimapBase = null;
    this.nightFactor = 0;
    this.heightFlats = [];
    this._sunDir = new THREE.Vector3(0, 1, 0);
    this._tmpColor = new THREE.Color();
    this._timeUniforms = [];
    this.build();
  }

  // ---------------- terrain math ----------------
  heightAt(x, z) {
    let h = 1.5 * Math.sin(x * 0.043 + 0.7) * Math.cos(z * 0.037)
      + 1.15 * Math.sin(x * 0.085 + 1.2) * Math.cos(z * 0.071 + 0.3)
      + 0.42 * Math.sin(x * 0.19) * Math.cos(z * 0.16)
      + 1.4 * Math.sin((x + z) * 0.021);
    // iron hills
    h += 6.2 * Math.exp(-(((x + 82) ** 2) + ((z + 34) ** 2)) / 2100);
    // blackspire mound
    h += 7.5 * Math.exp(-(((x + 12) ** 2) + ((z + 112) ** 2)) / 2600);
    // greenfields flat
    h -= 1.2 * Math.exp(-(((x - 78) ** 2) + ((z + 18) ** 2)) / 2600);
    // border hills
    const bx = Math.max(0, Math.abs(x) - 106), bz = Math.max(0, Math.abs(z) - 106);
    h += (bx * bx + bz * bz) * 0.013;
    // flatten region centres / town
    for (const f of this.heightFlats) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r) h = THREE.MathUtils.lerp(f.h, h, smoothstep(f.r * 0.55, f.r, d));
    }
    // river carve
    const rz = 102 + Math.sin(x * 0.042) * 15;
    const dr = Math.abs(z - rz);
    if (dr < 16) {
      const carve = -4.7 * (1 - smoothstep(7, 16, dr));
      h = Math.min(h, h * 0.4) + carve;
    }
    return h;
  }

  isWater(x, z) { return this.heightAt(x, z) < -2.0; }

  slopeAt(x, z, r = 2) {
    const h = this.heightAt(x, z);
    let max = 0;
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      max = Math.max(max, Math.abs(this.heightAt(x + dx, z + dz) - h));
    }
    return max;
  }

  featureFactors(x, z) {
    let tree = 1, rock = 1, water = 1;
    for (const t of this.trees) {
      if (!t.alive) continue;
      const d = (t.x - x) ** 2 + (t.z - z) ** 2;
      if (d < 220) { tree = Math.max(tree, 1.0 + (1 - Math.sqrt(d) / 15) * 0.35); }
    }
    for (const r of this.rocks) {
      if (!r.alive) continue;
      const d = (r.x - x) ** 2 + (r.z - z) ** 2;
      if (d < 220) { rock = Math.max(rock, 1.0 + (1 - Math.sqrt(d) / 15) * 0.35); }
    }
    if (this.isWater(x, z - 8) || this.isWater(x, z + 8) || this.isWater(x - 8, z) || this.isWater(x + 8, z)) water = 1.6;
    return { tree, rock, water };
  }

  // ---------------- build ----------------
  build() {
    this.heightFlats = [
      { x: 0, z: 4, r: 34, h: 0 },
      { x: 76, z: -16, r: 19, h: 0.2 },
      { x: -78, z: -30, r: 18, h: 4.2 },
      { x: 34, z: 84, r: 18, h: 0.0 },
      { x: -12, z: -108, r: 20, h: 4.5 },
      { x: 82, z: 64, r: 18, h: 0.4 },
      { x: -88, z: 66, r: 19, h: -0.6 },
      { x: -72, z: -96, r: 20, h: 5.2 },
    ];
    this._buildTerrain();
    this._buildWater();
    this._buildProps();
    this._buildClouds();
    this._buildCamps();
    this.setSeason(0);
    this.setTime(8.2);
  }

  _buildTerrain() {
    const size = 320, seg = 100;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(0x789c58);
    const cGrass2 = new THREE.Color(0x8aad63);
    const cDirt = new THREE.Color(0x87724d);
    const cRock = new THREE.Color(0x8b8f8a);
    const cRock2 = new THREE.Color(0x6f7572);
    const cSand = new THREE.Color(0xa79b73);
    const cMud = new THREE.Color(0x5c5a42);
    const tmp = new THREE.Color();
    const rnd = mulberry32(42);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      const slope = this.slopeAt(x, z, 2.2);
      const dTown = Math.hypot(x, z - 2);
      let c = cGrass.clone();
      // grass variation
      const n = (Math.sin(x * 0.21 + z * 0.17) + Math.sin(x * 0.07 - z * 0.13)) * 0.5;
      c.lerp(cGrass2, THREE.MathUtils.clamp(0.5 + n * 0.45, 0, 1));
      if (slope > 0.8) c.lerp(cRock, Math.min(1, (slope - 0.8) * 0.9));
      if (h > 13) c.lerp(cRock2, Math.min(0.85, (h - 13) * 0.07));
      if (h < -1.2) c.lerp(cMud, Math.min(1, (-1.2 - h) * 0.5));
      if (h < 0.25 && h > -2.2) c.lerp(cSand, 0.45);
      if (dTown < 30) c.lerp(cDirt, (1 - dTown / 30) * 0.35);
      // subtle per-vertex noise
      const v = 0.95 + rnd() * 0.1;
      c.multiplyScalar(v);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.terrainGeo = geo;
    this.terrainBaseColors = colors.slice();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.terrainMat = m;
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = false;
    mesh.name = 'terrain';
    this.scene.add(mesh);
    this.terrain = mesh;
    // dark base disc under world
    const disc = new THREE.Mesh(new THREE.CircleGeometry(400, 24), new THREE.MeshBasicMaterial({ color: 0x2b3a2a }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -14; this.scene.add(disc);
  }

  _buildWater() {
    const geo = new THREE.PlaneGeometry(340, 100, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.waterUniforms = { time: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      transparent: true,
      vertexShader: `varying vec3 vW; void main(){ vW=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform float time; varying vec3 vW;
        void main(){
          float rip = sin(vW.x*0.45 + time*0.7) * 0.5 + sin(vW.z*0.65 - time*0.5)*0.5;
          vec3 deep = vec3(0.18,0.34,0.37);
          vec3 shallow = vec3(0.32,0.52,0.53);
          vec3 col = mix(deep, shallow, 0.5 + rip*0.12);
          float glint = pow(max(0.0, sin(vW.x*0.3 + time*0.9)*0.5+0.5), 8.0) * 0.10;
          col += glint;
          gl_FragColor = vec4(col, 0.93);
        }`,
      depthWrite: false,
    });
    this.water = new THREE.Mesh(geo, m);
    this.water.position.set(0, -1.85, 102);
    this.scene.add(this.water);
  }

  _addInstanced(geo, material, list, colorFn) {
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (colorFn) { colorFn(c, p, i); mesh.setColorAt(i, c); }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = true;
    this.scene.add(mesh);
    return mesh;
  }

  _buildProps() {
    const rnd = mulberry32(77123);
    const treePts = [];
    // groves
    const groves = [
      { x: 24, z: -28, r: 18, n: 20 }, { x: -28, z: 26, r: 20, n: 22 },
      { x: 42, z: 34, r: 16, n: 16 }, { x: 24, z: -60, r: 20, n: 18 },
      { x: -16, z: 58, r: 18, n: 18 }, { x: 90, z: -44, r: 22, n: 22 },
      { x: 66, z: 16, r: 18, n: 16 }, { x: -62, z: 4, r: 18, n: 18 },
      { x: -96, z: -66, r: 22, n: 18 }, { x: -44, z: -58, r: 16, n: 14 },
      { x: 72, z: 68, r: 16, n: 14 }, { x: -6, z: -74, r: 18, n: 16 },
      { x: 108, z: 30, r: 20, n: 18 }, { x: -116, z: 40, r: 20, n: 16 },
      { x: 50, z: 112, r: 18, n: 14 }, { x: -46, z: 112, r: 18, n: 14 },
      { x: 116, z: -88, r: 18, n: 14 }, { x: -108, z: -4, r: 16, n: 12 },
    ];
    for (const g of groves) {
      for (let i = 0; i < g.n; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * g.r;
        const x = g.x + Math.cos(a) * r, z = g.z + Math.sin(a) * r;
        if (this.isWater(x, z) || Math.hypot(x, z - 4) < 27) continue;
        if (this.heightAt(x, z) > 15) continue;
        treePts.push({ x, z, y: this.heightAt(x, z) - 0.15, ry: rnd() * 6.28, s: 0.72 + rnd() * 0.6, pine: rnd() < 0.45 });
      }
    }
    const qualityCount = { low: 190, medium: 280, high: 380 }[this.engine.quality] || 280;
    while (treePts.length < qualityCount) {
      const x = (rnd() * 2 - 1) * 138, z = (rnd() * 2 - 1) * 138;
      if (this.isWater(x, z) || Math.hypot(x, z - 4) < 28) continue;
      if (this.heightAt(x, z) > 17) continue;
      if (rnd() < 0.6) continue;
      treePts.push({ x, z, y: this.heightAt(x, z) - 0.15, ry: rnd() * 6.28, s: 0.7 + rnd() * 0.65, pine: rnd() < 0.5 });
    }
    this.treeData = treePts;
    this.trees = treePts.map(p => ({ x: p.x, z: p.z, alive: true }));
    const deciduous = treePts.filter(p => !p.pine);
    const pines = treePts.filter(p => p.pine);
    const { trunk, leaves } = treeGeoms();
    const { trunk: ptrunk, leaves: pleaves } = pineGeoms();
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2f, flatShading: true });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const leafMat2 = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.foliage = { deciduous, pines, leafMat, leafMat2, trunkMat };
    this.treeTrunkA = this._addInstanced(trunk, trunkMat, deciduous);
    this.treeLeafA = this._addInstanced(leaves, leafMat, deciduous, (c, p) => {
      c.setHSL(0.26 + Math.random() * 0.03, 0.34, 0.34 + Math.random() * 0.09);
    });
    this.treeTrunkB = this._addInstanced(ptrunk, trunkMat, pines);
    this.treeLeafB = this._addInstanced(pleaves, leafMat2, pines, (c) => {
      c.setHSL(0.29 + Math.random() * 0.02, 0.30, 0.27 + Math.random() * 0.07);
    });
    this.treeMeshes = [this.treeTrunkA, this.treeLeafA, this.treeTrunkB, this.treeLeafB];

    // rocks
    const rockPts = [];
    for (let i = 0; i < 90; i++) {
      let x = (rnd() * 2 - 1) * 135, z = (rnd() * 2 - 1) * 135;
      if (i < 34) { x = -82 + (rnd() * 2 - 1) * 42; z = -34 + (rnd() * 2 - 1) * 38; }
      if (this.isWater(x, z) || Math.hypot(x, z - 4) < 24) continue;
      rockPts.push({ x, z, y: this.heightAt(x, z) - 0.15, ry: rnd() * 6.28, s: 0.5 + rnd() * 1.2 });
    }
    this.rocks = rockPts.map(p => ({ x: p.x, z: p.z, alive: true }));
    const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.rockMesh = this._addInstanced(rockGeom(), rockMat, rockPts, (c) => {
      c.setHSL(0.09, 0.05, 0.40 + Math.random() * 0.16);
    });
    this.rockMeshes = [this.rockMesh];
    // ore rocks
    const orePts = [];
    for (let i = 0; i < 16; i++) {
      const a = rnd() * 6.28, r = rnd() * 32;
      const x = -82 + Math.cos(a) * r, z = -34 + Math.sin(a) * r;
      if (this.isWater(x, z)) continue;
      orePts.push({ x, z, y: this.heightAt(x, z) - 0.1, ry: rnd() * 6.28, s: 0.6 + rnd() * 0.8 });
    }
    this.oreMesh = this._addInstanced(rockGeom(), new THREE.MeshLambertMaterial({ color: 0x7b7f80, flatShading: true, emissive: 0x2b1a10, emissiveIntensity: 0.15 }), orePts, (c) => {
      c.setHSL(0.06, 0.25, 0.3 + Math.random() * 0.12);
    });

    // grass tufts, weighted toward the home vale so the first view feels alive
    const grassPts = [];
    const nGrass = { low: 520, medium: 920, high: 1400 }[this.engine.quality] || 920;
    for (let i = 0; i < nGrass; i++) {
      let x, z;
      if (i % 5 < 3) {
        const a = rnd() * Math.PI * 2, r = 8 + Math.sqrt(rnd()) * 48;
        x = Math.cos(a) * r; z = 4 + Math.sin(a) * r;
      } else {
        x = (rnd() * 2 - 1) * 110; z = (rnd() * 2 - 1) * 110;
      }
      if (this.isWater(x, z)) continue;
      if (Math.hypot(x, z - 4) < 9) continue;
      const h = this.heightAt(x, z);
      grassPts.push({ x, z, y: h, ry: rnd() * 6.28, s: 0.8 + rnd() * 1.0 });
    }
    this.grassMesh = this._addInstanced(grassGeom(), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), grassPts, (c) => {
      c.setHSL(0.24 + Math.random() * 0.03, 0.33, 0.30 + Math.random() * 0.11);
    });

    // scattered wildflowers (tiny, but they break up the green)
    const flowerPts = [];
    const nFlowers = { low: 70, medium: 130, high: 190 }[this.engine.quality] || 130;
    for (let i = 0; i < nFlowers; i++) {
      const a = rnd() * Math.PI * 2, r = 10 + Math.sqrt(rnd()) * 46;
      const x = Math.cos(a) * r, z = 4 + Math.sin(a) * r;
      if (this.isWater(x, z)) continue;
      flowerPts.push({ x, z, y: this.heightAt(x, z), ry: rnd() * 6.28, s: 0.7 + rnd() * 0.8 });
    }
    this.flowerMesh = this._addInstanced(flowerGeom(), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), flowerPts, (c, p, i) => {
      const hue = [0.12, 0.14, 0.0, 0.78, 0.95][i % 5];
      c.setHSL(hue, 0.55, 0.66 + Math.random() * 0.12);
    });

    // contact shadows beneath trees (one instanced draw)
    const blobGeo = new THREE.PlaneGeometry(4, 4);
    blobGeo.rotateX(-Math.PI / 2);
    const blobMesh = new THREE.InstancedMesh(blobGeo, getBlobMaterial(), treePts.length);
    const d = new THREE.Object3D();
    for (let i = 0; i < treePts.length; i++) {
      const p = treePts[i];
      d.position.set(p.x, p.y + 0.06, p.z);
      d.scale.setScalar(p.s);
      d.updateMatrix();
      blobMesh.setMatrixAt(i, d.matrix);
    }
    blobMesh.instanceMatrix.needsUpdate = true;
    blobMesh.renderOrder = 1;
    this.treeBlobs = blobMesh;
    this.scene.add(blobMesh);
  }

  _buildClouds() {
    const rnd = mulberry32(931);
    const m = new THREE.MeshLambertMaterial({ color: 0xf2efe2, transparent: true, opacity: 0.55, flatShading: true, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(rnd() * 3);
      for (let j = 0; j < n; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(2.8 + rnd() * 2.4, 7, 5), m);
        s.position.set((rnd() - 0.5) * 12, (rnd() - 0.5) * 1.6, (rnd() - 0.5) * 6);
        s.scale.y = 0.5;
        g.add(s);
      }
      g.position.set((rnd() * 2 - 1) * 150, 55 + rnd() * 20, (rnd() * 2 - 1) * 150);
      g.userData.speed = 0.7 + rnd() * 0.8;
      g.userData.baseX = g.position.x;
      this.clouds.push(g); this.scene.add(g);
    }
  }

  _buildCamps() {
    for (const [id, r] of Object.entries(REGIONS)) {
      if (!r.camp) continue;
      const h = this.heightAt(r.camp.x, r.camp.z);
      const hostile = buildCamp(true);
      hostile.position.set(r.camp.x, h, r.camp.z);
      hostile.userData.regionId = id;
      hostile.userData.kind = 'camp';
      hostile.userData.selectable = true;
      this.scene.add(hostile);
      this.camps[id] = hostile;
      // Visible rival life: captured rings (blue banners), war banners as the
      // rival grows, and villagers working the camp.
      const capture = new THREE.Group();
      capture.visible = false;
      for (let i = 0; i < 3; i++) {
        const a = -0.8 + i * 0.8;
        const f = makeFlag(C.clothBlue, 3.2, 0.55);
        f.position.set(Math.cos(a) * 8.4, 0, Math.sin(a) * 8.4);
        capture.add(f);
      }
      hostile.add(capture);
      this.campCapture[id] = capture;
      const growth = new THREE.Group();
      growth.visible = false;
      for (let i = 0; i < 2; i++) {
        const f = makeFlag(C.clothRed, 5.8, 1.0);
        f.position.set(i ? -7.4 : 7.4, 0, i ? 4.6 : -5.4);
        growth.add(f);
      }
      hostile.add(growth);
      hostile.userData.growth = growth;
      const wmat = new THREE.MeshLambertMaterial({ color: 0x6b4a35, flatShading: true });
      const workers = [];
      for (let i = 0; i < 4; i++) {
        const w = new THREE.Mesh(SOLDIER_GEO.villagerGeo, wmat);
        w.scale.setScalar(0.62);
        w.visible = false;
        this.scene.add(w);
        workers.push({ mesh: w, angle: i / 4 * Math.PI * 2, radius: 10 + (i % 2) * 2.2, speed: 0.12 + i * 0.015 });
      }
      this.campWorkers[id] = workers;
      const friendly = buildCamp(false);
      friendly.position.set(r.camp.x, h, r.camp.z);
      friendly.visible = false;
      friendly.userData.regionId = id;
      friendly.userData.kind = 'outpost';
      friendly.userData.selectable = true;
      this.scene.add(friendly);
      this.friendlyCamps[id] = friendly;
      // smoke/fire anchors
      const fire = hostile.userData.fire;
      if (fire) { const fl = fire.getObjectByName('flame'); if (fl) this.fireLights.push(fl); }
      // clear trees near camp
      this.clearTreesNear(r.camp.x, r.camp.z, 13, true);
    }
    // banner for home
    const home = new THREE.Group();
    const b = makeBanner(C.clothBlue, 1.5);
    home.add(b);
    home.add(makeFlag(C.clothGold, 4.2, 0.9));
    home.position.set(-16, this.heightAt(-16, 16), 16);
    this.scene.add(home);
    this.regionFlags.vale = home;
  }

  setRivalPower(power) {
    const p = Math.max(1, Math.min(1.55, power || 1));
    if (Math.abs(p - this.rivalPower) < 0.01) return;
    this.rivalPower = p;
    for (const id of Object.keys(this.camps)) this.applyCampLook(id);
  }

  setCampProgress(id, progress) {
    this.campProgress[id] = Math.max(0, Math.min(3, progress || 0));
    this.applyCampLook(id);
  }

  applyCampLook(id) {
    const camp = this.camps[id];
    if (!camp) return;
    const progress = this.campProgress[id] || 0;
    const power = this.rivalPower || 1;
    // A partly conquered camp shrinks; a growing rival expands and raises
    // extra war banners.
    const scale = Math.max(0.78, Math.min(1.28, power - progress * 0.07));
    camp.scale.setScalar(scale);
    if (camp.userData.growth) camp.userData.growth.visible = power > 1.16 && progress < 3;
    const capture = this.campCapture[id];
    if (capture) {
      capture.visible = progress > 0;
      capture.children.forEach((f, i) => { f.visible = i < progress; });
    }
  }

  updateCampLife(dt) {
    const t = performance.now() * 0.001;
    for (const [id, workers] of Object.entries(this.campWorkers)) {
      const camp = this.camps[id];
      const r = REGIONS[id];
      if (!camp || !r?.camp) continue;
      const active = camp.visible && (this.campProgress[id] || 0) < 3;
      for (let i = 0; i < workers.length; i++) {
        const w = workers[i];
        // More workers appear as the rival kingdom grows.
        w.mesh.visible = active && (i < 2 || this.rivalPower > 1.12 + i * 0.1);
        if (!w.mesh.visible) continue;
        w.angle += w.speed * dt;
        const x = r.camp.x + Math.cos(w.angle + i) * w.radius;
        const z = r.camp.z + Math.sin(w.angle + i) * w.radius;
        const y = this.heightAt(x, z);
        w.mesh.position.set(x, y + Math.sin(t * 3 + i) * 0.04, z);
        w.mesh.rotation.y = -w.angle + Math.PI / 2;
      }
    }
  }

  clearTreesNear(x, z, r, hide = true) {
    if (!this.treeData) return;
    let changed = false;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.treeData.length; i++) {
      const p = this.treeData[i];
      if (p.hidden === hide) continue;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 > r * r) continue;
      p.hidden = hide;
      this.trees[i].alive = !hide;
      const list = p.pine ? this.foliage.pines : this.foliage.deciduous;
      const idx = list.indexOf(p);
      if (idx < 0) continue;
      const trunk = p.pine ? this.treeTrunkB : this.treeTrunkA;
      const leaf = p.pine ? this.treeLeafB : this.treeLeafA;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.ry, 0);
      dummy.scale.setScalar(hide ? 0.0001 : p.s);
      dummy.updateMatrix();
      trunk.setMatrixAt(idx, dummy.matrix);
      leaf.setMatrixAt(idx, dummy.matrix);
      if (this.treeBlobs) {
        dummy.position.y = p.y + 0.06;
        dummy.updateMatrix();
        this.treeBlobs.setMatrixAt(i, dummy.matrix);
      }
      changed = true;
    }
    if (changed) {
      this.treeTrunkA.instanceMatrix.needsUpdate = true;
      this.treeLeafA.instanceMatrix.needsUpdate = true;
      this.treeTrunkB.instanceMatrix.needsUpdate = true;
      this.treeLeafB.instanceMatrix.needsUpdate = true;
      if (this.treeBlobs) this.treeBlobs.instanceMatrix.needsUpdate = true;
    }
  }

  _buildProps2() {}

  setRegionOwned(id, owned) {
    this.owned[id] = owned;
    if (this.camps[id]) this.camps[id].visible = !owned;
    if (this.friendlyCamps[id]) this.friendlyCamps[id].visible = owned;
    if (owned && this.camps[id]) {
      this.clearTreesNear(REGIONS[id].camp.x, REGIONS[id].camp.z, 15, true);
      this.campProgress[id] = 3;
    }
    this.applyCampLook(id);
    const r = REGIONS[id];
    if (owned && !this.regionFlags[id]) {
      const g = new THREE.Group();
      g.add(makeFlag(C.clothBlue, 6, 1.2));
      g.add(makeBanner(C.clothGold, 1.2).translateX(0.8));
      g.position.set(r.x, this.heightAt(r.x, r.z), r.z);
      this.scene.add(g);
      this.regionFlags[id] = g;
    } else if (!owned && this.regionFlags[id] && id !== 'vale') {
      this.scene.remove(this.regionFlags[id]); delete this.regionFlags[id];
    }
  }

  // ---------------- time / seasons ----------------
  setTime(t) {
    this.time = t;
    if (this._lastVisualT !== undefined && Math.abs(t - this._lastVisualT) < 0.015) return;
    this._lastVisualT = t;
    const hour = t;
    const dayT = (hour - 6) / 12; // 0 at 6h, 1 at 18h
    const elev = Math.sin(dayT * Math.PI);
    const az = (hour / 24) * Math.PI * 2;
    this._sunDir.set(Math.cos(az) * 0.75, Math.max(-0.35, elev), Math.sin(az) * 0.55).normalize();
    const sunH = Math.max(0, elev);
    const day = smoothstep(-0.08, 0.28, elev);
    const night = 1 - day;
    this.nightFactor = night;
    const s = SEASONS[this.season];
    // sky colors — nights stay blue and readable, never pitch black
    const nightTop = new THREE.Color(0x17263c), nightBot = new THREE.Color(0x31465a);
    const dayTop = new THREE.Color(0x78a6c4), dayBot = new THREE.Color(0xe2d6ac);
    const dusk = new THREE.Color(0xe6a06a);
    const top = nightTop.clone().lerp(dayTop, day);
    const bot = nightBot.clone().lerp(dayBot, day);
    const duskF = Math.max(0, 1 - Math.abs(elev) * 5.5) * (hour > 4 && hour < 21 ? 1 : 0.3);
    bot.lerp(dusk, duskF * 0.55);
    this.engine.sky.set(top, bot, this._sunDir, new THREE.Color(0xffc987), night);
    // fog
    const fogDay = new THREE.Color(s.fog);
    const fogNight = new THREE.Color(0x3c4b5a);
    const fogCol = fogNight.clone().lerp(fogDay, day);
    this.engine.scene.fog.color.copy(fogCol);
    this.engine.renderer.setClearColor(fogCol);
    // lights: a cool moon lifts the night, the sun takes over at dawn
    const lx = Math.cos(az) * 0.75, lz = Math.sin(az) * 0.55;
    const wx = lx * day - lx * (1 - day);
    const wz = lz * day - lz * (1 - day);
    const wy = Math.max(0.3, elev) * day + 0.72 * (1 - day);
    this.engine.sun.position.set(wx, wy, wz).normalize().multiplyScalar(130);
    this.engine.sun.position.add(new THREE.Vector3(0, 0, 10));
    this.engine.sun.intensity = 0.42 + sunH * 1.9;
    const lightCol = new THREE.Color(0x9db7dd).lerp(new THREE.Color(0xffd9a6), day);
    lightCol.lerp(new THREE.Color(0xffb078), duskF);
    this.engine.sun.color.copy(lightCol);
    this.engine.ambient.intensity = 0.6 + day * 0.55;
    this.engine.ambient.color.set(0x8fa6c8).lerp(new THREE.Color(0xbcd4e6), day);
    this.engine.ambient.groundColor.set(0x454a44).lerp(new THREE.Color(0x5a5440), day);
    // windows glow
    const wm = mat(C.window);
    wm.emissiveIntensity = 0.2 + night * 1.7;
    // stars handled in sky
    if (this.waterUniforms) this.waterUniforms.time.value += 0.016;
  }

  setSeason(season) {
    this.season = season;
    const s = SEASONS[season];
    // foliage instance colors
    const tint = new THREE.Color(s.tree);
    const c = new THREE.Color();
    if (this.foliage) {
      const apply = (mesh, baseHue, sat, light) => {
        if (!mesh) return;
        const n = mesh.count;
        for (let i = 0; i < n; i++) {
          const v = 0.9 + (Math.sin(i * 12.9898) * 0.5 + 0.5) * 0.2;
          c.copy(tint).multiplyScalar(v);
          c.offsetHSL(((i % 7) - 3) * 0.004, 0, ((i % 5) - 2) * 0.012);
          mesh.setColorAt(i, c);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      };
      apply(this.treeLeafA);
      apply(this.treeLeafB);
      // winter snow caps on pines
      this.foliage.leafMat2.color.set(season === 3 ? 0xdfe8e4 : 0xffffff);
    }
    // terrain tint
    if (this.terrainMat) {
      if (season === 3) this.terrainMat.color.set(0xd7dfe0);
      else if (season === 2) this.terrainMat.color.set(0xf0dcb6);
      else this.terrainMat.color.set(0xffffff);
    }
    // grass tint
    if (this.grassMesh) {
      if (season === 3) this.grassMesh.material.color.set(0xc6cfc2);
      else if (season === 2) this.grassMesh.material.color.set(0xe0c68e);
      else this.grassMesh.material.color.set(0xffffff);
    }
    this.engine.scene.fog.color.set(s.fog);
  }

  update(dt, state) {
    // clouds drift
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 170) c.position.x = -170;
    }
    // fire flicker
    const t = performance.now() * 0.004;
    for (const f of this.fireLights) {
      const s = 0.9 + Math.sin(t * 3.1 + f.id) * 0.12 + Math.sin(t * 7.7) * 0.06;
      f.scale.set(s, s * (0.9 + Math.sin(t * 5) * 0.1), s);
    }
    // water timer
    if (this.waterUniforms) this.waterUniforms.time.value += dt * 1.2;
    if (state) {
      this.setTime(state.timeOfDay);
      if (state.rivalPower) this.setRivalPower(state.rivalPower);
    }
    this.updateCampLife(dt);
  }

  // ---------------- minimap ----------------
  getMinimapBase(size = 256) {
    if (this._minimapBase && this._minimapBase.width === size) return this._minimapBase;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const world = 300;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = (px / size - 0.5) * world;
        const z = (py / size - 0.5) * world;
        const h = this.heightAt(x, z);
        let r, g, b;
        if (h < -2.0) { r = 42; g = 73; b = 80; }
        else {
          const t = Math.max(0, Math.min(1, (h + 3) / 22));
          r = 74 + t * 52; g = 99 + t * 30; b = 62 + t * 20;
          const slope = this.slopeAt(x, z, 2);
          if (slope > 1.1) { r = 104; g = 106; b = 100; }
          if (Math.hypot(x, z - 4) < 30) { r = 108; g = 97; b = 70; }
        }
        const i = (py * size + px) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // region boundaries
    ctx.lineWidth = 1;
    for (const [id, r] of Object.entries(REGIONS)) {
      if (id === 'vale') continue;
      ctx.beginPath();
      ctx.arc((r.x / world + 0.5) * size, (r.z / world + 0.5) * size, (r.radius / world) * size, 0, Math.PI * 2);
      ctx.strokeStyle = this.owned[id] ? 'rgba(140,190,120,0.4)' : 'rgba(200,120,95,0.35)';
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this._minimapBase = c;
    return c;
  }
}
