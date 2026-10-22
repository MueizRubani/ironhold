import * as THREE from '../assets/lib/three.module.js?v=160';
import { BUILDINGS, KEEP_LEVELS, REGIONS, SEASONS, RESOURCES } from './config.js';
import { buildBuilding, blob, SOLDIER_GEO, mat, C, makeFire } from './models.js';

const TICK = 4.0; // seconds per production tick

export class Settlement {
  constructor(engine, world, audio, state, game) {
    this.engine = engine;
    this.world = world;
    this.audio = audio;
    this.state = state;
    this.game = game;
    this.scene = engine.scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.meshes = new Map();
    this.pickables = [];
    this.selected = null;
    this.hovered = null;
    this.ghost = null;
    this.ghostType = null;
    this.ghostRot = 0;
    this.ghostPos = new THREE.Vector3();
    this.ghostValid = false;
    this.ghostBonus = null;
    this.effects = {};
    this.prodTimer = 0;
    this.workers = [];
    this.workerMesh = null;
    this.pads = null;
    this.roads = null;
    this.smokeTimers = new Map();
    this._lastTickGains = null;
    this._time = 0;
    this._tmp = new THREE.Vector3();
    this.makeRings();
    this.makeWorkers();
  }

  // ---------------- effects ----------------
  computeEffects() {
    const e = { popCap: 0, armyCap: 0, storage: 0, happiness: 0, market: 0, goldTick: 0, defense: 0, influence: 0, recruit: 0 };
    const keep = this.state.buildings.find(b => b.type === 'keep');
    const kl = keep ? keep.level : 1;
    const kd = KEEP_LEVELS[Math.min(kl, KEEP_LEVELS.length - 1)];
    e.popCap += kd.popCap;
    e.armyCap += kd.armyCap;
    e.influence += kd.influence;
    for (const b of this.state.buildings) {
      if (b.type === 'keep') continue;
      const def = BUILDINGS[b.type];
      if (!def || !def.effect) continue;
      for (const [k, v] of Object.entries(def.effect)) {
        if (k === 'popCap') e.popCap += v + (b.level - 1) * Math.max(2, Math.round(v * 0.65));
        else if (k === 'storage') e.storage += v * b.level;
        else if (k === 'happiness') e.happiness += v * b.level;
        else if (k === 'goldTick') e.goldTick += v * (1 + (b.level - 1) * 0.7);
        else if (k === 'market') e.market += b.level;
        else if (k === 'defense') e.defense += v * b.level;
        else if (k === 'influence') e.influence += v;
        else if (k === 'armyCap') e.armyCap += v + (b.level - 1) * Math.max(4, Math.round(v * 0.9));
        else if (k === 'recruit') e.recruit += b.level;
        else if (k === 'growth') e.growth += v * b.level;
        else e[k] = (e[k] || 0) + v;
      }
    }
    this.effects = e;
    return e;
  }

  // ---------------- build / restore ----------------
  restore() {
    // clear visuals
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this.meshes.clear();
    this.pickables.length = 0;
    for (const data of this.state.buildings) this.addVisual(data, data.type === 'keep' && data.level === 1);
    this.rebuildPads();
    this.rebuildRoads();
    this.computeEffects();
    // reattach camp selection to pickables through game
    this.updateWorkers(true);
  }

  addVisual(data, silent = true) {
    const mesh = buildBuilding(data.type, data.level);
    const y = data.y ?? this.world.heightAt(data.x, data.z);
    mesh.position.set(data.x, y, data.z);
    mesh.rotation.y = data.rot || 0;
    mesh.userData.buildingId = data.id;
    mesh.userData.kind = 'building';
    mesh.userData.selectable = true;
    const sh = blob((BUILDINGS[data.type].size + 2.4) * 1.9, data.x, y + 0.05, data.z);
    mesh.add(sh);
    // level flag markers
    if (data.level >= 2 && data.type !== 'keep' && data.type !== 'wall' && data.type !== 'gate') {
      // small gold pennant
    }
    this.group.add(mesh);
    this.meshes.set(data.id, mesh);
    this.pickables.push(mesh);
    data.y = y;
    return mesh;
  }

  rebuildVisual(data) {
    const old = this.meshes.get(data.id);
    if (old) {
      const idx = this.pickables.indexOf(old);
      if (idx >= 0) this.pickables.splice(idx, 1);
      this.group.remove(old);
      this.meshes.delete(data.id);
    }
    return this.addVisual(data);
  }

  makeRings() {
    const geo = new THREE.RingGeometry(0.94, 1.03, 48);
    geo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xe3b95c, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(geo, this.ringMat);
    this.ring.visible = false; this.ring.renderOrder = 3;
    this.scene.add(this.ring);
    this.hoverMat = new THREE.MeshBasicMaterial({ color: 0xf4e2b0, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    this.hoverRing = new THREE.Mesh(geo, this.hoverMat);
    this.hoverRing.visible = false; this.hoverRing.renderOrder = 3;
    this.scene.add(this.hoverRing);
  }

  makeWorkers() {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    this.workerMesh = new THREE.InstancedMesh(SOLDIER_GEO.villagerGeo, m, 180);
    this.workerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.workerMesh.frustumCulled = false;
    this.workerMesh.count = 0;
    this.scene.add(this.workerMesh);
  }

  // ---------------- placement ----------------
  regionAt(x, z) {
    let best = null, bestD = Infinity;
    for (const [id, r] of Object.entries(REGIONS)) {
      if (!this.state.regions[id]?.owned) continue;
      const d = Math.hypot(x - r.x, z - r.z);
      if (d <= r.radius && d < bestD) { best = [id, r]; bestD = d; }
    }
    return best;
  }

  canPlace(type, x, z) {
    const def = BUILDINGS[type];
    if (!def || def.keep) return { ok: false, reason: 'Cannot place that here.' };
    if (Math.abs(x) > 140 || Math.abs(z) > 140) return { ok: false, reason: 'Beyond the edge of the vale.' };
    const reg = this.regionAt(x, z);
    if (!reg) return { ok: false, reason: 'You must control this land first.' };
    if (this.world.isWater(x, z)) return { ok: false, reason: 'Cannot build on water.' };
    if (this.world.slopeAt(x, z, def.size * 0.7) > 2.6) return { ok: false, reason: 'The ground is too steep.' };
    for (const other of this.state.buildings) {
      if (other.type === 'keep') {
        if (Math.hypot(x - other.x, z - other.z) < def.size + 9.4) return { ok: false, reason: 'Too close to the Keep.' };
        continue;
      }
      const od = BUILDINGS[other.type];
      let min = (def.size + (od ? od.size : 3)) * 0.78 + 1.2;
      if (def.block && od && od.block) min = 3.0;
      if (Math.hypot(x - other.x, z - other.z) < min) return { ok: false, reason: 'Too close to another building.' };
    }
    // hostile camps
    for (const [id, r] of Object.entries(REGIONS)) {
      if (!r.camp || this.state.regions[id]?.owned) continue;
      if (Math.hypot(x - r.camp.x, z - r.camp.z) < 17) return { ok: false, reason: 'The enemy camp is too close.' };
    }
    // fishing hut near water is a bonus, not a requirement
    const f = this.world.featureFactors(x, z);
    const near = {
      wood: def.near?.tree ? f.tree : 1,
      stone: def.near?.rock ? f.rock : 1,
      iron: def.near?.rock ? f.rock : 1,
      food: def.near?.water ? f.water : 1,
    };
    return { ok: true, region: reg[0], near, f };
  }

  beginPlacement(type) {
    this.cancelPlacement();
    this.ghostType = type;
    this.ghostRot = 0;
    const g = buildBuilding(type, 1);
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x8fd0a0, transparent: true, opacity: 0.42, depthWrite: false });
    g.traverse(o => { if (o.isMesh) { o.material = this.ghostMat; o.castShadow = false; } });
    const def = BUILDINGS[type];
    const ringGeo = new THREE.RingGeometry(def.size + 0.6, def.size + 1.0, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.ghostRingMat = new THREE.MeshBasicMaterial({ color: 0x8fd0a0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, this.ghostRingMat);
    ring.position.y = 0.18; g.add(ring);
    this.ghost = g;
    this.scene.add(g);
    this.ghostValid = false;
    return g;
  }

  cancelPlacement() {
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    this.ghostType = null;
  }

  updateGhost(point, rot) {
    if (!this.ghost || !this.ghostType) return null;
    const def = BUILDINGS[this.ghostType];
    const snap = def.snap || 1;
    let x = Math.round(point.x / snap) * snap;
    let z = Math.round(point.z / snap) * snap;
    if (snap === 4) { x -= 2; z -= 2; }
    x = THREE.MathUtils.clamp(x, -140, 140); z = THREE.MathUtils.clamp(z, -140, 140);
    const y = this.world.heightAt(x, z);
    this.ghostPos.set(x, y, z);
    this.ghost.position.copy(this.ghostPos);
    this.ghost.rotation.y = rot;
    this.ghostRot = rot;
    const res = this.canPlace(this.ghostType, x, z);
    this.ghostValid = res.ok;
    const col = res.ok ? 0x8fd0a0 : 0xcf6a55;
    this.ghostMat.color.setHex(col);
    this.ghostRingMat.color.setHex(col);
    this.ghostBonus = res;
    return { ...res, x, z, y };
  }

  place(type, x, z, rot) {
    const res = this.canPlace(type, x, z);
    if (!res.ok) { this.game.toast(res.reason, 'bad'); this.audio.error(); return null; }
    const def = BUILDINGS[type];
    if (!this.game.economy.canAfford(def.cost)) {
      this.game.toast('Not enough resources.', 'bad');
      this.audio.error();
      return null;
    }
    this.game.economy.pay(def.cost);
    const id = ++this.state.nextBuildingId;
    const data = {
      id, type, level: 1, x, z, rot: rot || 0, workers: 0,
      y: this.world.heightAt(x, z), near: res.near, region: res.region,
    };
    this.state.buildings.push(data);
    this.addVisual(data);
    this.rebuildPads();
    this.rebuildRoads();
    this.computeEffects();
    this.audio.place();
    this.world.clearTreesNear(x, z, def.size + 2.5, true);
    const y = data.y + 0.4;
    this.engine.particles.burst(new THREE.Vector3(x, y, z), 0xb9a27a, 18, { speed: 4, up: 2.6, life: 1.1, size: 1.2, grav: 2.4 });
    this.engine.particles.burst(new THREE.Vector3(x, y + 0.5, z), 0xe3b95c, 6, { speed: 2, up: 3, life: 1.3, size: 0.4, grav: 1 });
    this.engine.cameraCtl.addShake(0.18);
    // camera bump
    this.onPlaced && this.onPlaced(data);
    return data;
  }

  upgrade(id) {
    const b = this.state.buildings.find(x => x.id === id);
    if (!b) return false;
    const def = BUILDINGS[b.type];
    let cost;
    let maxLevel;
    if (b.type === 'keep') {
      if (b.level >= KEEP_LEVELS.length - 1) return false;
      cost = KEEP_LEVELS[b.level + 1].cost;
      maxLevel = KEEP_LEVELS.length - 1;
    } else {
      if (b.level >= 10) return false;
      cost = this.upgradeCost(b);
      maxLevel = 10;
    }
    if (!this.game.economy.canAfford(cost)) { this.game.toast('Not enough resources to upgrade.', 'bad'); this.audio.error(); return false; }
    this.game.economy.pay(cost);
    b.level++;
    this.rebuildVisual(b);
    this.computeEffects();
    this.rebuildPads();
    this.audio.upgrade();
    this.engine.cameraCtl.addShake(0.22);
    const p = new THREE.Vector3(b.x, b.y + 1.5, b.z);
    this.engine.particles.burst(p, 0xe3b95c, 26, { speed: 3.2, up: 3.4, life: 1.4, size: 0.6, grav: 2.2 });
    this.engine.particles.burst(p, 0xffffff, 10, { speed: 1.6, up: 4, life: 1.8, size: 0.35, grav: 0.6 });
    if (b.type === 'keep') {
      this.state.keepLevel = b.level;
      this.game.onKeepUpgraded(b.level);
    }
    if (this.selected?.id === b.id) this.game.ui.showSelection(b);
    return true;
  }

  upgradeCost(b) {
    if (b.type === 'keep') return KEEP_LEVELS[Math.min(KEEP_LEVELS.length - 1, b.level + 1)].cost;
    const base = BUILDINGS[b.type].cost || { gold: 100 };
    const m = 1 + b.level * 0.9;
    const c = {};
    for (const [k, v] of Object.entries(base)) c[k] = Math.round(v * m / 5) * 5;
    c.gold = Math.max(20, Math.round((c.gold || 0) * 1.25));
    return c;
  }

  demolish(id) {
    const b = this.state.buildings.find(x => x.id === id);
    if (!b || b.type === 'keep') return false;
    const def = BUILDINGS[b.type];
    // refund 50%
    if (def.cost) {
      const refund = {};
      for (const [k, v] of Object.entries(def.cost)) refund[k] = Math.floor(v * 0.5 * b.level);
      this.game.economy.gain(refund);
    }
    this.removeVisual(b.id);
    this.state.buildings = this.state.buildings.filter(x => x.id !== id);
    this.selected = null;
    this.rebuildPads();
    this.rebuildRoads();
    this.computeEffects();
    this.engine.particles.burst(new THREE.Vector3(b.x, b.y + 1, b.z), 0x8b7a5c, 20, { speed: 4, up: 2.5, life: 1, size: 1.1, grav: 3 });
    this.audio.place();
    return true;
  }

  removeVisual(id) {
    const m = this.meshes.get(id);
    if (!m) return;
    const i = this.pickables.indexOf(m);
    if (i >= 0) this.pickables.splice(i, 1);
    this.group.remove(m);
    this.meshes.delete(id);
    if (this.selected?.id === id) this.select(null);
  }

  // ---------------- workers ----------------
  // Every level adds another work gang, so a level 10 workshop can be a true
  // manufactory instead of being stuck at three men forever.
  workerCap(b) {
    const def = BUILDINGS[b.type];
    if (!def?.workers) return 0;
    return def.workers + Math.floor((b.level - 1) * 1.0);
  }

  assign(id, delta) {
    const b = this.state.buildings.find(x => x.id === id);
    if (!b) return;
    const def = BUILDINGS[b.type];
    if (!def.workers) return;
    if (delta > 0) {
      const room = this.workerCap(b) - b.workers;
      if (room <= 0) return;
      const add = Math.min(delta, room, this.idleWorkers());
      if (add <= 0) { this.game.toast('No idle villagers. Build housing or recruit fewer soldiers.', 'warn'); this.audio.error(); return; }
      b.workers += add;
    } else {
      if (b.workers <= 0) return;
      b.workers = Math.max(0, b.workers + delta);
    }
    this.audio.pop();
    this.updateWorkers(true);
    this.game.ui.showSelection(b);
    this.game.ui.updateTopbar(true);
  }

  idleWorkers() {
    const pop = this.state.population;
    const assigned = this.state.buildings.reduce((s, b) => s + (b.workers || 0), 0);
    return Math.max(0, pop - assigned - this.game.army.total());
  }

  totalWorkers() {
    return this.state.buildings.reduce((s, b) => s + (b.workers || 0), 0);
  }

  updateWorkers(force = false) {
    this._time += force ? 1 : 0;
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    let n = 0;
    const t = performance.now() * 0.001;
    for (const b of this.state.buildings) {
      if (!b.workers) continue;
      const def = BUILDINGS[b.type];
      const count = Math.min(b.workers, 3);
      for (let i = 0; i < count; i++) {
        if (n >= 180) break;
        const phase = (b.id * 1.7 + i * 2.1) % 6.28;
        const speed = 0.5 + (i % 2) * 0.25;
        const ang = t * speed + phase;
        const rad = def.size * 0.8 + 1.2;
        const x = b.x + Math.cos(ang) * rad;
        const z = b.z + Math.sin(ang) * rad;
        const y = this.world.heightAt(x, z);
        dummy.position.set(x, y + Math.abs(Math.sin(t * 5 + phase)) * 0.08, z);
        dummy.rotation.set(0, -ang + Math.PI / 2, 0);
        dummy.scale.setScalar(0.85);
        dummy.updateMatrix();
        this.workerMesh.setMatrixAt(n, dummy.matrix);
        c.setHex(def.cat === 'gather' ? 0x7d8f52 : def.cat === 'craft' ? 0x8a5a36 : def.cat === 'military' ? 0x8c3f35 : 0x5e7a8c);
        c.offsetHSL((i % 3) * 0.02, 0, (i % 2) * 0.05);
        this.workerMesh.setColorAt(n, c);
        n++;
      }
    }
    this.workerMesh.count = n;
    this.workerMesh.instanceMatrix.needsUpdate = true;
    if (this.workerMesh.instanceColor) this.workerMesh.instanceColor.needsUpdate = true;
  }

  // ---------------- roads & pads ----------------
  _padTexture() {
    if (this._padTex) return this._padTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.58, 'rgba(255,255,255,0.62)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this._padTex = t;
    return t;
  }

  rebuildPads() {
    if (this.pads) { this.scene.remove(this.pads); this.pads.geometry.dispose(); this.pads = null; }
    const list = this.state.buildings;
    if (!list.length) return;
    const geo = new THREE.CircleGeometry(1, 24);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.MeshLambertMaterial({
      map: this._padTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const mesh = new THREE.InstancedMesh(geo, m, list.length);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const def = BUILDINGS[b.type];
      d.position.set(b.x, (b.y ?? 0) + 0.06, b.z);
      d.scale.setScalar((def.size + 1.0) * 0.78);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      c.setHex(b.type === 'farm' ? 0x8b7a52 : 0x9a8760).offsetHSL(0, 0, ((b.id % 3) - 1) * 0.025);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.renderOrder = 0;
    this.pads = mesh;
    this.scene.add(mesh);
  }

  rebuildRoads() {
    if (this.roads) { this.scene.remove(this.roads); this.roads.geometry.dispose(); this.roads = null; }
    const verts = [];
    const keep = this.state.buildings.find(b => b.type === 'keep');
    const tx = keep ? keep.x : 0, tz = keep ? keep.z : 4;
    for (const b of this.state.buildings) {
      if (b.type === 'keep') continue;
      const dist = Math.hypot(b.x - tx, b.z - tz);
      if (dist < 6) continue;
      const segments = Math.max(4, Math.floor(dist / 3));
      const width = 1.5;
      for (let i = 0; i < segments; i++) {
        const t0 = i / segments, t1 = (i + 1) / segments;
        const x0 = b.x + (tx - b.x) * t0, z0 = b.z + (tz - b.z) * t0;
        const x1 = b.x + (tx - b.x) * t1, z1 = b.z + (tz - b.z) * t1;
        const dx = x1 - x0, dz = z1 - z0;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len * width, nz = dx / len * width;
        const y0 = this.world.heightAt(x0, z0) + 0.085;
        const y1 = this.world.heightAt(x1, z1) + 0.085;
        verts.push(
          x0 + nx, y0, z0 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz,
          x1 + nx, y1, z1 + nz, x0 - nx, y0, z0 - nz, x1 - nx, y1, z1 - nz
        );
      }
    }
    if (!verts.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ color: 0x9d8a61, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = 0;
    this.roads = mesh;
    this.scene.add(mesh);
  }

  // ---------------- production ----------------
  productionMult(b) {
    const e = this.game.economy;
    const keep = this.state.buildings.find(x => x.type === 'keep');
    const kl = keep ? keep.level : 1;
    let mult = (0.68 + this.game.state.happiness / 100 * 0.55) * (1 + (b.level - 1) * 0.45);
    mult *= 1 + (kl - 1) * 0.035;
    const reg = REGIONS[b.region] || REGIONS.vale;
    const mods = this.game.regionMods(b.region);
    return { mult, mods };
  }

  nearBonus(b, res) {
    const def = BUILDINGS[b.type];
    if (!def.near) return 1;
    if (def.near.tree) return b.near?.wood || 1;
    if (def.near.rock) return res === 'iron' ? (b.near?.iron || 1) : (b.near?.stone || 1);
    if (def.near.water) return b.near?.food || 1;
    return 1;
  }

  tick() {
    const s = this.state;
    const gains = [];
    const season = SEASONS[s.season].prod;
    let totalGold = this.effects.goldTick || 0;
    const ev = this.game.economy.eventMods;
    for (const b of s.buildings) {
      if (!b.workers) continue;
      const def = BUILDINGS[b.type];
      if (!def.prod) continue;
      const { mult } = this.productionMult(b);
      const consume = def.consume || null;
      let eff = 1;
      if (consume) {
        for (const [r, amt] of Object.entries(consume)) {
          const need = amt * b.workers * mult * (season[r] || 1);
          if (need > 0) eff = Math.min(eff, (s.resources[r] || 0) / need);
        }
        eff = Math.max(0, Math.min(1, eff));
        if (eff < 0.98 && eff > 0) this.game.onInputShortage(b, eff);
      }
      const gainsB = {};
      for (const [r, amount] of Object.entries(def.prod)) {
        if (r === 'gold') continue;
        const near = this.nearBonus(b, r) || 1;
        const sm = season[r] || 1;
        const rm = this.game.regionMods(b.region)[r] || 1;
        const amt = amount * b.workers * mult * near * sm * rm * eff * (ev.prodMult || 1);
        if (amt <= 0) continue;
        this.game.economy.gainResource(r, amt);
        gainsB[r] = (gainsB[r] || 0) + amt;
      }
      if (def.prod.gold) {
        const amt = def.prod.gold * b.workers * mult * eff * (ev.prodMult || 1);
        this.game.economy.gainGold(amt);
        totalGold += amt;
        gainsB.gold = (gainsB.gold || 0) + amt;
      }
      if (consume && eff > 0) {
        for (const [r, amt] of Object.entries(consume)) {
          this.game.economy.spendResource(r, amt * b.workers * mult * (season[r] || 1) * eff);
        }
      }
      if (Object.keys(gainsB).length) gains.push({ b, gains: gainsB, eff });
    }
    // taxes from idle villagers and markets
    const idle = this.idleWorkers();
    const taxes = idle * 1.15 + (this.effects.goldTick || 0);
    if (taxes > 0) {
      this.game.economy.gainGold(taxes);
      // no floater for taxes every tick, handled subtly by gold rate
    }
    this._lastTickGains = gains;
    return { gains, taxes, totalGold };
  }

  // ---------------- selection ----------------
  select(b) {
    this.selected = b || null;
    if (!b) { this.ring.visible = false; return; }
    this.ring.visible = true;
    this.ring.position.set(b.x, (b.y ?? 0) + 0.12, b.z);
    const def = BUILDINGS[b.type];
    this.ring.scale.setScalar(def.size * 0.9 + 1.2);
  }
  hover(b) {
    this.hovered = b || null;
    if (!b) { this.hoverRing.visible = false; return; }
    this.hoverRing.visible = true;
    this.hoverRing.position.set(b.x, (b.y ?? 0) + 0.1, b.z);
    const def = BUILDINGS[b.type];
    this.hoverRing.scale.setScalar(def.size + 1.9);
  }

  pickAt() {
    const hits = this.engine.raycast(this.pickables, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.buildingId) o = o.parent;
    if (!o) return null;
    return this.state.buildings.find(b => b.id === o.userData.buildingId) || null;
  }

  update(dt) {
    this._time += dt;
    // ring pulse
    if (this.ring.visible) {
      this.ringMat.opacity = 0.44 + Math.sin(this._time * 2.4) * 0.13;
      this.ring.rotation.y += dt * 0.2;
    }
    if (this.hoverRing.visible) this.hoverMat.opacity = 0.22 + Math.sin(this._time * 3) * 0.08;
    if (this.ghost) {
      this.ghostRingMat.opacity = 0.55 + Math.sin(this._time * 4) * 0.2;
      this.ghost.position.y = this.ghostPos.y + Math.sin(this._time * 2) * 0.05;
    }
    // worker animation (30hz is enough visually)
    this._wacc = (this._wacc || 0) + dt;
    if (this._wacc > 0.045) { this.updateWorkers(); this._wacc = 0; }
    // production timer
    this.prodTimer += dt;
    if (this.prodTimer >= TICK) {
      this.prodTimer -= TICK;
      this.tick();
    }
    // smoke & fire
    const time = performance.now() * 0.001;
    for (const b of this.state.buildings) {
      const mesh = this.meshes.get(b.id);
      if (!mesh) continue;
      // fire flicker
      mesh.traverse(o => {
        if (o.name === 'fire') {
          const s = 0.9 + Math.sin(time * 6 + b.id) * 0.12;
          o.scale.set(s, 1, s);
        }
      });
      if (b.workers > 0 && mesh.userData.smoke) {
        const last = this.smokeTimers.get(b.id) || 0;
        if (time - last > 1.4) {
          this.smokeTimers.set(b.id, time);
          const v = mesh.userData.smoke;
          this._tmp.set(b.x + v.x, b.y + v.y, b.z + v.z);
          this.engine.particles.burst(this._tmp, 0xcfc4ae, 1, { speed: 0.25, up: 0.8, life: 2.6, size: 1.5, grav: -0.15, drag: 0.4 });
        }
      }
    }
  }

  // helper for UI display
  buildingOutput(b) {
    const def = BUILDINGS[b.type];
    if (!def.prod) return null;
    const out = {};
    for (const k of Object.keys(def.prod)) out[k] = def.prod[k] * Math.max(1, b.workers) * (1 + (b.level - 1) * 0.45);
    return out;
  }

  countType(type) { return this.state.buildings.filter(b => b.type === type).length; }
}
