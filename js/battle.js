import * as THREE from '../assets/lib/three.module.js?v=160';
import {
  makePlayer, makeBanner, buildBuilding, SOLDIER_GEO, treeGeoms, rockGeom, grassGeom,
  mat, blob, C, mergeGeoms, boxGeo, cylGeo, coneGeo, sphereGeo
} from './models.js';
import { UNITS, ENEMY_UNITS, EQUIP_TIERS } from './config.js';
import { Particles } from './engine.js';

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
// Render capacity per side. The simulation can hold more, but a normal
// campaign host (even with many manors and barracks) stays well inside this.
const MAX_UNITS = 1200;
const MAX_ARROWS = 240;
const MAX_CORPSES = 260;
const MAX_BOULDERS = 32;
// Separation is the hottest per-frame loop. A coarse grid turns the O(n^2)
// neighbour search into a handful of bucket lookups around each soldier.
const SEP_CELL = 2.0;
const SEP_GRID = 84;
const SEP_OFFSET = 84;

// Shortest-path angle interpolation. Plain lerp across the +/-PI seam made
// soldiers spin the long way round and look like they were marching backwards.
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const TEAM_COLORS = {
  ally: { militia: 0x466b86, spearman: 0x3f6d72, axeman: 0x8a6a3a, archer: 0x4f7557, arrowman: 0x5b7d4e, crossbow: 0x5c6f4a, knight: 0x8393a0, cavalry: 0x6f7d94, warElephant: 0x8b8270, catapult: 0x7a5a32 },
  enemy: { bandit: 0x7c3d33, raider: 0x8a4a2e, spearman: 0x6b5a3b, axeman: 0x6d4a2d, archer: 0x6f5140, arrowman: 0x74583f, crossbow: 0x5a4f38, brute: 0x5b3028, soldier: 0x77453c, cavalry: 0x563a44, berserker: 0x8d2f24, knight: 0x583237, elephant: 0x6c6252, catapult: 0x5b4328, giant: 0x3a2622, warlord: 0x2f1b20 },
};

export class Battle {
  constructor(engine, audio, game) {
    this.engine = engine;
    this.audio = audio;
    this.game = game;
    this.ui = game.ui;
    this.active = false;
    this.phase = 'idle';
    this.scene = null;
    this.camera = null;
    this.troops = [];
    this.arrows = [];
    this.corpses = [];
    this.formation = [];
    this.enemyFormation = [];
    this.player = {
      pos: new THREE.Vector3(0, 0, 42), vel: new THREE.Vector3(),
      yaw: 0, pitch: 0.16, hp: 320, maxHp: 320, stamina: 100, maxStamina: 100,
      attack: { phase: 'idle', t: 0, dir: 'right', hitDone: false },
      blocking: false, dodge: 0, invuln: 0, combo: 0, comboT: 0,
      swing: 0, walk: 0, hurtT: 0, killCount: 0, regenT: 0,
      alive: true, team: 'player', routing: false, target: null, armor: 0,
    };
    this.order = 'advance';
    this.rallyCd = 0;
    this.allyAnchor = new THREE.Vector3(0, 0, 30);
    this.enemyAnchor = new THREE.Vector3(0, 0, -30);
    this.allySpawn = new THREE.Vector3(0, 0, 30);
    this.enemySpawn = new THREE.Vector3(0, 0, -30);
    this.hitstop = 0;
    this.shake = 0;
    this.aiT = 0;
    this.elapsed = 0;
    this.endTimer = 0;
    this.result = null;
    this.incoming = 0;
    this.arrowT = 0;
    this.feedT = 0;
    this.mouseDX = 0;
    this.paused = false;
    this.didInit = false;
    this._hudT = 0;
    this._lastOrder = '';
    this._bound = false;
    this.playerAttackDir = 'right';
    this.bannerTimeout = null;
    this.cameraShake = 0;
    this.friendlyLosses = { militia: 0, spearman: 0, axeman: 0, archer: 0, arrowman: 0, crossbow: 0, knight: 0, cavalry: 0, warElephant: 0, catapult: 0 };
    this.enemyKills = 0;
    this.playerKills = 0;
    this.troopKills = 0;
    // Reinforcement waves + siege presentation.
    this.waveQueue = [];
    this.waveTotal = 0;
    this.waveIndex = 0;
    this.waveTimer = 0;
    this.waveInitial = 0;
    this.castle = null;
    this.castleGate = null;
    this.siege = null;
    this.formationType = 'line';
    // Camera / commands.
    this.camDist = 7.4;
    this.tactical = false;
    this.volleyCd = 0;
    this.powerCd = 0;
    this.powerCdMax = 9;
    // Render slots are allocated once per soldier. Keeping them stable means
    // the instance-colour buffer only uploads when a new unit appears, not on
    // every single frame of a large battle.
    this._renderSlots = { ally: 0, enemy: 0 };
    this._specialSlots = { ally: { elephant: 0, catapult: 0 }, enemy: { elephant: 0, catapult: 0 } };
    this._sepHead = new Int32Array(SEP_GRID * SEP_GRID);
    this._sepNext = new Int32Array(2600);
    this._visStride = 1;
    this._visFrame = 0;
    this._frameAvg = 1 / 60;
    this._perfT = 0;
    this._basePixelRatio = 1;
  }

  // ============================================================
  // SCENE
  // ============================================================
  initScene() {
    if (this.didInit) return;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color(0x91aab5);
    scene.fog = new THREE.Fog(0x9cafb0, 80, 260);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 12, 50);
    this.hemi = new THREE.HemisphereLight(0xbcd0dd, 0x4e5638, 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe1b0, 2.0);
    this.sun.position.set(60, 80, 30);
    scene.add(this.sun);
    this.sun2 = new THREE.DirectionalLight(0x9fb8d0, 0.35);
    this.sun2.position.set(-40, 30, -60);
    scene.add(this.sun2);
    this.particles = new Particles(scene, 320);
    this._buildGround();
    this._buildBattleProps();
    this._buildMeshes();
    this.playerMesh = makePlayer();
    scene.add(this.playerMesh);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.55, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xd8442e, transparent: true, opacity: 0.8, depthWrite: false })
    );
    this.ring.visible = false;
    scene.add(this.ring);
    this.didInit = true;
  }

  groundH(x, z) {
    const d = Math.hypot(x, z);
    const n = Math.sin(x * 0.07 + 1.2) * Math.cos(z * 0.061) * 0.9
      + Math.sin(x * 0.17) * Math.cos(z * 0.14) * 0.3;
    const flat = clamp((d - 52) / 45, 0, 1);
    return n * flat * 1.8;
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(300, 300, 60, 60);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c1 = new THREE.Color(0x6d8a4f), c2 = new THREE.Color(0x89a35c), cd = new THREE.Color(0x8a7550);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, this.groundH(x, z));
      tmp.copy(c1).lerp(c2, Math.sin(x * 0.21 + z * 0.17) * 0.5 + 0.5);
      if (Math.hypot(x, z) < 16) tmp.lerp(cd, 0.25);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(geo, m);
    this.scene.add(mesh);
    this.ground = mesh;
  }

  _buildBattleProps() {
    const rnd = (() => { let s = 9182; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const { trunk, leaves } = treeGeoms();
    const n = 90;
    const tp = [], lp = [];
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = 62 + rnd() * 70;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      tp.push({ x, z, y: this.groundH(x, z), ry: rnd() * 6.28, s: 0.8 + rnd() * 0.7 });
    }
    const dummy = new THREE.Object3D();
    const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x6a4a2f, flatShading: true }), n);
    const leafMesh = new THREE.InstancedMesh(leaves, new THREE.MeshLambertMaterial({ color: 0x648c46, flatShading: true }), n);
    for (let i = 0; i < n; i++) {
      const p = tp[i];
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.ry, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix); leafMesh.setMatrixAt(i, dummy.matrix);
    }
    trunkMesh.instanceMatrix.needsUpdate = true; leafMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(trunkMesh, leafMesh);
    // rocks
    const rp = [];
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 40 + rnd() * 70;
      rp.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0, ry: rnd() * 6.28, s: 0.7 + rnd() });
    }
    const rockMesh = new THREE.InstancedMesh(rockGeom(), new THREE.MeshLambertMaterial({ color: 0x8c9089, flatShading: true }), rp.length);
    for (let i = 0; i < rp.length; i++) {
      const p = rp[i];
      p.y = this.groundH(p.x, p.z);
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.ry, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix();
      rockMesh.setMatrixAt(i, dummy.matrix);
    }
    rockMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(rockMesh);
    // meadow tufts keep the fighting field from looking like a flat plane
    const gp = [];
    for (let i = 0; i < 360; i++) {
      const a = rnd() * Math.PI * 2, r = 8 + Math.sqrt(rnd()) * 46;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      gp.push({ x, z, y: this.groundH(x, z), ry: rnd() * 6.28, s: 0.42 + rnd() * 0.38 });
    }
    const grassMesh = new THREE.InstancedMesh(grassGeom(), new THREE.MeshLambertMaterial({ color: 0x6f8f4d, flatShading: true }), gp.length);
    for (let i = 0; i < gp.length; i++) {
      const p = gp[i];
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.ry, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix();
      grassMesh.setMatrixAt(i, dummy.matrix);
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(grassMesh);
    // banners
    this.friendlyBanner = new THREE.Group();
    this.friendlyBanner.add(makeBanner(0x3f5f7a, 1.5));
    this.friendlyBanner.position.set(-18, 0, 29);
    this.scene.add(this.friendlyBanner);
    this.enemyBanner = new THREE.Group();
    this.enemyBanner.add(makeBanner(0x8d3f33, 1.5));
    this.enemyBanner.position.set(18, 0, -29);
    this.enemyBanner.rotation.y = Math.PI;
    this.scene.add(this.enemyBanner);
    // distant hills
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x5f7247, flatShading: true });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const h = new THREE.Mesh(new THREE.ConeGeometry(30 + rnd() * 20, 22 + rnd() * 20, 7), hillMat);
      h.position.set(Math.cos(a) * 170, -4, Math.sin(a) * 170);
      this.scene.add(h);
    }
    // The rival's castle: the reason we are here. Walls, towers, a gate and
    // the keep behind it. Reinforcement waves pour out of the gate.
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x807a6b, flatShading: true });
    const darkStone = new THREE.MeshLambertMaterial({ color: 0x5e5a50, flatShading: true });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x5a3c25, flatShading: true });
    const castle = new THREE.Group();
    const box = (x, y, z, w, h, d, m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      castle.add(mesh);
      return mesh;
    };
    // Curtain wall split around a real gate opening. When the gate falls the
    // gap is a road into the courtyard, not a painted door on a solid wall.
    const wallL = box(-15.4, 3.4, -2, 17.2, 6.8, 4.2, stoneMat);
    const wallR = box(15.4, 3.4, -2, 17.2, 6.8, 4.2, stoneMat);
    this.castleWalls = [wallL, wallR];
    // Wall walk and crenellations give the archers a place to stand.
    box(0, 7.1, -2, 49, 0.7, 5.0, darkStone);
    for (let x = -22; x <= 22; x += 3.2) {
      box(x, 8.0, -4.1, 1.2, 1.2, 0.8, darkStone);
    }
    box(-24, 6, -2, 6.4, 12, 6.4, darkStone);
    box(24, 6, -2, 6.4, 12, 6.4, darkStone);
    box(0, 5.2, 2, 13, 10.4, 5, darkStone);
    const gate = box(0, 2.4, 4.7, 7, 5.2, 0.5, woodMat);
    gate.userData.isGate = true;
    box(0, 9, -14, 20, 18, 12, stoneMat);
    box(0, 18.5, -14, 23, 2.4, 14, darkStone);
    for (const x of [-11, 11]) {
      const tower = new THREE.Mesh(new THREE.ConeGeometry(4.2, 8, 7), darkStone);
      tower.position.set(x, 22, -14); castle.add(tower);
    }
    for (const x of [-24, 24]) {
      const b = makeBanner(0x8d2f24, 2.2);
      b.position.set(x, 11.8, -2);
      castle.add(b);
    }
    const gateBanner = makeBanner(0x8d2f24, 1.7);
    gateBanner.position.set(0, 10.2, 4.4);
    castle.add(gateBanner);
    castle.position.set(0, this.groundH(0, -62), -62);
    castle.visible = false;
    this.scene.add(castle);
    this.castle = castle;
    this.castleGate = castle.children.find(c => c.geometry && c.material === woodMat);
  }

  _buildMeshes() {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const headMat = new THREE.MeshLambertMaterial({ color: 0xc9a37d, flatShading: true });
    const helmetMat = new THREE.MeshLambertMaterial({ color: 0x7d878d, flatShading: true });
    const weaponMat = new THREE.MeshLambertMaterial({ color: 0xa9b3b9, flatShading: true });
    const shieldMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const mkSet = () => ({
      body: new THREE.InstancedMesh(SOLDIER_GEO.bodyGeo, bodyMat, MAX_UNITS),
      head: new THREE.InstancedMesh(SOLDIER_GEO.headGeo, headMat, MAX_UNITS),
      helmet: new THREE.InstancedMesh(SOLDIER_GEO.helmetGeo, helmetMat, MAX_UNITS),
      shield: new THREE.InstancedMesh(SOLDIER_GEO.shieldGeo, shieldMat, MAX_UNITS),
      weapon: new THREE.InstancedMesh(SOLDIER_GEO.weaponGeo, weaponMat, MAX_UNITS),
    });
    this.meshSets = { ally: mkSet(), enemy: mkSet() };
    for (const set of Object.values(this.meshSets)) {
      for (const m of Object.values(set)) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.count = 0;
        this.scene.add(m);
      }
    }
    this.corpseMesh = new THREE.InstancedMesh(SOLDIER_GEO.bodyGeo, new THREE.MeshLambertMaterial({ color: 0x4a4036, flatShading: true }), MAX_CORPSES);
    this.corpseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.corpseMesh.frustumCulled = false;
    this.corpseMesh.count = 0;
    this.scene.add(this.corpseMesh);
    const arrowGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 4);
    this.arrowMesh = new THREE.InstancedMesh(arrowGeo, new THREE.MeshLambertMaterial({ color: 0xd9c8a2, flatShading: true }), MAX_ARROWS);
    this.arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrowMesh.frustumCulled = false;
    this.arrowMesh.count = 0;
    this.scene.add(this.arrowMesh);

    // Siege engines and war elephants are too large and too different to
    // hide inside the infantry silhouette. They get their own instanced
    // geometry so a few dozen do not turn into hundreds of draw calls.
    const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
    const elephantGeo = mergeGeoms([
      { geo: boxGeo(1.7, 1.35, 3.0), m: T(0, 1.55, 0) },
      { geo: boxGeo(1.45, 1.25, 1.0), m: T(0, 1.95, 1.55) },
      { geo: boxGeo(0.55, 0.5, 1.35), m: T(0, 1.55, 2.35) },
      { geo: coneGeo(0.17, 0.95, 6), m: T(-0.26, 1.05, 2.85) },
      { geo: coneGeo(0.17, 0.95, 6), m: T(0.26, 1.05, 2.85) },
      { geo: boxGeo(0.18, 0.85, 0.18), m: T(-0.55, 0.55, -0.9) },
      { geo: boxGeo(0.18, 0.85, 0.18), m: T(0.55, 0.55, -0.9) },
      { geo: boxGeo(0.18, 0.85, 0.18), m: T(-0.55, 0.55, 0.95) },
      { geo: boxGeo(0.18, 0.85, 0.18), m: T(0.55, 0.55, 0.95) },
      { geo: boxGeo(0.12, 0.75, 0.12), m: T(0, 1.35, -1.65) },
      { geo: boxGeo(1.1, 0.62, 0.18), m: T(0, 2.55, 1.45) },
    ]);
    const catapultGeo = mergeGeoms([
      { geo: boxGeo(2.0, 0.28, 1.5), m: T(0, 1.0, 0) },
      { geo: boxGeo(0.28, 1.0, 1.5), m: T(-0.78, 1.45, 0) },
      { geo: boxGeo(0.28, 1.0, 1.5), m: T(0.78, 1.45, 0) },
      { geo: boxGeo(0.25, 2.1, 0.25), m: T(0, 1.75, -0.85) },
      { geo: boxGeo(2.5, 0.2, 0.22), m: new THREE.Matrix4().makeRotationZ(0.38).multiply(T(0, 2.1, 0)) },
      { geo: cylGeo(0.48, 0.48, 0.18, 8), m: new THREE.Matrix4().makeRotationZ(Math.PI / 2).multiply(T(0.55, 0.62, 0)) },
      { geo: cylGeo(0.48, 0.48, 0.18, 8), m: new THREE.Matrix4().makeRotationZ(Math.PI / 2).multiply(T(-0.55, 0.62, 0)) },
      { geo: boxGeo(0.7, 0.5, 0.65), m: T(0, 1.2, 0.9) },
    ]);
    this.specialMeshes = { ally: {}, enemy: {} };
    for (const team of ['ally', 'enemy']) {
      const ele = new THREE.InstancedMesh(elephantGeo, new THREE.MeshLambertMaterial({ color: 0x887d6b, flatShading: true }), MAX_UNITS);
      const cat = new THREE.InstancedMesh(catapultGeo, new THREE.MeshLambertMaterial({ color: 0x6f5030, flatShading: true }), MAX_UNITS);
      for (const m of [ele, cat]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.count = 0;
        this.scene.add(m);
      }
      this.specialMeshes[team].elephant = ele;
      this.specialMeshes[team].catapult = cat;
    }
    this.boulderMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshLambertMaterial({ color: 0x777168, flatShading: true }), MAX_BOULDERS);
    this.boulderMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.boulderMesh.frustumCulled = false;
    this.boulderMesh.count = 0;
    this.scene.add(this.boulderMesh);
  }

  // ============================================================
  // START / END
  // ============================================================
  start(config) {
    this.initScene();
    this.config = config;
    this.active = true;
    this.phase = config.defense ? 'fighting' : 'deploy';
    this.paused = false;
    this.formationType = config.formation || 'line';
    this.siege = null;
    this.elapsed = 0;
    this.result = null;
    this.endTimer = 0;
    this.hitstop = 0;
    this.incoming = 0;
    this.arrows.length = 0;
    this.corpses.length = 0;
    this.corpseMesh.count = 0;
    this.troopKills = 0; this.playerKills = 0; this.enemyKills = 0;
    this.friendlyLosses = { militia: 0, spearman: 0, axeman: 0, archer: 0, arrowman: 0, crossbow: 0, knight: 0, cavalry: 0, warElephant: 0, catapult: 0 };
    this.order = 'advance';
    this.rallyCd = 0;
    this.volleyCd = 0;
    this.powerCd = 0;
    this.camDist = 7.4;
    this.tactical = false;
    this.waveQueue = [];
    this.waveTotal = 0;
    this.waveIndex = 0;
    this.waveTimer = 0;
    this.waveInitial = 0;
    this._renderSlots = { ally: 0, enemy: 0 };
    this._specialSlots = { ally: { elephant: 0, catapult: 0 }, enemy: { elephant: 0, catapult: 0 } };
    this._visStride = 1;
    this._visFrame = 0;
    this._frameAvg = 1 / 60;
    this._perfT = 0;
    // Start each battle at the graphics tier the player selected, then let
    // the adaptive scaler below trade resolution for a steady frame rate.
    this.engine.setQuality(this.engine.quality);
    this._basePixelRatio = this.engine.renderer.getPixelRatio();
    this.troops = [];
    this.allyAnchor.set(0, 0, 30);
    this.enemyAnchor.set(0, 0, -30);
    const equip = EQUIP_TIERS[this.game.state.equipTier] || EQUIP_TIERS[0];
    const comp = config.friendlyComp || [];
    const enemyComp = config.enemyComp || [];
    this.player.maxHp = Math.round(420 + equip.bonus * 190);
    this.player.hp = this.player.maxHp;
    this.player.alive = true;
    this.player.team = 'player';
    this.player.routing = false;
    this.player.target = null;
    this.player.armor = 0;
    this.player.stamina = 100;
    this.player.combo = 0; this.player.comboT = 0;
    this.player.killCount = 0;
    this.player.pos.set(0, 0, 43);
    this.player.vel.set(0, 0, 0);
    this.player.yaw = 0; this.player.pitch = 0.16;
    this.player.weapon = 'bow';
    this.player.mounted = true;
    this.player.attack = { phase: 'idle', t: 0, dir: 'right', hitDone: false };
    this.player.blocking = false; this.player.dodge = 0; this.player.invuln = 0;
    this.player.hurtT = 0;
    // Spawn the whole host in one wide block. A fixed narrow line stacked
    // hundreds of ranks deep and overflowed the rear of the field; wide ranks
    // keep a 1,000-man army reading as a line, not a column.
    const rangedRank = (t) => (t === 'archer' || t === 'arrowman' || t === 'crossbow' || t === 'catapult') ? 2
      : (t === 'cavalry' || t === 'knight' || t === 'warElephant') ? 0 : 1;
    const sorted = [...comp].sort((a, b) => rangedRank(a) - rangedRank(b));
    for (let i = 0; i < comp.length; i++) {
      const type = sorted[i];
      const u = UNITS[type] || UNITS.militia;
      const t = this._makeTroop('ally', type, u, 0, 30, equip);
      this.troops.push(t);
    }
    this._layoutAllies();
    this.allySpawn.set(0, 0, 30);
    this.enemySpawn.set(0, 0, -30);

    this.castle.visible = !config.defense;
    this.castleGate = this.castle.children.find(c => c.userData?.isGate) || null;
    if (this.castleGate) this.castleGate.visible = true;
    if (this.castleWalls) for (const w of this.castleWalls) w.visible = true;

    const esorted = [...enemyComp].sort((a, b) => {
      const rank = (t) => (t === 'archer' || t === 'arrowman' || t === 'crossbow' || t === 'catapult') ? 0
        : (t === 'giant' || t === 'warlord' || t === 'knight' || t === 'cavalry' || t === 'elephant') ? 2 : 1;
      return rank(a) - rank(b);
    });
    // The enemy host arrives together: wall archers man the parapet, a
    // garrison holds the courtyard, and the field army deploys in front of
    // the gate. No trickle of three-piece waves.
    let field = esorted;
    let wallList = [], garrisonList = [];
    if (!config.defense) {
      const total = esorted.length;
      const wallCount = Math.min(24, Math.max(4, Math.round(total * 0.05)));
      const garrisonCount = Math.min(140, Math.max(0, Math.round(total * 0.14)));
      wallList = esorted.slice(0, wallCount);
      garrisonList = esorted.slice(wallCount, wallCount + garrisonCount);
      field = esorted.slice(wallCount + garrisonCount);
      const gateMax = Math.round(900 + total * 1.15);
      this.siege = {
        gateMax, gateHp: gateMax, gateOpen: false,
        gatePos: new THREE.Vector3(0, 2.2, this.castle.position.z + 4.7),
        wallHp: gateMax * 0.7,
      };
    }
    this.waveTotal = 1;
    this.waveQueue = [];
    this.waveIndex = 1;
    this.waveInitial = field.length;
    this._spawnEnemyWave(field, false);
    if (!config.defense) {
      this._spawnWallArchers(wallList || []);
      this._spawnGarrison(garrisonList || []);
    }
    // A thousand-plus soldiers on the field is a deliberate spectacle. Start
    // at half transform rate, then let the adaptive scaler decide from there.
    this._visStride = this.troops.length > 700 ? 2 : 1;

    this.engine.input.keys.clear();
    this._bind();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this._updateCamera(0, true);
    this.ui.setBattle(true, config.title);
    this.engine.canvas.style.cursor = 'grab';
    this.audio.horn();
    this.audio.setBattle(true);
    if (this.phase === 'deploy') {
      this.camDist = 30;
      this.tactical = true;
      this._updateCamera(0, true);
      this.ui.showBattleDeploy({
        formation: this.formationType,
        friend: comp.length,
        enemy: enemyComp.length,
        castle: !config.defense,
      });
    } else {
      this.ui.battleBanner('TO ARMS', config.subtitle || 'Click to take command, then fight alongside your host');
      setTimeout(() => { if (this.active) this.ui.hideBattleBanner(); }, 2600);
    }
    this._updateHud(true);
  }

  // ------------------------------------------------------------
  // Deployment. The ranks are stored on the troop, so choosing a new
  // formation before the march is just a re-layout of those slots.
  // ------------------------------------------------------------
  _layoutAllies() {
    const list = this.troops.filter(t => t.team === 'ally' && t.alive);
    const n = list.length;
    if (!n) return;
    const type = this.formationType;
    const spacing = n > 520 ? 1.55 : 1.85;
    let cols = Math.min(46, Math.max(6, Math.ceil(Math.sqrt(n * 2.3))));
    if (type === 'shield') cols = Math.min(38, Math.max(8, Math.ceil(Math.sqrt(n * 1.55))));
    for (let i = 0; i < n; i++) {
      const t = list[i];
      let sx, sz;
      if (type === 'wedge') {
        // A growing arrowhead: each rank is one man wider on each side.
        const row = Math.floor(Math.sqrt(i));
        const col = i - row * row;
        sx = (col - row) * spacing * 1.12;
        sz = 30 + row * spacing * 1.15;
      } else {
        const row = Math.floor(i / cols), col = i % cols;
        sx = (col - (cols - 1) / 2) * spacing;
        sz = 30 + row * (type === 'shield' ? 1.45 : spacing * 1.12);
      }
      t.slotX = sx;
      t.slotZ = sz;
      if (this.phase === 'deploy') {
        t.pos.set(sx, this.groundH(sx, sz), sz);
        t.home.set(sx, 0, sz);
      }
    }
  }

  setFormation(type) {
    if (!['line', 'shield', 'wedge'].includes(type)) return;
    this.formationType = type;
    this._layoutAllies();
    this.audio.pop();
    const names = { line: 'Line of Battle', shield: 'Shieldwall', wedge: 'Wedge' };
    this.ui.battleOrderToast(`FORMATION: ${names[type].toUpperCase()}`);
    this.ui.battleFeed(`Your host forms a ${names[type].toLowerCase()}`, false);
    this._updateHud(true);
  }

  beginMarch() {
    if (this.phase !== 'deploy' && this.phase !== 'fighting') return;
    this.phase = 'fighting';
    this.ui.hideBattleDeploy();
    this.order = 'advance';
    this.camDist = 9;
    this.tactical = false;
    this._updateCamera(0, true);
    this.ui.battleBanner('ADVANCE', this.config.defense ? 'Hold the line' : 'Take the gate. Kill every defender.');
    setTimeout(() => { if (this.active) this.ui.hideBattleBanner(); }, 2100);
    this.audio.horn();
    this._updateHud(true);
  }

  _spawnEnemyWave(list, fromCastle = false) {
    if (!list.length) return;
    // Wider than the old 12-man frontage: a host of a thousand should look
    // like a battle line with depth, not a queue at a door.
    const spacing = list.length > 520 ? 1.5 : 1.9;
    const ecols = Math.min(48, Math.max(8, Math.ceil(Math.sqrt(list.length * 2.4))));
    const baseZ = fromCastle ? -44 : -18;
    for (let i = 0; i < list.length; i++) {
      const type = list[i];
      const u = ENEMY_UNITS[type] || ENEMY_UNITS.bandit;
      const row = Math.floor(i / ecols), col = i % ecols;
      const sx = (col - (ecols - 1) / 2) * spacing + (Math.random() - .5) * .3;
      const sz = baseZ - row * spacing * 1.08;
      const t = this._makeTroop('enemy', type, u, sx, sz, EQUIP_TIERS[0]);
      t.slotX = sx;
      t.slotZ = sz;
      this.troops.push(t);
    }
    if (fromCastle) {
      this.waveTimer = 0;
      this.enemyAnchor.z = Math.max(this.enemyAnchor.z, -26);
      this.ui.battleOrderToast('THE GATES OPEN');
      this.ui.battleFeed('Reinforcements pour from the castle gate', false);
      this.audio.horn();
    }
  }

  _spawnWallArchers(list) {
    if (!list.length) return;
    for (let i = 0; i < list.length; i++) {
      const type = list[i];
      const u = ENEMY_UNITS[type] || ENEMY_UNITS.archer;
      const x = -21 + (i / Math.max(1, list.length - 1)) * 42;
      const z = -63.6;
      const t = this._makeTroop('enemy', type, u, x, z, EQUIP_TIERS[0]);
      t.wall = true;
      t.pos.y = this.groundH(x, z) + 8.0;
      t.home.set(x, t.pos.y, z);
      t.slotX = x; t.slotZ = z;
      this.troops.push(t);
    }
  }

  _spawnGarrison(list) {
    if (!list.length) return;
    const cols = Math.min(18, Math.max(4, Math.ceil(Math.sqrt(list.length * 1.8))));
    for (let i = 0; i < list.length; i++) {
      const type = list[i];
      const u = ENEMY_UNITS[type] || ENEMY_UNITS.bandit;
      const row = Math.floor(i / cols), col = i % cols;
      const x = (col - (cols - 1) / 2) * 1.55;
      const z = -66.5 - (row % 7) * 1.35;
      const t = this._makeTroop('enemy', type, u, x, z, EQUIP_TIERS[0]);
      t.garrison = true;
      t.slotX = x; t.slotZ = z;
      t.pos.set(x, this.groundH(x, z), z);
      this.troops.push(t);
    }
  }

  _makeTroop(team, type, stats, x, z, equip) {
    const hpBonus = 1 + (equip ? equip.bonus * 0.35 : 0);
    const train = team === 'ally' ? (this.game.state.training?.[type] || 0) : 0;
    const statScale = team === 'enemy' ? (this.config.enemyStatScale || 1) : 1;
    const maxHp = stats.hp * hpBonus * (1 + train * 0.10) * statScale;
    const slots = this._renderSlots || (this._renderSlots = { ally: 0, enemy: 0 });
    const slot = slots[team] ?? 0;
    slots[team] = slot + 1;
    const special = stats.special || null;
    let specialSlot = -1;
    if (special) {
      const ss = this._specialSlots?.[team] || (this._specialSlots = { ally: { elephant: 0, catapult: 0 }, enemy: { elephant: 0, catapult: 0 } })[team];
      specialSlot = ss[special] ?? 0;
      ss[special] = specialSlot + 1;
    }
    return {
      id: Math.random(), team, type,
      renderSlot: special ? -1 : (slot < MAX_UNITS ? slot : -1),
      special, specialSlot,
      _colSet: false,
      _renderGone: false,
      pos: new THREE.Vector3(x, this.groundH(x, z), z),
      home: new THREE.Vector3(x, 0, z),
      vel: new THREE.Vector3(),
      yaw: team === 'ally' ? Math.PI : 0,
      hp: maxHp, maxHp,
      dmg: stats.dmg * (1 + (equip ? equip.bonus : 0)) * (1 + train * 0.08) * statScale,
      armor: stats.armor || 0,
      range: stats.range, speed: stats.speed,
      scale: stats.scale || 1,
      ranged: !!stats.ranged,
      antiCavalry: stats.antiCavalry || 0,
      armorPierce: stats.armorPierce || 0,
      charge: stats.charge || 0,
      reload: stats.reload || (stats.ranged ? 2.3 : 1.2),
      morale: team === 'enemy' ? 98 + Math.random() * 2 : 78 + Math.random() * 16,
      maxMorale: 100,
      cd: Math.random() * 0.8, atkAnim: 0, hitFlash: 0,
      target: null, routing: false, alive: true, sid: 0,
      slotX: x, slotZ: z, walk: Math.random() * 6.28, speedNow: 0,
      attackT: 0, stagger: 0,
      siege: !!stats.siege, splash: stats.splash || 0, trample: !!stats.trample,
      wall: false, garrison: false,
    };
  }

  _bind() {
    if (this._bound) return;
    this._bound = true;
    const c = this.engine.canvas;
    this._drag = { active: false, moved: 0, lx: 0, ly: 0, t: 0 };
    this._ignoreUnlock = false;
    this._onMouseDown = (e) => {
      if (!this.active || this.paused || this.phase !== 'fighting') return;
      if (e.target !== c) return;
      if (e.button === 0) {
        if (document.pointerLockElement) this._startAttack();
        else {
          this._drag.active = true;
          this._drag.moved = 0;
          this._drag.lx = e.clientX; this._drag.ly = e.clientY;
          this._drag.t = performance.now();
          c.style.cursor = 'grabbing';
        }
      } else if (e.button === 2) this.player.blocking = true;
    };
    this._onMouseUp = (e) => {
      if (!this.active) return;
      if (e.button === 2) { this.player.blocking = false; return; }
      if (e.button !== 0 || !this._drag.active) return;
      const quick = performance.now() - this._drag.t < 380 && this._drag.moved < 7;
      this._drag.active = false;
      c.style.cursor = 'grab';
      if (!quick) this.mouseDX = 0;
      if (quick && !this.paused) this._startAttack();
    };
    this._onMove = (e) => {
      if (!this.active || this.paused) return;
      let dx = 0, dy = 0;
      if (document.pointerLockElement === c) {
        dx = e.movementX || 0; dy = e.movementY || 0;
      } else if (this._drag.active) {
        dx = e.clientX - this._drag.lx;
        dy = e.clientY - this._drag.ly;
        this._drag.lx = e.clientX; this._drag.ly = e.clientY;
        this._drag.moved += Math.abs(dx) + Math.abs(dy);
      } else return;
      this.player.yaw -= dx * 0.0023;
      this.player.pitch = clamp(this.player.pitch - dy * 0.0016, -0.08, 0.7);
      this.mouseDX += dx;
    };
    this._onKey = (e) => {
      if (!this.active) return;
      if (this.phase !== 'fighting') return;
      const k = e.code;
      if (k === 'Digit1' || k === 'F1') this._setOrder('advance');
      else if (k === 'Digit2' || k === 'F2') this._setOrder('hold');
      else if (k === 'Digit3' || k === 'F3') this._setOrder('charge');
      else if (k === 'Digit4' || k === 'F4') this._setOrder('follow');
      else if (k === 'Digit5' || k === 'F5') this._setOrder('shield');
      else if (k === 'KeyE') this._volley();
      else if (k === 'KeyF') this._powerShot();
      else if (k === 'KeyB') this._toggleWeapon();
      else if (k === 'KeyT') this._toggleTactical();
      else if (k === 'KeyR') {
        if (this.phase === 'fighting') {
          this.ui.battleOrderToast('RETREAT?');
          this.setPaused(true);
        }
      }
      else if (k === 'KeyQ') this.rally();
      else if (k === 'KeyV') {
        if (document.pointerLockElement) { this._ignoreUnlock = true; document.exitPointerLock(); }
        else this.engine.input.requestLock();
      }
      else if (k === 'Space') { e.preventDefault(); this._dodge(); }
      else if (k === 'Escape') {
        if (document.pointerLockElement) document.exitPointerLock();
        this.setPaused(true);
      }
    };
    this._onLock = () => {
      if (!this.active) return;
      const c = this.engine.canvas;
      if (document.pointerLockElement) { c.style.cursor = 'none'; return; }
      c.style.cursor = 'grab';
      if (this._ignoreUnlock) { this._ignoreUnlock = false; return; }
      if (this.phase === 'fighting' && !this.paused) this.setPaused(true);
    };
    this._onResize = () => {
      if (this.camera) { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); }
    };
    this._onWheel = (e) => {
      if (!this.active) return;
      // Zoom must work while paused and while deploying. The old handler
      // bailed out when paused, which made it impossible to pull the camera
      // back after opening the battle menu.
      e.preventDefault();
      this.camDist = clamp(this.camDist + e.deltaY * 0.012, 3.2, 44);
      this.tactical = this.camDist > 15;
      this._updateCamera(0, true);
    };
    c.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('mousemove', this._onMove);
    window.addEventListener('keydown', this._onKey);
    c.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this._onLock);
    window.addEventListener('resize', this._onResize);
  }

  setPaused(p) {
    if (this.phase !== 'fighting') return;
    this.paused = p;
    this.ui.setBattlePaused(p);
    if (p) {
      this._hadLock = !!document.pointerLockElement;
      if (this._hadLock) document.exitPointerLock();
    } else if (this._hadLock) {
      this._hadLock = false;
      this.engine.input.requestLock();
    } else {
      this.engine.canvas.style.cursor = 'grab';
    }
  }

  _setOrder(order) {
    if (!['advance', 'hold', 'charge', 'follow', 'shield'].includes(order)) return;
    this.order = order;
    this.ui.setBattleOrder(order);
    this.ui.battleOrderToast({ advance: 'ADVANCE', hold: 'HOLD THE LINE', charge: 'CHARGE!', follow: 'FOLLOW ME', shield: 'SHIELDWALL' }[order]);
    this.audio.notification();
    if (order === 'charge') this.audio.battleCry();
    if (order === 'shield') {
      for (const t of this.troops) if (t.team === 'ally' && t.alive) { t.morale = Math.min(100, t.morale + 5); }
    }
    if (order === 'charge') for (const t of this.troops) if (t.team === 'ally' && t.alive) t.morale = Math.min(100, t.morale + 8);
  }

  _toggleTactical() {
    this.tactical = !this.tactical;
    this.camDist = this.tactical ? 30 : 7.4;
    this._updateCamera(0, true);
    this.ui.battleOrderToast(this.tactical ? 'TACTICAL VIEW' : 'CLOSE VIEW');
    this.audio.click();
  }

  _toggleWeapon() {
    const p = this.player;
    if (p.attack.phase !== 'idle') return;
    p.weapon = p.weapon === 'bow' ? 'sword' : 'bow';
    this.ui.battleOrderToast(p.weapon === 'bow' ? 'WAR BOW' : 'SWORD & SHIELD');
    this.ui.battleFeed(p.weapon === 'bow' ? 'You raise the war bow from the saddle' : 'You draw your sword', false);
    this.audio.click();
  }

  _playerShoot() {
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let target = null, best = 1e9;
    for (const t of this.troops) {
      if (t.team !== 'enemy' || !t.alive || t.routing) continue;
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 52 || d < 1.2) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.72) continue;
      const score = d - dot * 20 + (t.wall ? 5 : 0);
      if (score < best) { best = score; target = t; }
    }
    const start = new THREE.Vector3(p.pos.x + fx * 0.8, p.pos.y + 2.35, p.pos.z + fz * 0.8);
    const end = target
      ? new THREE.Vector3(target.pos.x, target.pos.y + (target.wall ? 1.2 : 0.9), target.pos.z)
      : new THREE.Vector3(p.pos.x + fx * 48, p.pos.y + 1.8, p.pos.z + fz * 48);
    const dist = start.distanceTo(end);
    const time = Math.max(0.18, dist / 62);
    const vel = new THREE.Vector3(
      (end.x - start.x) / time,
      (end.y - start.y) / time + 0.5 * 9.8 * time,
      (end.z - start.z) / time
    );
    const eq = EQUIP_TIERS[this.game.state.equipTier] || EQUIP_TIERS[0];
    // The player is a hero, not a levy. A solid hit drops most line infantry
    // in one arrow, and a headshot on a wall archer clears the parapet.
    this.arrows.push({
      pos: start, vel, target, team: 'ally',
      dmg: 118 * (1 + eq.bonus * 0.75),
      pierce: 0.55, life: time + 1.1, playerShot: true,
      hitSet: new Set(),
    });
    this.audio.arrow();
    this.particles.burst(start, 0xf3d28a, 5, { speed: 1.4, up: .8, life: .35, size: .22, grav: 2 });
  }

  _volley() {
    if (this.volleyCd > 0 || this.phase !== 'fighting') return;
    this.volleyCd = 15;
    let fired = 0;
    for (const t of this.troops) {
      if (t.team !== 'ally' || !t.alive || !t.ranged || t.routing) continue;
      if (!t.target || !t.target.alive) continue;
      if (t.targetDist > t.range * 1.15) continue;
      t.cd = Math.min(t.cd, 0.05);
      fired++;
    }
    if (fired) {
      this.ui.battleOrderToast('VOLLEY!');
      this.ui.battleFeed(`${fired} archers loose together`, false);
      this.audio.arrow();
    } else {
      this.ui.battleOrderToast('NO TARGET IN RANGE');
      this.volleyCd = 3;
    }
  }

  _powerShot() {
    if (this.powerCd > 0 || this.phase !== 'fighting') return;
    const p = this.player;
    if (p.stamina < 14) {
      this.ui.battleOrderToast('TOO TIRED TO DRAW');
      this.audio.error?.();
      return;
    }
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let target = null, best = 1e9;
    for (const t of this.troops) {
      if (t.team !== 'enemy' || !t.alive || t.routing) continue;
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 55 || d < 2) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.5) continue;
      const score = d - dot * 16;
      if (score < best) { best = score; target = t; }
    }
    this.powerCd = this.powerCdMax;
    p.stamina = Math.max(0, p.stamina - 14);
    const start = new THREE.Vector3(p.pos.x + fx * 0.7, p.pos.y + 1.45, p.pos.z + fz * 0.7);
    const end = target
      ? new THREE.Vector3(target.pos.x, target.pos.y + 1.05, target.pos.z)
      : new THREE.Vector3(p.pos.x + fx * 46, p.pos.y + 1.0, p.pos.z + fz * 46);
    const dist = start.distanceTo(end);
    const time = Math.max(0.3, dist / 58);
    const vel = new THREE.Vector3(
      (end.x - start.x) / time,
      (end.y - start.y) / time + 0.5 * 9.8 * time,
      (end.z - start.z) / time
    );
    const eq = EQUIP_TIERS[this.game.state.equipTier] || EQUIP_TIERS[0];
    this.arrows.push({
      pos: start, vel, target, team: 'ally',
      dmg: 105 * (1 + eq.bonus * 0.65),
      pierce: 0.75, life: time + 0.9, power: true, hitSet: new Set(),
    });
    this.audio.arrow();
    this.audio.horn();
    this.ui.battleOrderToast('POWER SHOT');
    this.ui.battleFeed('You draw a war bow — the arrow flies true', false);
    this.shake = Math.max(this.shake, 0.22);
    this.particles.burst(new THREE.Vector3(start.x, start.y, start.z), 0xf3d28a, 10, { speed: 2.2, up: 1.2, life: .5, size: .3, grav: 2 });
  }

  rally() {
    if (this.rallyCd > 0 || this.phase !== 'fighting') return;
    this.rallyCd = 30;
    this.audio.horn();
    this.ui.battleOrderToast('RALLY TO ME!');
    for (const t of this.troops) {
      if (t.team !== 'ally' || !t.alive) continue;
      if (t.routing) { t.routing = false; t.morale = 30; }
      t.morale = Math.min(100, t.morale + 35);
      t.hp = Math.min(t.maxHp, t.hp + 8);
      this.particles.burst(new THREE.Vector3(t.pos.x, t.pos.y + 1.5, t.pos.z), 0xa8d98a, 3, { speed: 1, up: 1.5, life: .7, size: .35, grav: 0 });
    }
    const p = this.player;
    this.particles.burst(new THREE.Vector3(p.pos.x, p.pos.y + 2, p.pos.z), 0xe3b95c, 24, { speed: 3, up: 3, life: 1.2, size: .5, grav: 1 });
  }

  _dodge() {
    const p = this.player;
    if (p.dodge > 0 || p.stamina < 22) return;
    const keys = this.engine.input.keys;
    let mx = 0, mz = 0;
    if (keys.has('KeyW')) mz += 1;
    if (keys.has('KeyS')) mz -= 1;
    if (keys.has('KeyA')) mx -= 1;
    if (keys.has('KeyD')) mx += 1;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    let dx = fx * mz + rx * mx, dz = fz * mz + rz * mx;
    if (!dx && !dz) { dx = fx; dz = fz; }
    const l = Math.hypot(dx, dz) || 1;
    p.vel.x = dx / l * 18; p.vel.z = dz / l * 18;
    p.dodge = 0.28; p.invuln = 0.4; p.stamina -= 22;
    this.audio.sword();
  }

  _startAttack() {
    const p = this.player;
    if (p.attack.phase !== 'idle') return;
    if (p.weapon === 'bow') {
      if (p.stamina < 8) return;
      this.mouseDX = 0;
      p.attack = { phase: 'windup', t: 0, dir: 'shoot', hitDone: false };
      p.stamina -= 8;
      this.audio.click();
      return;
    }
    if (p.stamina < 12) return;
    let dir = 'right';
    if (this.mouseDX < -8) dir = 'left';
    else if (Math.abs(this.mouseDX) < 3) {
      if (this.engine.input.keys.has('KeyW')) dir = 'over';
      else if (this.engine.input.keys.has('KeyS')) dir = 'thrust';
      else if (this.engine.input.keys.has('KeyA')) dir = 'left';
    }
    this.mouseDX = 0;
    p.attack = { phase: 'windup', t: 0, dir, hitDone: false };
    p.stamina -= 13;
    if (dir === 'over') this.audio.heavySwing(); else this.audio.sword();
  }

  // ============================================================
  // UPDATE
  // ============================================================
  update(dt) {
    if (!this.active) return;
    const rawDt = dt;
    if (this.paused) { this._render(); return; }
    if (this.phase === 'deploy') {
      this._updateCamera(dt);
      this._updateVisuals(dt);
      this.particles.update(dt);
      this._updateHud();
      this._render();
      return;
    }
    this.elapsed += dt;
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.12; }
    const p = this.player;
    if (this.phase === 'fighting') {
      this._updatePlayer(dt);
      this._updateAnchors(dt);
      this._updateWaves(dt);
      this.aiT += dt;
      while (this.aiT >= 0.08) { this.aiT -= 0.08; this._aiTick(0.08); }
      this._moveTroops(dt);
      this._updateArrows(dt);
      this._checkEnd(dt);
      this.rallyCd = Math.max(0, this.rallyCd - dt);
      this.volleyCd = Math.max(0, this.volleyCd - dt);
      this.powerCd = Math.max(0, this.powerCd - dt);
    } else {
      this._updateAnchors(dt);
      this._moveTroops(dt * 0.4);
      this.endTimer -= dt;
      if (this.endTimer <= 0) this._finish();
    }
    this.particles.update(dt);
    // Adaptive quality: a big battle on a weak GPU drops resolution and
    // updates soldier transforms at 30 Hz instead of stuttering at 20 FPS.
    this._perfT += rawDt;
    this._frameAvg += (Math.min(0.12, rawDt) - this._frameAvg) * 0.05;
    if (this._perfT > 1.0) {
      this._perfT = 0;
      const base = this._basePixelRatio || 1;
      let pr = base, stride = 1;
      if (this._frameAvg > 0.026) { pr = Math.max(0.65, base * 0.78); stride = 2; }
      else if (this._frameAvg > 0.019) { pr = Math.max(0.7, base * 0.9); stride = 2; }
      const cur = this.engine.renderer.getPixelRatio();
      if (Math.abs(cur - pr) > 0.02) this.engine.renderer.setPixelRatio(pr);
      this._visStride = stride;
    }
    this._visFrame = (this._visFrame + 1) % this._visStride;
    if (this._visFrame === 0) this._updateVisuals(dt);
    this._updateCamera(dt);
    this._updateHud();
    this._render();
  }

  _render() {
    this.engine.renderer.render(this.scene, this.camera);
  }

  _updatePlayer(dt) {
    const p = this.player;
    const keys = this.engine.input.keys;
    p.stamina = Math.min(p.maxStamina, p.stamina + dt * 24);
    p.comboT = Math.max(0, p.comboT - dt);
    if (p.comboT <= 0) p.combo = 0;
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.dodge = Math.max(0, p.dodge - dt);
    // regen
    p.regenT += dt;
    if (p.regenT > 5 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * 2.4);
    // movement
    let mx = 0, mz = 0;
    if (keys.has('KeyW')) mz += 1;
    if (keys.has('KeyS')) mz -= 1;
    if (keys.has('KeyA')) mx -= 1;
    if (keys.has('KeyD')) mx += 1;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    let dx = fx * mz + rx * mx, dz = fz * mz + rz * mx;
    const l = Math.hypot(dx, dz);
    if (l > 0) { dx /= l; dz /= l; }
    // The player is mounted. A horse gives a real speed advantage over
    // infantry and makes the bow a hit-and-run weapon, not a turret.
    let speed = p.mounted ? 8.4 : 6.4;
    if (p.blocking) speed = p.mounted ? 4.0 : 3.1;
    if (keys.has('ShiftLeft') && p.stamina > 5 && !p.blocking) {
      speed = p.mounted ? 13.5 : 10.2; p.stamina = Math.max(0, p.stamina - dt * 12);
    }
    if (p.attack.phase !== 'idle') speed *= p.weapon === 'bow' ? 0.55 : 0.35;
    if (p.dodge <= 0) {
      const acc = l > 0 ? 11 : 12;
      p.vel.x = lerp(p.vel.x, dx * speed, Math.min(1, dt * acc));
      p.vel.z = lerp(p.vel.z, dz * speed, Math.min(1, dt * acc));
    } else {
      p.vel.x = lerp(p.vel.x, 0, dt * 3.5);
      p.vel.z = lerp(p.vel.z, 0, dt * 3.5);
    }
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    p.pos.x = clamp(p.pos.x, -70, 70);
    p.pos.z = clamp(p.pos.z, -74, 70);
    // The gate and curtain wall are solid until the gate is broken. This is
    // also what makes the catapults matter: without them you cannot walk in.
    if (this.castle.visible && this.castleGate?.visible) {
      const gz = this.siege?.gatePos.z ?? (this.castle.position.z + 4.7);
      if (Math.abs(p.pos.x) < 8.5 && p.pos.z < gz + 1.4 && p.pos.z > gz - 1.4) p.pos.z = gz + 1.4;
      if (Math.abs(p.pos.x) > 8.5 && p.pos.z < -58.8 && p.pos.z > -66) p.pos.z = -58.8;
    }
    const gy = this.groundH(p.pos.x, p.pos.z);
    p.pos.y = lerp(p.pos.y || gy, gy, Math.min(1, dt * 12));
    p.walk += Math.hypot(p.vel.x, p.vel.z) * dt * 1.6;
    if (Math.hypot(p.vel.x, p.vel.z) > 0.5) this.audio._lastStep = this.audio._lastStep || 0;
    // attack state
    if (p.attack.phase !== 'idle') {
      p.attack.t += dt;
      const a = p.attack;
      if (a.phase === 'windup' && a.t > (a.dir === 'shoot' ? 0.27 : a.dir === 'over' ? 0.34 : 0.2)) {
        a.phase = 'active'; a.t = 0;
        if (a.dir === 'shoot') this._playerShoot();
        else this._playerHit(a.dir);
      } else if (a.phase === 'active' && a.t > 0.14) {
        a.phase = 'recover'; a.t = 0;
      } else if (a.phase === 'recover' && a.t > 0.28) {
        a.phase = 'idle'; a.t = 0;
      }
    }
    // block stamina drain on hit only; movement slow handled
    // interact with enemies (melee circle)
    this._enemyMelee(dt);
    // incoming indicator
    this.incoming = Math.max(0, this.incoming - dt * 2);
  }

  _playerHit(dir) {
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const heavy = dir === 'over';
    const range = heavy ? 4.0 : 3.5;
    const equip = EQUIP_TIERS[this.game.state.equipTier] || EQUIP_TIERS[0];
    let hits = 0;
    const targets = [];
    for (const t of this.troops) {
      if (t.team !== 'enemy' || !t.alive || t.routing) continue;
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      const arc = heavy ? 0.15 : 0.35;
      if (dot < arc) continue;
      targets.push({ t, d, dx, dz });
    }
    targets.sort((a, b) => a.d - b.d);
    const maxTargets = heavy ? 4 : 2;
    for (let i = 0; i < Math.min(maxTargets, targets.length); i++) {
      const { t, dx, dz, d } = targets[i];
      let dmg = (heavy ? 54 : 38) * (1 + equip.bonus * 0.55) * (1 + p.combo * 0.06);
      if (Math.random() < 0.16) dmg *= 1.6;
      dmg *= 1 - t.armor;
      t.hp -= dmg;
      t.hitFlash = 0.2;
      t.stagger = 0.35;
      const kb = heavy ? 4 : 2.6;
      t.pos.x += dx / (d || 1) * kb * 0.12;
      t.pos.z += dz / (d || 1) * kb * 0.12;
      hits++;
      this.particles.burst(new THREE.Vector3(t.pos.x, t.pos.y + 1.25, t.pos.z), 0xa8231c, 6, { speed: 2.2, up: 2.2, life: .6, size: .32, grav: 8 });
      this.particles.burst(new THREE.Vector3(t.pos.x, t.pos.y + 1.25, t.pos.z), 0xe6d6b6, 4, { speed: 2.6, up: 2.4, life: .35, size: .22, grav: 4 });
      if (t.hp <= 0) { this._killTroop(t, 'player'); this.playerKills++; p.killCount++; }
      else if (t.morale > 0) t.morale -= 6;
    }
    // A desperate sword blow can also splinter the gate, so a player who
    // lost every catapult is never locked out of the courtyard.
    if (this.siege && !this.siege.gateOpen) {
      const gp = this.siege.gatePos;
      const d = Math.hypot(gp.x - p.pos.x, gp.z - p.pos.z);
      if (d < 4.2) {
        const gfx = (gp.x - p.pos.x) / (d || 1), gfz = (gp.z - p.pos.z) / (d || 1);
        if (gfx * fx + gfz * fz > 0.15) {
          this._damageGate((heavy ? 34 : 22) * (1 + equip.bonus * 0.4));
          hits++;
        }
      }
    }
    if (hits > 0) {
      p.combo++;
      p.comboT = 4;
      this.audio.hit();
      this.shake = Math.max(this.shake, heavy ? 0.32 : 0.18);
      this.hitstop = heavy ? 0.05 : 0.025;
    }
  }

  _enemyMelee(dt) {
    const p = this.player;
    // Enemies close to player attack
    for (const t of this.troops) {
      if (t.team !== 'enemy' || !t.alive || t.routing) continue;
      const dx = p.pos.x - t.pos.x, dz = p.pos.z - t.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.8 && t.cd <= 0 && t.stagger <= 0) {
        if (t.attackWind === undefined || t.attackWind <= 0) {
          t.attackWind = 0.52;
        }
      }
      if (t.attackWind > 0) {
        t.attackWind -= dt;
        if (t.attackWind <= 0) {
          if (d < 3.3) this._damagePlayer(t);
          t.cd = 1.5 + Math.random() * 0.7;
          t.atkAnim = 0.3;
        }
      }
    }
    // find nearest winding enemy for telegraph
    let near = null, nd = 1e9;
    for (const t of this.troops) {
      if (t.team === 'enemy' && t.alive && !t.routing && t.attackWind > 0) {
        const d = (t.pos.x - p.pos.x) ** 2 + (t.pos.z - p.pos.z) ** 2;
        if (d < nd) { nd = d; near = t; }
      }
    }
    if (near && nd < 100) {
      this.ring.visible = true;
      this.ring.position.set(near.pos.x, near.pos.y + 0.12, near.pos.z);
      const sc = 1 + Math.sin(this.elapsed * 18) * 0.1;
      this.ring.scale.setScalar(sc);
      this.ring.material.opacity = 0.75;
    } else this.ring.visible = false;
    // arrows hitting player
    for (const ar of this.arrows) {
      if (ar.team === 'enemy' && ar.life > 0) {
        const d = Math.hypot(ar.pos.x - p.pos.x, ar.pos.z - p.pos.z);
        if (d < 1.0 && Math.abs(ar.pos.y - (p.pos.y + 1.2)) < 1.4) {
          this._damagePlayer({ dmg: ar.dmg, pos: ar.pos });
          ar.life = 0;
        }
      }
    }
  }

  _damagePlayer(source) {
    const p = this.player;
    if (p.invuln > 0 || this.phase !== 'fighting') return;
    let dmg = source.dmg * (0.8 + Math.random() * 0.4);
    if (p.blocking && p.stamina > 0) {
      const ang = Math.atan2(source.pos?.x !== undefined ? source.pos.x - p.pos.x : -Math.sin(p.yaw), source.pos?.z !== undefined ? source.pos.z - p.pos.z : -Math.cos(p.yaw));
      dmg *= 0.16;
      p.stamina = Math.max(0, p.stamina - 14);
      this.audio.block();
      this.particles.burst(new THREE.Vector3(p.pos.x - Math.sin(p.yaw) * 1.5, p.pos.y + 1.4, p.pos.z - Math.cos(p.yaw) * 1.5), 0xffe6a8, 8, { speed: 2.4, up: 1.6, life: .4, size: .22, grav: 4 });
      this.shake = Math.max(this.shake, 0.14);
    } else {
      this.audio.hit();
      this.ui.flashDamage();
      this.shake = Math.max(this.shake, 0.5);
      this.hitstop = 0.055;
      this.particles.burst(new THREE.Vector3(p.pos.x, p.pos.y + 1.3, p.pos.z), 0xb02a20, 10, { speed: 2.6, up: 2.2, life: .7, size: .3, grav: 8 });
    }
    dmg *= 1 - 0.22;
    p.hp -= dmg;
    p.hurtT = 0.4;
    p.regenT = 0;
    if (p.hp <= 0) { p.hp = 0; p.alive = false; this._endBattle(false); }
  }

  _updateAnchors(dt) {
    const p = this.player;
    if (this.order === 'advance') {
      this.allyAnchor.z = Math.max(-4, this.allyAnchor.z - dt * 1.15);
    } else if (this.order === 'follow') {
      this.allyAnchor.x = lerp(this.allyAnchor.x, p.pos.x, Math.min(1, dt * 2.5));
      this.allyAnchor.z = lerp(this.allyAnchor.z, p.pos.z, Math.min(1, dt * 2.5));
    } else if (this.order === 'hold') {
      // stay
    }
    // Once the field is clear and the gate is down, the host pours into the
    // courtyard to finish the garrison. Until then it holds outside the wall.
    const fieldLeft = this.troops.some(t => t.team === 'enemy' && t.alive && !t.garrison && !t.wall && !t.routing);
    if (!fieldLeft && this.siege?.gateOpen) {
      this.allyAnchor.z = Math.max(-63, this.allyAnchor.z - dt * 1.5);
    }
    // enemy advances
    if (this.phase === 'fighting') {
      const engaged = this.troops.some(t => t.team === 'ally' && t.alive && !t.routing &&
        Math.hypot(t.pos.x - this.enemyAnchor.x, t.pos.z - this.enemyAnchor.z) < 14);
      if (!engaged) this.enemyAnchor.z = Math.min(6, this.enemyAnchor.z + dt * 1.3);
    }
  }

  _aiTick(dt) {
    const alive = this.troops.filter(t => t.alive && !t.routing);
    const allies = alive.filter(t => t.team === 'ally');
    const enemies = alive.filter(t => t.team === 'enemy');
    const playerFoe = this.player.alive && this.player.hp > 0;
    // These averages used to be recomputed per soldier (an accidental O(n^2)
    // inside an already O(n^2) loop). One pass per tick is plenty.
    const allyAvg = this._teamMorale('ally');
    const enemyAvg = this._teamMorale('enemy');
    let enemyLeft = enemies.length;
    // target nearest - the player is a valid target too, so enemies keep
    // coming even when the last ally has fallen.
    for (const t of alive) {
      const foes = t.team === 'ally' ? enemies : (playerFoe ? allies.concat([this.player]) : allies);
      let best = null, bd = 1e9;
      // Sampling large opposing hosts halves the target-selection cost while
      // still finding a plausible opponent in a dense line. The nearest
      // handful of men are visually indistinguishable at this scale.
      const step = foes.length > 320 ? 2 : 1;
      for (let fi = 0; fi < foes.length; fi += step) {
        const o = foes[fi];
        const d = (o.pos.x - t.pos.x) ** 2 + (o.pos.z - t.pos.z) ** 2;
        if (d < bd) { bd = d; best = o; }
      }
      t.target = best;
      t.targetDist = Math.sqrt(bd);
    }
    // Morale used to compare every soldier against every other soldier on
    // every AI tick. With a thousand men that was millions of checks a second
    // for no visible benefit. A soldier only cares about the enemy in front of
    // him and the spirit of his own line.
    for (const t of alive) {
      let drain = 0;
      if (t.hp < t.maxHp * 0.25) drain += 1.2;
      if (t.target && t.targetDist < 10) drain += 0.7;
      const teamAvg = t.team === 'ally' ? allyAvg : enemyAvg;
      if (teamAvg < 35) drain += 1.5;
      // Rival soldiers are stubborn: they only break when the battle is
      // already lost, with a handful of survivors left to flee.
      if (t.team === 'enemy') drain *= 0.22;
      if (drain) t.morale = Math.max(0, t.morale - drain * dt);
      if (t.morale <= 0 && !t.routing) {
        // Your own soldiers never break. They hold the line to the last
        // breath, so a lost battle means dead men rather than runaways.
        if (t.team === 'ally') {
          t.morale = 0;
        } else if (enemyLeft > 3) {
          t.morale = 12;
        } else {
          enemyLeft--;
          this._rout(t);
        }
      }
    }
  }

  _moveTroops(dt) {
    const p = this.player;
    // Build a coarse neighbourhood grid once per frame. Checking only the
    // soldier's cell and its eight neighbours is far cheaper than comparing
    // every soldier with every other soldier.
    const head = this._sepHead;
    const next = this._sepNext;
    const troops = this.troops;
    head.fill(-1);
    for (let i = 0; i < troops.length; i++) {
      const o = troops[i];
      if (!o.alive || o.routing || i >= next.length) continue;
      let cx = ((o.pos.x + SEP_OFFSET) / SEP_CELL) | 0;
      let cz = ((o.pos.z + SEP_OFFSET) / SEP_CELL) | 0;
      cx = cx < 0 ? 0 : (cx >= SEP_GRID ? SEP_GRID - 1 : cx);
      cz = cz < 0 ? 0 : (cz >= SEP_GRID ? SEP_GRID - 1 : cz);
      const cell = cz * SEP_GRID + cx;
      next[i] = head[cell];
      head[cell] = i;
    }
    for (const t of troops) {
      if (!t.alive) continue;
      t.cd = Math.max(0, t.cd - dt);
      t.stagger = Math.max(0, t.stagger - dt);
      t.hitFlash = Math.max(0, t.hitFlash - dt);
      t.atkAnim = Math.max(0, t.atkAnim - dt);
      if (t.routing) {
        const dir = t.team === 'ally' ? 1 : -1;
        t.pos.z += dir * dt * 6.5;
        t.pos.x += Math.sin(t.id * 10 + this.elapsed) * dt * 1.2;
        if (Math.abs(t.pos.z) > 95) { t.alive = false; }
        continue;
      }
      // Men on the parapet do not leave their wall. They keep shooting until
      // the wall is stormed, which makes the archer duel part of the siege.
      if (t.wall) {
        const wt = t.target;
        if (wt && wt.alive) {
          t.yaw = Math.atan2(wt.pos.x - t.pos.x, wt.pos.z - t.pos.z);
          if (t.targetDist < t.range && t.cd <= 0) {
            t.cd = (t.reload || 2.3) + Math.random() * 0.6;
            this._shootArrow(t);
            t.atkAnim = 0.4;
          }
        }
        t.pos.set(t.slotX, t.home.y, t.slotZ);
        t.speedNow = 0;
        continue;
      }
      let gx = 0, gz = 0;
      const target = t.target;
      const inCombat = target && target.alive && !target.routing && t.targetDist < 26;
      if (t.ranged) {
        const gateClosed = this.castle.visible && this.siege && !this.siege.gateOpen;
        const gateAim = t.siege && t.team === 'ally' && gateClosed;
        if (gateAim) {
          const gp = this.siege.gatePos;
          const dg = Math.hypot(gp.x - t.pos.x, gp.z - t.pos.z);
          t.yaw = Math.atan2(gp.x - t.pos.x, gp.z - t.pos.z);
          if (dg > t.range * 0.92) {
            gx = gp.x; gz = gp.z + 18;
          } else {
            gx = t.pos.x; gz = t.pos.z;
            if (t.cd <= 0) {
              t.cd = (t.reload || 7) + Math.random() * 0.7;
              this._shootBoulder(t);
              t.atkAnim = 0.5;
            }
          }
        } else if (target) {
          if (t.targetDist < 9 && !t.siege) {
            gx = t.pos.x + (t.pos.x - target.pos.x) * 0.6;
            gz = t.pos.z + (t.pos.z - target.pos.z) * 0.6;
          } else if (t.targetDist > t.range) {
            gx = target.pos.x; gz = target.pos.z;
          } else { gx = t.pos.x; gz = t.pos.z; }
          t.yaw = Math.atan2(target.pos.x - t.pos.x, target.pos.z - t.pos.z);
          if (t.targetDist < t.range && t.cd <= 0) {
            t.cd = (t.reload || 2.3) + Math.random() * 0.5;
            if (t.siege) this._shootBoulder(t); else this._shootArrow(t);
            t.atkAnim = t.siege ? 0.5 : 0.4;
          }
        }
        // formation pull when far from anchor
        if (!gateAim && this.order !== 'charge' && this.order !== 'follow') {
          const ax = this.allyAnchor.x + t.slotX, az = this.allyAnchor.z + (t.slotZ - 30);
          const da = Math.hypot(t.pos.x - ax, t.pos.z - az);
          if (da > 7 && t.team === 'ally') { gx = ax; gz = az; t.yaw = Math.atan2(gz - t.pos.z, gx - t.pos.x); }
        }
      } else {
        if (target && (inCombat || this.order === 'charge' || this.order === 'follow')) {
          if (t.targetDist > t.range + 0.2) { gx = target.pos.x; gz = target.pos.z; }
          else {
            gx = t.pos.x; gz = t.pos.z;
            t.yaw = Math.atan2(target.pos.x - t.pos.x, target.pos.z - t.pos.z);
            if (t.cd <= 0 && t.stagger <= 0) {
              t.cd = 1.25 + Math.random() * 0.5;
              t.atkAnim = 0.3;
              if (target === p) {
                this._damagePlayer({ dmg: t.dmg * (0.7 + Math.random() * 0.5), pos: t.pos });
              } else {
                this._troopAttack(t, target);
              }
            }
          }
        } else {
          if (t.team === 'ally') {
            const ax = this.allyAnchor.x + t.slotX;
            const az = this.allyAnchor.z + (t.slotZ - 30);
            if (this.order === 'charge') {
              if (target) { gx = target.pos.x; gz = target.pos.z; }
            } else { gx = ax; gz = az; }
          } else if (t.garrison && target) {
            // The courtyard garrison makes for the gate and the nearest
            // breach in the line. The shut gate still stops it dead.
            gx = target.pos.x; gz = target.pos.z;
          } else {
            gx = this.enemyAnchor.x + t.slotX;
            gz = this.enemyAnchor.z + (t.slotZ + 30);
          }
        }
      }
      // separation (only against nearby buckets)
      let sx = 0, sz = 0;
      let tcx = ((t.pos.x + SEP_OFFSET) / SEP_CELL) | 0;
      let tcz = ((t.pos.z + SEP_OFFSET) / SEP_CELL) | 0;
      tcx = tcx < 0 ? 0 : (tcx >= SEP_GRID ? SEP_GRID - 1 : tcx);
      tcz = tcz < 0 ? 0 : (tcz >= SEP_GRID ? SEP_GRID - 1 : tcz);
      const x0 = Math.max(0, tcx - 1), x1 = Math.min(SEP_GRID - 1, tcx + 1);
      const z0 = Math.max(0, tcz - 1), z1 = Math.min(SEP_GRID - 1, tcz + 1);
      for (let gz = z0; gz <= z1; gz++) {
        const row = gz * SEP_GRID;
        for (let gx = x0; gx <= x1; gx++) {
          for (let oi = head[row + gx]; oi !== -1; oi = next[oi]) {
            const o = troops[oi];
            if (o === t || !o.alive || o.routing) continue;
            const ddx = t.pos.x - o.pos.x, ddz = t.pos.z - o.pos.z;
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < 1.44 && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              sx += ddx / d * (1.2 - d) * 3;
              sz += ddz / d * (1.2 - d) * 3;
            }
          }
        }
      }
      // Keep the push finite: a crowded melee can otherwise fling a soldier
      // across the field for a frame.
      const sepLen = Math.hypot(sx, sz);
      if (sepLen > 3) { sx = sx / sepLen * 3; sz = sz / sepLen * 3; }
      const dx = gx - t.pos.x, dz = gz - t.pos.z;
      const dist = Math.hypot(dx, dz);
      // Separation still applies at the formation slot. Dropping it when the
      // soldier reached his goal made the back ranks stack and jitter.
      let vx = sx, vz = sz;
      if (dist > 0.4) {
        let sp = t.speed * (this.order === 'charge' && t.team === 'ally' ? 1.3 : 1);
        if (this.order === 'shield' && t.team === 'ally') sp *= 0.58;
        vx += dx / dist * sp;
        vz += dz / dist * sp;
        if (!t.ranged) t.yaw = lerpAngle(t.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
      } else if (Math.hypot(vx, vz) > 0.12 && !t.ranged) {
        t.yaw = lerpAngle(t.yaw, Math.atan2(vx, vz), Math.min(1, dt * 5));
      }
      t.vel.x = lerp(t.vel.x, vx, Math.min(1, dt * 6));
      t.vel.z = lerp(t.vel.z, vz, Math.min(1, dt * 6));
      t.pos.x += t.vel.x * dt;
      t.pos.z += t.vel.z * dt;
      t.speedNow = Math.hypot(t.vel.x, t.vel.z);
      t.walk += t.speedNow * dt * 4;
      t.pos.x = clamp(t.pos.x, -82, 82);
      t.pos.z = clamp(t.pos.z, -82, 82);
      // Solid curtain wall and shut gate. Field troops cannot walk through
      // stone; the garrison cannot walk out until the gate is broken.
      if (this.castle.visible && this.siege && !this.siege.gateOpen) {
        const gz = this.siege.gatePos.z;
        if (Math.abs(t.pos.x) < 8.3 && t.pos.z < gz + 1.3 && t.pos.z > gz - 1.3) {
          t.pos.z = t.pos.z >= gz ? gz + 1.3 : gz - 1.3;
        }
        if (Math.abs(t.pos.x) > 8.3 && t.pos.z < -58.7 && t.pos.z > -66.2) {
          t.pos.z = t.pos.z >= -62 ? -58.7 : -66.2;
        }
      }
      const gy = this.groundH(t.pos.x, t.pos.z);
      t.pos.y = lerp(t.pos.y, gy, Math.min(1, dt * 12));
    }
  }

  _troopAttack(t, target) {
    if (!target || !target.alive) return;
    let dmg = t.dmg * (0.75 + Math.random() * 0.5);
    const armor = Math.max(0, (target.armor || 0) - (t.armorPierce || 0));
    dmg *= 1 - armor;
    // Spearmen brace against horsemen; cavalry hit hardest at full gallop.
    if (t.antiCavalry && (target.type === 'cavalry' || target.type === 'knight')) dmg *= 1 + t.antiCavalry;
    if (t.charge && t.speedNow > 3.8) dmg *= 1 + Math.min(0.45, t.charge * 0.18);
    // Flanking: a blow into the back of a formation hurts more.
    if (target.team !== 'player' && target.team !== t.team) {
      const fx = Math.sin(target.yaw), fz = Math.cos(target.yaw);
      const dx = t.pos.x - target.pos.x, dz = t.pos.z - target.pos.z;
      if (fx * dx + fz * dz < -0.5) dmg *= 1.2;
    }
    if (target.team === 'ally') {
      if (this.order === 'shield') dmg *= 0.66;
      else if (this.order === 'hold') dmg *= 0.86;
    }
    target.hp -= dmg;
    target.hitFlash = 0.18;
    target.stagger = 0.18;
    target.morale = Math.max(0, target.morale - 1.5);
    // Axemen cleave into the rank behind their target.
    if (t.cleave) {
      for (const o of this.troops) {
        if (o === target || !o.alive || o.team === t.team) continue;
        const d2 = (o.pos.x - target.pos.x) ** 2 + (o.pos.z - target.pos.z) ** 2;
        if (d2 < 5.5) {
          o.hp -= dmg * t.cleave * 0.5;
          o.hitFlash = 0.12;
          if (o.hp <= 0) this._killTroop(o, t);
        }
      }
    }
    if (Math.random() < 0.16) {
      this.particles.burst(new THREE.Vector3(target.pos.x, target.pos.y + 1.15, target.pos.z), 0x8f2018, 3, { speed: 1.4, up: 1.8, life: .45, size: .25, grav: 8 });
    }
    if (target.hp <= 0) this._killTroop(target, t);
    if (Math.random() < 0.03) this.audio.hit();
  }

  _killTroop(t, killer) {
    if (!t.alive) return;
    t.alive = false;
    t.routing = false;
    // corpse
    if (this.corpses.length < MAX_CORPSES) {
      this.corpses.push({ x: t.pos.x, y: t.pos.y, z: t.pos.z, yaw: t.yaw + (Math.random() - .5) * 2, s: 1 });
    }
    // morale shock
    for (const o of this.troops) {
      if (!o.alive || o.team !== t.team) continue;
      const d2 = (o.pos.x - t.pos.x) ** 2 + (o.pos.z - t.pos.z) ** 2;
      if (d2 < 180) o.morale = Math.max(0, o.morale - 4.5);
    }
    this.particles.burst(new THREE.Vector3(t.pos.x, t.pos.y + 0.9, t.pos.z), 0x7e1d16, 8, { speed: 2, up: 1.4, life: .8, size: .35, grav: 9 });
    if (killer === 'player') {
      this.ui.battleFeed(`You slew a ${t.type}`, false);
    } else if (t.team === 'ally') {
      this.enemyKills++;
      const label = t.type[0].toUpperCase() + t.type.slice(1);
      this.friendlyLosses[t.type] = (this.friendlyLosses[t.type] || 0) + 1;
      this.ui.battleFeed(`${label} slain`, true);
      this.audio.death();
    } else {
      this.troopKills++;
      if (Math.random() < 0.5) this.ui.battleFeed(`Enemy ${t.type} slain`, false);
    }
    if (t.team === 'ally' && this.player) this.shake = Math.max(this.shake, 0.08);
  }

  _rout(t) {
    if (t.routing || !t.alive) return;
    if (t.team === 'ally') return; // player troops never run
    const left = this.troops.filter(o => o.team === 'enemy' && o.alive && !o.routing).length;
    if (left > 3) { t.morale = Math.max(10, t.morale); return; }
    t.routing = true;
    t.target = null;
    t.morale = 0;
    if (t.team === 'enemy') {
      if (Math.random() < 0.3) this.ui.battleFeed(`${t.type} breaks and flees`, false);
    } else {
      this.ui.battleFeed(`Your ${t.type} routs!`, true);
    }
  }

  _shootArrow(t) {
    if (this.arrows.length >= MAX_ARROWS) return;
    const target = t.target;
    if (!target || !target.alive) return;
    const start = new THREE.Vector3(t.pos.x, t.pos.y + 1.5, t.pos.z);
    // Lead a moving target a little; arrows that always land at the spot the
    // enemy occupied when the bow was drawn looked artificial.
    const rough = Math.max(0.3, start.distanceTo(target.pos) / 34);
    const end = new THREE.Vector3(
      target.pos.x + (target.vel?.x || 0) * rough * 0.45,
      target.pos.y + 1.1,
      target.pos.z + (target.vel?.z || 0) * rough * 0.45
    );
    const time = Math.max(0.25, start.distanceTo(end) / 34);
    const vel = new THREE.Vector3((end.x - start.x) / time, (end.y - start.y) / time + 0.5 * 9.8 * time, (end.z - start.z) / time);
    this.arrows.push({ pos: start, vel, target, team: t.team, dmg: t.dmg, pierce: t.armorPierce || 0, life: time + 0.65 });
    this.audio.arrow();
    t.atkAnim = 0.4;
  }

  _shootBoulder(t) {
    if (this.arrows.length >= MAX_ARROWS) return;
    const gateAim = t.team === 'ally' && this.castle.visible && this.siege && !this.siege.gateOpen;
    const start = new THREE.Vector3(t.pos.x, t.pos.y + 2.0, t.pos.z);
    let end, target = null;
    if (gateAim) {
      end = new THREE.Vector3(this.siege.gatePos.x, this.siege.gatePos.y + 0.4, this.siege.gatePos.z);
    } else {
      target = t.target;
      if (!target || !target.alive) return;
      end = new THREE.Vector3(target.pos.x, target.pos.y + 0.6, target.pos.z);
    }
    const dist = start.distanceTo(end);
    const time = Math.max(0.55, dist / 30);
    const vel = new THREE.Vector3(
      (end.x - start.x) / time,
      (end.y - start.y) / time + 0.5 * 9.8 * time,
      (end.z - start.z) / time
    );
    this.arrows.push({
      pos: start, vel, target, team: t.team,
      dmg: t.dmg * 5.4, pierce: 0.35, life: time + 1.2,
      boulder: true, gate: gateAim, splash: t.splash || 4.5,
      hitSet: new Set(),
    });
    this.audio.heavySwing();
    t.atkAnim = 0.5;
  }

  _damageGate(amount) {
    if (!this.siege || this.siege.gateOpen) return;
    this.siege.gateHp = Math.max(0, this.siege.gateHp - amount);
    const gp = this.siege.gatePos;
    this.particles.burst(new THREE.Vector3(gp.x, gp.y + 1.5, gp.z), 0x8c7356, 22,
      { speed: 4, up: 4, life: 1.1, size: .55, grav: 8 });
    this.shake = Math.max(this.shake, 0.55);
    this.audio.hit();
    if (this.siege.gateHp <= 0) this._openGate();
    else {
      this.ui.battleFeed(`The gate buckles — ${Math.ceil(this.siege.gateHp / this.siege.gateMax * 100)}% standing`, false);
    }
  }

  _openGate() {
    if (!this.siege || this.siege.gateOpen) return;
    this.siege.gateOpen = true;
    this.siege.gateHp = 0;
    if (this.castleGate) this.castleGate.visible = false;
    const gp = this.siege.gatePos;
    this.particles.burst(new THREE.Vector3(gp.x, gp.y + 2, gp.z), 0xb99a72, 55,
      { speed: 6, up: 6, life: 1.6, size: .75, grav: 8 });
    this.shake = Math.max(this.shake, 0.9);
    this.hitstop = 0.08;
    this.audio.shieldBreak();
    this.audio.horn();
    this.ui.battleBanner('THE GATE IS BROKEN', 'Storm the courtyard — leave no defender alive');
    setTimeout(() => { if (this.active) this.ui.hideBattleBanner(); }, 2600);
    this.ui.battleFeed('The gate shatters. Your host can enter the castle.', false);
    this._updateHud(true);
  }

  _boulderImpact(a, at) {
    const pos = at || a.pos;
    const splash = a.splash || 4.5;
    // Siege stones break timber, not just men.
    if (a.team === 'ally' && this.siege && !this.siege.gateOpen) {
      const gp = this.siege.gatePos;
      if (Math.hypot(pos.x - gp.x, pos.z - gp.z) < splash + 2.2) this._damageGate(a.dmg);
    }
    for (const t of this.troops) {
      if (!t.alive || t.routing || t.team === a.team) continue;
      const d = Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z);
      if (d > splash) continue;
      const falloff = 1 - (d / splash) * 0.55;
      t.hp -= a.dmg * falloff * (1 - Math.max(0, t.armor - (a.pierce || 0)));
      t.hitFlash = 0.25;
      t.stagger = Math.max(t.stagger || 0, 0.7);
      t.morale = Math.max(0, t.morale - 12);
      if (t.hp <= 0) this._killTroop(t, a.team === 'ally' ? 'catapult' : 'enemy');
    }
    const p = this.player;
    if (a.team === 'enemy' && p.alive && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < splash) {
      this._damagePlayer({ dmg: a.dmg * 0.55, pos });
    }
    this.particles.burst(new THREE.Vector3(pos.x, Math.max(pos.y, 0.4), pos.z), 0x9b8a70, 26,
      { speed: 5, up: 3.5, life: 1.0, size: .5, grav: 9 });
    this.shake = Math.max(this.shake, 0.45);
    this.audio.hit();
  }

  _arrowHit(a, target) {
    const power = !!a.power;
    const byPlayer = power || !!a.playerShot;
    let dmg = a.dmg * (power ? 1 : 0.8 + Math.random() * 0.4);
    dmg *= 1 - Math.max(0, (target.armor || 0) - (a.pierce || 0));
    target.hp -= dmg;
    target.hitFlash = 0.2;
    target.stagger = Math.max(target.stagger || 0, power ? 0.55 : 0.18);
    target.morale = Math.max(0, target.morale - (power ? 9 : 2));
    if (power) {
      const l = Math.hypot(a.vel.x, a.vel.z) || 1;
      target.pos.x += a.vel.x / l * 0.7;
      target.pos.z += a.vel.z / l * 0.7;
    }
    const p = target.pos;
    this.particles.burst(new THREE.Vector3(p.x, p.y + 1.1, p.z), power ? 0xffc95e : 0x8f2018, power ? 14 : 3,
      { speed: power ? 3.4 : 1.4, up: 2.2, life: power ? .7 : .4, size: power ? .42 : .2, grav: 8 });
    if (target.hp <= 0) {
      this._killTroop(target, byPlayer ? 'player' : 'arrow');
      if (byPlayer) {
        this.playerKills++;
        this.player.killCount++;
        this.player.combo++;
        this.player.comboT = 4;
      }
    }
    if (power) {
      this.hitstop = Math.max(this.hitstop, 0.035);
      this.shake = Math.max(this.shake, 0.22);
    }
  }

  _updateArrows(dt) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      a.vel.y -= 9.8 * dt;
      a.pos.addScaledVector(a.vel, dt);
      let remove = a.life <= 0;
      // Fast arrows can cross a whole body between frames. Widen the hit
      // radius by half the distance travelled this frame to stop tunnelling.
      const sweep = Math.hypot(a.vel.x, a.vel.z) * dt * 0.5;

      if (a.boulder) {
        let hit = false;
        if (a.gate && this.siege && !this.siege.gateOpen) {
          const gp = this.siege.gatePos;
          if (Math.hypot(a.pos.x - gp.x, a.pos.z - gp.z) < 5.5 + sweep &&
              Math.abs(a.pos.y - gp.y) < 14) hit = true;
        }
        if (!hit && a.target && a.target.alive) {
          const t = a.target;
          const dx = a.pos.x - t.pos.x, dz = a.pos.z - t.pos.z;
          const dy = a.pos.y - (t.pos.y + 0.9);
          const r = 2.4 + sweep;
          if (dx * dx + dz * dz < r * r && Math.abs(dy) < 2.6 + sweep) hit = true;
        }
        if (!hit && a.pos.y <= this.groundH(a.pos.x, a.pos.z) + 0.5) hit = true;
        if (hit) {
          this._boulderImpact(a);
          remove = true;
        }
        if (remove) this.arrows.splice(i, 1);
        continue;
      }

      if (a.power && a.team === 'ally') {
        // A power arrow is a projectile, not a homing spell. It can punch
        // through several enemies, then fall spent to the ground.
        for (const t of this.troops) {
          if (t.team !== 'enemy' || !t.alive || t.routing || a.hitSet.has(t)) continue;
          const dx = a.pos.x - t.pos.x, dz = a.pos.z - t.pos.z;
          const dy = a.pos.y - (t.pos.y + 1.05);
          const r = 1.8 + sweep;
          if (dx * dx + dz * dz < r * r && Math.abs(dy) < 2.2 + sweep) {
            a.hitSet.add(t);
            this._arrowHit(a, t);
            if (a.hitSet.size >= 4) { remove = true; break; }
          }
        }
        if (!remove) {
          a.trailT = (a.trailT || 0) - dt;
          if (a.trailT <= 0) {
            a.trailT = 0.045;
            this.particles.burst(a.pos, 0xffd27a, 1, { speed: .5, up: .2, life: .35, size: .28, grav: 0 });
          }
          if (a.pos.y < this.groundH(a.pos.x, a.pos.z) - 0.2) remove = true;
        }
      } else if (a.target && a.target.alive) {
        const t = a.target;
        const dx = a.pos.x - t.pos.x, dz = a.pos.z - t.pos.z;
        const dy = a.pos.y - (t.pos.y + 1.05);
        const hitR = (a.power ? 2.0 : 1.25) + sweep;
        if (dx * dx + dz * dz < hitR * hitR && Math.abs(dy) < 1.8 + sweep) {
          if (t === this.player) {
            this._damagePlayer({ dmg: a.dmg * (0.8 + Math.random() * 0.4), pos: a.pos });
          } else {
            this._arrowHit(a, t);
          }
          remove = true;
        }
      }

      if (remove) this.arrows.splice(i, 1);
    }
  }

  _updateVisuals(dt) {
    // player transforms
    const p = this.player;
    const pm = this.playerMesh;
    pm.position.copy(p.pos);
    pm.rotation.y = p.yaw + Math.PI;
    const ud = pm.userData;
    const moving = Math.hypot(p.vel.x, p.vel.z);
    if (ud.legL) {
      // The rider's legs are mostly hidden by the horse; the horse's legs do
      // the visible gallop work.
      if (ud.legL) ud.legL.visible = false;
      if (ud.legR) ud.legR.visible = false;
      const gallop = moving > 0.5 ? Math.sin(p.walk * 3.4) : 0;
      if (ud.horseLegs) {
        for (let i = 0; i < ud.horseLegs.length; i++) {
          ud.horseLegs[i].rotation.x = gallop * (i % 2 ? -0.7 : 0.7);
        }
      }
      const armSwing = moving > 0.4 ? Math.sin(p.walk * 2.2) * 0.25 : 0;
      if (p.weapon === 'bow') {
        ud.armL.rotation.x = -1.15;
        ud.armL.rotation.z = 0.14;
        if (p.attack.phase === 'idle') ud.armR.rotation.x = -0.25;
      } else {
        ud.armL.rotation.x = p.blocking ? -1.15 : -armSwing;
        ud.armL.rotation.z = p.blocking ? 0.2 : 0;
        if (p.attack.phase === 'idle') {
          ud.armR.rotation.x = armSwing;
          ud.armR.rotation.z = 0;
          ud.armR.rotation.y = 0;
        }
      }
      if (ud.sword) ud.sword.visible = p.weapon === 'sword';
      if (ud.shield) ud.shield.visible = p.weapon === 'sword';
      if (ud.bow) ud.bow.visible = p.weapon === 'bow';
      // attack anim
      if (p.attack.phase !== 'idle') {
        const a = p.attack;
        let t = 0;
        if (a.phase === 'windup') t = a.t / 0.24;
        else if (a.phase === 'active') t = 1;
        else t = Math.max(0, 1 - a.t / 0.3);
        if (a.dir === 'shoot') {
          ud.armL.rotation.x = -1.5;
          ud.armL.rotation.z = 0.12;
          ud.armR.rotation.x = -1.15 - 0.15 * Math.sin(t * Math.PI);
          ud.armR.rotation.z = -0.2;
        } else if (a.dir === 'over') {
          ud.armR.rotation.x = -2.0 * Math.min(1, t) + 1.8 * Math.max(0, t - 0.6);
          ud.armR.rotation.z = 0;
        } else if (a.dir === 'left') {
          ud.armR.rotation.x = -1.2 * t;
          ud.armR.rotation.z = 2.0 * t;
        } else if (a.dir === 'thrust') {
          ud.armR.rotation.x = -1.45 * t;
          ud.armR.rotation.z = 0.1;
        } else {
          ud.armR.rotation.x = -1.2 * t;
          ud.armR.rotation.z = -1.8 * t;
        }
      }
      const bob = moving > 1 ? Math.abs(Math.sin(p.walk * 3.4)) * 0.075 : Math.sin(this.elapsed * 2) * 0.012;
      pm.position.y = p.pos.y + bob;
      ud.torso.rotation.x = p.attack.phase === 'active' ? 0.12 : 0;
      if (ud.shield) {
        if (p.blocking) ud.shield.rotation.y = 0.5;
        else ud.shield.rotation.y = 0.1;
      }
      // hit flash
      if (p.hurtT > 0) pm.position.x += (Math.random() - .5) * 0.04;
    }
    // troops rendering
    const d = this._dummy || (this._dummy = new THREE.Object3D());
    const col = this._col || (this._col = new THREE.Color());
    for (const team of ['ally', 'enemy']) {
      const set = this.meshSets[team];
      let colorDirty = false;
      for (const t of this.troops) {
        if (t.team !== team || t.renderSlot == null || t.renderSlot < 0) continue;
        const n = t.renderSlot;
        if (!t.alive) {
          // Stable slots leave a hole when a soldier dies. Collapse that
          // instance once instead of re-packing every surviving unit (which
          // would upload the whole colour buffer every frame).
          if (!t._renderGone) {
            d.position.set(0, -40, 0);
            d.rotation.set(0, 0, 0);
            d.scale.setScalar(0.0001);
            d.updateMatrix();
            set.body.setMatrixAt(n, d.matrix);
            set.head.setMatrixAt(n, d.matrix);
            set.helmet.setMatrixAt(n, d.matrix);
            set.shield.setMatrixAt(n, d.matrix);
            set.weapon.setMatrixAt(n, d.matrix);
            t._renderGone = true;
          }
          continue;
        }
        const bob = Math.abs(Math.sin(t.walk * 2)) * 0.045 * Math.min(1, t.speedNow / 4);
        const y = t.pos.y + bob;
        const squash = t.hitFlash > 0 ? 0.9 : 1;
        const sc = t.scale || 1;
        d.position.set(t.pos.x, y, t.pos.z);
        d.rotation.set(t.hitFlash > 0 ? 0.08 : 0, t.yaw, 0);
        d.scale.set(sc, squash * sc, sc);
        d.updateMatrix();
        set.body.setMatrixAt(n, d.matrix);
        set.head.setMatrixAt(n, d.matrix);
        set.helmet.setMatrixAt(n, d.matrix);
        // shield
        const rx = Math.cos(t.yaw), rz = -Math.sin(t.yaw);
        d.position.set(t.pos.x - rx * 0.48 * sc, y + 1.15 * sc, t.pos.z - rz * 0.48 * sc);
        d.rotation.set(0, t.yaw, 0);
        d.scale.set(sc, sc, sc);
        d.updateMatrix();
        set.shield.setMatrixAt(n, d.matrix);
        // weapon
        const swing = t.atkAnim > 0 ? Math.sin((1 - t.atkAnim / 0.3) * Math.PI) * 1.7 : 0;
        d.position.set(t.pos.x + rx * 0.45 * sc, y + 1.02 * sc, t.pos.z + rz * 0.45 * sc);
        d.rotation.set(-swing, t.yaw, 0, 'YXZ');
        d.updateMatrix();
        set.weapon.setMatrixAt(n, d.matrix);
        // Colour is fixed for a soldier's lifetime, so upload it only on the
        // frame the slot is first used. Recolouring every frame was the main
        // GPU stall in large battles.
        if (!t._colSet) {
          const chex = TEAM_COLORS[team][t.type] || TEAM_COLORS[team].militia;
          col.setHex(chex);
          set.body.setColorAt(n, col);
          col.setHex(team === 'ally' ? 0x3c5568 : 0x6b3129);
          set.shield.setColorAt(n, col);
          t._colSet = true;
          colorDirty = true;
        }
      }
      const used = Math.min(MAX_UNITS, this._renderSlots[team] || 0);
      for (const m of Object.values(set)) {
        m.count = used;
        m.instanceMatrix.needsUpdate = true;
        if (colorDirty && m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      // Elephants and catapults are rendered from their own instanced sets.
      for (const kind of ['elephant', 'catapult']) {
        const mesh = this.specialMeshes?.[team]?.[kind];
        if (!mesh) continue;
        let maxSlot = 0;
        for (const t of this.troops) {
          if (t.team !== team || t.special !== kind || t.specialSlot < 0) continue;
          const n = t.specialSlot;
          if (n >= MAX_UNITS) continue;
          maxSlot = Math.max(maxSlot, n + 1);
          if (!t.alive) {
            if (!t._specialGone) {
              d.position.set(0, -40, 0);
              d.rotation.set(0, 0, 0);
              d.scale.setScalar(0.0001);
              d.updateMatrix();
              mesh.setMatrixAt(n, d.matrix);
              t._specialGone = true;
            }
            continue;
          }
          const bob = kind === 'elephant' ? Math.abs(Math.sin(t.walk * 2)) * 0.08 : 0;
          d.position.set(t.pos.x, t.pos.y + bob, t.pos.z);
          d.rotation.set(0, t.yaw, 0);
          d.scale.setScalar(1);
          d.updateMatrix();
          mesh.setMatrixAt(n, d.matrix);
        }
        mesh.count = Math.min(MAX_UNITS, Math.max(maxSlot, this._specialSlots?.[team]?.[kind] || 0));
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    // corpses
    let cn = 0;
    for (const c of this.corpses) {
      d.position.set(c.x, c.y + 0.12, c.z);
      d.rotation.set(Math.PI / 2, c.yaw, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      this.corpseMesh.setMatrixAt(cn++, d.matrix);
      if (cn >= MAX_CORPSES) break;
    }
    this.corpseMesh.count = cn;
    this.corpseMesh.instanceMatrix.needsUpdate = true;
    // arrows
    let an = 0;
    const up = this._up || (this._up = new THREE.Vector3(0, 1, 0));
    const dir = this._dirV || (this._dirV = new THREE.Vector3());
    const q = this._q || (this._q = new THREE.Quaternion());
    let bn = 0;
    for (const a of this.arrows) {
      if (a.boulder) {
        if (bn < MAX_BOULDERS) {
          d.position.copy(a.pos);
          d.rotation.set(this.elapsed * 2.1, this.elapsed * 1.7, 0);
          d.scale.setScalar(1);
          d.updateMatrix();
          this.boulderMesh.setMatrixAt(bn++, d.matrix);
        }
        continue;
      }
      if (an >= MAX_ARROWS) continue;
      dir.copy(a.vel).normalize();
      q.setFromUnitVectors(up, dir);
      d.position.copy(a.pos);
      d.quaternion.copy(q);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.arrowMesh.setMatrixAt(an++, d.matrix);
    }
    this.arrowMesh.count = an;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
    this.boulderMesh.count = bn;
    this.boulderMesh.instanceMatrix.needsUpdate = true;
  }

  _updateCamera(dt, instant = false) {
    const p = this.player;
    const targetY = p.pos.y + (p.mounted ? 2.35 : 1.7);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    // One continuous zoom. The old tactical flag snapped the camera to a
    // fixed 27 units and ignored the wheel, which is why pulling back felt
    // stuck once the tactical view engaged.
    const dist = this.camDist;
    const pitch = this.tactical ? Math.max(p.pitch, 0.72) : p.pitch;
    const cp = Math.cos(pitch);
    const desired = new THREE.Vector3(
      p.pos.x + Math.sin(p.yaw) * cp * dist,
      p.pos.y + 2.4 + Math.sin(pitch) * dist,
      p.pos.z + Math.cos(p.yaw) * cp * dist
    );
    const ground = this.groundH(desired.x, desired.z) + 0.8;
    if (desired.y < ground) desired.y = ground;
    if (instant) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, Math.min(1, dt * (this.tactical ? 4 : 9)));
    const ahead = this.tactical ? 15 : 4;
    const look = new THREE.Vector3(p.pos.x + fx * ahead, targetY + (this.tactical ? 0 : 0.3), p.pos.z + fz * ahead);
    this.camera.lookAt(look);
    if (this.shake > 0) {
      const s = this.shake;
      this.camera.position.x += (Math.random() - .5) * s * 0.8;
      this.camera.position.y += (Math.random() - .5) * s * 0.8;
      this.camera.position.z += (Math.random() - .5) * s * 0.8;
      this.camera.lookAt(look);
      this.shake = Math.max(0, this.shake - dt * 2.4);
    }
    this.camera.fov = p.blocking ? 56 : (this.tactical ? 68 : 60);
    this.camera.updateProjectionMatrix();
  }

  _teamMorale(team) {
    let sum = 0, n = 0;
    for (const t of this.troops) {
      if (t.team === team && t.alive && !t.routing) { sum += t.morale; n++; }
    }
    return n ? sum / n : 0;
  }

  _counts() {
    let ally = 0, enemy = 0;
    for (const t of this.troops) {
      if (!t.alive || t.routing) continue;
      if (t.team === 'ally') ally++; else enemy++;
    }
    return { ally, enemy };
  }

  _updateWaves(dt) {
    if (!this.waveQueue.length) return;
    this.waveTimer = Math.max(0, this.waveTimer - dt);
    const alive = this.troops.filter(t => t.team === 'enemy' && t.alive && !t.routing).length;
    const threshold = Math.max(4, Math.ceil(this.waveInitial * 0.35));
    if (alive <= threshold && (this.waveTimer <= 0 || alive === 0)) {
      const next = this.waveQueue.shift();
      if (next && next.length) {
        this.waveIndex++;
        this.waveInitial = next.length;
        this._spawnEnemyWave(next, true);
        this.waveTimer = 9;
      }
    }
  }

  _checkEnd(dt) {
    const { ally, enemy } = this._counts();
    if (this.player.hp <= 0) {
      this._endBattle(false);
    } else if (enemy === 0 && this.waveQueue.length === 0) {
      this._endBattle(true);
    }
    // mass rout check - rivals only break when a handful are left
    const enemyLeft = this.troops.filter(t => t.team === 'enemy' && t.alive && !t.routing).length;
    if (this.waveQueue.length === 0 && enemyLeft > 0 && enemyLeft <= 3 && this._teamMorale('enemy') < 6 && Math.random() < dt * 0.5) {
      for (const t of this.troops) if (t.team === 'enemy' && t.alive) this._rout(t);
    }
  }

  _endBattle(victory) {
    if (this.phase !== 'fighting') return;
    this.phase = victory ? 'victory' : 'defeat';
    this.endTimer = victory ? 3.4 : 3.6;
    this.ui.setBattleOrder('');
    this.ring.visible = false;
    this.engine.canvas.style.cursor = '';
    if (document.pointerLockElement) document.exitPointerLock();
    if (victory) {
      this.audio.victory();
      this.ui.battleBanner('VICTORY', 'The field is yours');
      // make remaining enemies rout
      for (const t of this.troops) if (t.team === 'enemy' && t.alive) this._rout(t);
      this.result = {
        victory: true,
        regionId: this.config.regionId,
        defense: !!this.config.defense,
        losses: { ...this.friendlyLosses },
        enemyLosses: this.troops.filter(t => t.team === 'enemy' && !t.alive).length,
        playerKills: this.playerKills,
        troopKills: this.troopKills,
        loot: this.config.loot || 0,
        influence: this.config.influence || 0,
        title: this.config.title,
      };
    } else {
      this.audio.defeat();
      this.ui.battleBanner('DEFEAT', 'The day is lost — but not the war');
      this.result = {
        victory: false,
        regionId: this.config.regionId,
        defense: !!this.config.defense,
        losses: { ...this.friendlyLosses },
        playerKills: this.playerKills,
        troopKills: this.troopKills,
        loot: 0, influence: 0,
        title: this.config.title,
      };
    }
    this.ui.setBattlePaused(false);
  }

  _finish() {
    this.active = false;
    this.audio.setBattle(false);
    if (document.pointerLockElement) document.exitPointerLock();
    if (this._basePixelRatio) {
      this.engine.renderer.setPixelRatio(this._basePixelRatio);
      this.engine.resize();
    }
    this.ui.setBattle(false);
    const r = this.result;
    this.phase = 'idle';
    this.game.finishBattle(r);
  }

  _updateHud(force = false) {
    this._hudT += 0.016;
    if (!force && this._hudT < 0.08) return;
    this._hudT = 0;
    const { ally, enemy } = this._counts();
    const p = this.player;
    this.ui.updateBattleHud({
      ally, enemy,
      allyMorale: this._teamMorale('ally'),
      enemyMorale: this._teamMorale('enemy'),
      hp: p.hp, maxHp: p.maxHp, stamina: p.stamina,
      combo: p.combo, rallyCd: this.rallyCd, powerCd: this.powerCd,
      order: this.order,
      volleyCd: this.volleyCd,
      wave: this.waveTotal > 1 ? { index: this.waveIndex, total: this.waveTotal } : null,
      objective: this.phase === 'fighting'
        ? this._objectiveText()
        : this.phase === 'deploy' ? 'Choose a formation, then march'
        : (this.phase === 'victory' ? 'Victory' : 'Defeat'),
      incoming: this.incoming,
    });
  }

  _objectiveText() {
    const wave = this.waveTotal > 1 ? `Wave ${this.waveIndex}/${this.waveTotal} — ` : '';
    if (this.siege && !this.siege.gateOpen) {
      const pct = Math.ceil(this.siege.gateHp / this.siege.gateMax * 100);
      const fieldLeft = this.troops.some(t => t.team === 'enemy' && t.alive && !t.garrison && !t.wall && !t.routing);
      return fieldLeft
        ? `${wave}Break the field host — gate ${pct}%`
        : `${wave}Gate ${pct}% — catapults, bring it down`;
    }
    if (this.siege?.gateOpen) {
      const inside = this.troops.some(t => t.team === 'enemy' && t.alive && t.garrison);
      if (inside) return 'Storm the courtyard — kill every defender';
    }
    if (this.order === 'shield') return wave + 'Shieldwall — hold fast and bleed them';
    if (this.order === 'hold') return wave + 'Hold the line and break their charge';
    return wave + 'Break the enemy host';
  }

  // Called by the battle HUD. Survivors are never executed for retreating;
  // only the soldiers who actually fell are removed from the host.
  retreat(surrender = false) {
    if (this.phase !== 'fighting') return;
    const result = {
      victory: false,
      retreat: true,
      surrender: !!surrender,
      regionId: this.config.regionId || null,
      defense: !!this.config.defense,
      losses: { ...this.friendlyLosses },
      playerKills: this.playerKills || 0,
      troopKills: this.troopKills || 0,
      loot: 0,
      influence: 0,
      title: this.config.title,
    };
    this.phase = 'retreat';
    this.active = false;
    this.audio.setBattle(false);
    if (document.pointerLockElement) document.exitPointerLock();
    if (this._basePixelRatio) {
      this.engine.renderer.setPixelRatio(this._basePixelRatio);
      this.engine.resize();
    }
    this.ui.setBattle(false);
    this.ui.setBattlePaused(false);
    this.engine.canvas.style.cursor = '';
    this.game.retreatBattle(result);
    this.phase = 'idle';
  }
}
