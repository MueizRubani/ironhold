import * as THREE from '../assets/lib/three.module.js?v=160';

// ============================================================
// Input — keyboard, mouse, pointer state
// ============================================================
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, downX: 0, downY: 0, ndc: new THREE.Vector2(), down: false, button: -1, moved: 0, overCanvas: false };
    this.wheel = 0;
    this.onKey = null;
    this.onCanvasClick = null;
    this.onPointerLockChange = null;
    this._downPos = { x: 0, y: 0 };
    this._dragging = false;
    this.enabled = true;
    window.addEventListener('keydown', e => this._key(e, true));
    window.addEventListener('keyup', e => this._key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointerdown', e => this._down(e));
    window.addEventListener('pointermove', e => this._move(e));
    window.addEventListener('pointerup', e => this._up(e));
    canvas.addEventListener('pointerenter', () => { this.pointer.overCanvas = true; });
    canvas.addEventListener('pointerleave', () => { this.pointer.overCanvas = false; });
    canvas.addEventListener('wheel', e => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (this.onPointerLockChange) this.onPointerLockChange(document.pointerLockElement === canvas);
    });
  }
  _key(e, down) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (down) {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (this.onKey && !e.repeat) this.onKey(e.code, e);
    } else this.keys.delete(e.code);
  }
  _down(e) {
    this.pointer.down = true; this.pointer.button = e.button;
    this.pointer.downX = e.clientX; this.pointer.downY = e.clientY;
    this._downPos.x = e.clientX; this._downPos.y = e.clientY;
    this.pointer.moved = 0;
    this._move(e);
    this.canvas.focus();
  }
  _move(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = e.clientX; this.pointer.y = e.clientY;
    this.pointer.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (this.pointer.down) this.pointer.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
  }
  _up(e) {
    if (!this.pointer.down) return;
    const wasDrag = this.pointer.moved > 6;
    const btn = this.pointer.button;
    this.pointer.down = false;
    if (!wasDrag && btn === 0 && this.onCanvasClick) this.onCanvasClick(e);
  }
  key(code) { return this.keys.has(code); }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
  requestLock() { if (this.canvas.requestPointerLock) this.canvas.requestPointerLock(); }
}

// ============================================================
// Overview camera controller (classic strategy free camera)
// ============================================================
export class OverviewCamera {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.target = new THREE.Vector3(0, 0, 4);
    this.desired = new THREE.Vector3(0, 0, 4);
    this.yaw = Math.PI * 0.22;
    this.pitch = 0.88;
    this.dist = 58;
    this.desiredDist = 58;
    this.bounds = 148;
    this.rotating = false;
    this.panning = false;
    this.lastX = 0; this.lastY = 0;
    this.follow = null;
    this.shake = 0;
    this._shakeT = 0;
    this.enabled = true;
    this.minDist = 14; this.maxDist = 250;
    this._tmp = new THREE.Vector3();
    this._wasDown = false;
  }
  update(dt) {
    if (!this.enabled) return;
    const k = this.input.keys;
    const i = this.input.pointer;
    // on the first frame of a drag, measure from where the button went down,
    // so movement before the first tick is not swallowed
    if (i.down && !this._wasDown) { this.lastX = i.downX; this.lastY = i.downY; }
    this._wasDown = i.down;
    const panSpeed = this.dist * 0.62 * dt;
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (k.has('KeyQ')) this.yaw -= dt * 1.5;
    if (k.has('KeyE')) this.yaw += dt * 1.5;
    // edge scrolling (only while pointer over canvas)
    if (i.overCanvas && !i.down && i.x > 0) {
      const edge = 8;
      if (i.x < edge) fx -= 1;
      if (i.x > window.innerWidth - edge) fx += 1;
      if (i.y < edge) fz -= 1;
      if (i.y > window.innerHeight - edge) fz += 1;
    }
    if (fx || fz) {
      const len = Math.hypot(fx, fz) || 1;
      const s = panSpeed / len;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      this.desired.x += (sy * fz + cy * fx) * s;
      this.desired.z += (cy * fz - sy * fx) * s;
    }
    // middle-drag pan
    if (i.down && i.button === 1) {
      const dx = (i.x - this.lastX) / window.innerWidth, dy = (i.y - this.lastY) / window.innerHeight;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const f = this.dist * 1.4;
      this.desired.x += (-sy * dy + cy * dx) * -f;
      this.desired.z += (-cy * dy - sy * dx) * -f;
    }
    // left-drag grabs and pans the war table (click still selects)
    if (i.down && i.button === 0) {
      const dx = (i.x - this.lastX) / window.innerWidth;
      const dy = (i.y - this.lastY) / window.innerHeight;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const f = this.dist * 1.4;
      this.desired.x -= (cy * dx + sy * dy) * f;
      this.desired.z += (sy * dx - cy * dy) * f;
    }
    // right-drag orbits the camera
    if (i.down && i.button === 2) {
      const dx = (i.x - this.lastX), dy = (i.y - this.lastY);
      this.yaw -= dx * 0.005;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, 0.30, 1.35);
    }
    this.lastX = i.x; this.lastY = i.y;
    const wheel = this.input.consumeWheel();
    if (wheel) this.desiredDist = THREE.MathUtils.clamp(this.desiredDist + wheel * 0.12, this.minDist, this.maxDist);
    this.desired.x = THREE.MathUtils.clamp(this.desired.x, -this.bounds, this.bounds);
    this.desired.z = THREE.MathUtils.clamp(this.desired.z, -this.bounds, this.bounds);
    const t = 1 - Math.pow(0.001, dt);
    this.target.lerp(this.desired, Math.min(1, t * 1.6));
    this.dist += (this.desiredDist - this.dist) * Math.min(1, dt * 8);
    this.yaw = this.yaw % (Math.PI * 2);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const px = this.target.x + Math.sin(this.yaw) * cp * this.dist;
    const pz = this.target.z + Math.cos(this.yaw) * cp * this.dist;
    const py = this.target.y + sp * this.dist;
    // shake
    this._shakeT += dt;
    const sh = this.shake > 0 ? this.shake * (0.6 + 0.4 * Math.sin(this._shakeT * 55)) : 0;
    this.camera.position.set(px + (Math.random() - .5) * sh, py + (Math.random() - .5) * sh, pz + (Math.random() - .5) * sh);
    this.camera.lookAt(this.target.x, this.target.y + 1, this.target.z);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.follow) {
      const f = this.follow();
      if (f) { this.desired.x = f.x; this.desired.z = f.z; }
    }
  }
  moveTo(x, z, instant = false) {
    this.desired.set(x, 0, z);
    if (instant) { this.target.set(x, 0, z); }
  }
  toggleValleyView() {
    const zoomOut = this.desiredDist < 170;
    if (zoomOut) {
      this.desired.set(-2, 0, -8);
      this.desiredDist = 225;
      this.pitch = Math.min(this.pitch, 1.06);
    } else {
      this.desired.set(0, 0, 4);
      this.desiredDist = 58;
      this.pitch = 0.88;
    }
    return zoomOut;
  }
  addShake(v) { this.shake = Math.max(this.shake, v); }
}

// ============================================================
// Particles — GPU points with per-particle size/alpha
// ============================================================
export class Particles {
  constructor(scene, max = 500) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float psize;
        attribute float palpha;
        attribute vec3 color;
        varying float vAlpha;
        varying vec3 vColor;
        void main(){
          vColor = color; vAlpha = palpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * (340.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main(){
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.05, d) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this._c = new THREE.Color();
  }
  burst(p, color, count = 8, opt = {}) {
    const speed = opt.speed ?? 2.4, up = opt.up ?? 2.4, life = opt.life ?? 0.8,
      size = opt.size ?? 0.5, grav = opt.grav ?? 7, spread = opt.spread ?? 1;
    this._c.set(color);
    for (let i = 0; i < count; i++) {
      const j = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.pos[j * 3] = p.x + (Math.random() - .5) * 0.4 * spread;
      this.pos[j * 3 + 1] = p.y + (Math.random() - .2) * 0.3;
      this.pos[j * 3 + 2] = p.z + (Math.random() - .5) * 0.4 * spread;
      const a = Math.random() * Math.PI * 2, r = Math.random() * speed;
      this.vel[j * 3] = Math.cos(a) * r * spread;
      this.vel[j * 3 + 1] = up * (0.4 + Math.random() * 0.8);
      this.vel[j * 3 + 2] = Math.sin(a) * r * spread;
      const v = 0.85 + Math.random() * 0.3;
      this.col[j * 3] = this._c.r * v; this.col[j * 3 + 1] = this._c.g * v; this.col[j * 3 + 2] = this._c.b * v;
      this.size[j] = size * (0.6 + Math.random() * 0.8);
      this.alpha[j] = 1;
      this.maxLife[j] = life * (0.6 + Math.random() * 0.7);
      this.life[j] = this.maxLife[j];
      this.grav[j] = grav;
      this.drag[j] = opt.drag ?? 1.5;
    }
  }
  update(dt) {
    let any = false;
    for (let j = 0; j < this.max; j++) {
      if (this.life[j] <= 0) continue;
      any = true;
      this.life[j] -= dt;
      const k = 3;
      this.vel[j * k] -= this.vel[j * k] * this.drag[j] * dt;
      this.vel[j * k + 1] -= this.grav[j] * dt;
      this.vel[j * k + 2] -= this.vel[j * k + 2] * this.drag[j] * dt;
      this.pos[j * k] += this.vel[j * k] * dt;
      this.pos[j * k + 1] += this.vel[j * k + 1] * dt;
      this.pos[j * k + 2] += this.vel[j * k + 2] * dt;
      const t = Math.max(0, this.life[j] / this.maxLife[j]);
      this.alpha[j] = t * t;
      if (this.life[j] <= 0) this.alpha[j] = 0;
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.geo.attributes.psize.needsUpdate = true;
      this.geo.attributes.palpha.needsUpdate = true;
    }
  }
  reset() {
    this.life.fill(0); this.alpha.fill(0);
    this.geo.attributes.palpha.needsUpdate = true;
  }
}

// ============================================================
// Sky dome
// ============================================================
export class Sky {
  constructor(scene) {
    this.uniforms = {
      topColor: { value: new THREE.Color(0x6f9fc4) },
      botColor: { value: new THREE.Color(0xd8d0ae) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(0xffd9a0) },
      sunPower: { value: 0.6 },
      night: { value: 0 },
    };
    const geo = new THREE.SphereGeometry(520, 24, 14);
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `
        varying vec3 vWorld;
        void main(){
          vWorld = (modelMatrix * vec4(position,1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 botColor;
        uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunPower; uniform float night;
        varying vec3 vWorld;
        void main(){
          vec3 dir = normalize(vWorld);
          float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(botColor, topColor, pow(h, 0.75));
          float sd = max(dot(dir, normalize(sunDir)), 0.0);
          col += sunColor * pow(sd, 160.0) * 1.6;
          col += sunColor * pow(sd, 10.0) * 0.22 * sunPower;
          // horizon haze
          col = mix(col, botColor, (1.0 - smoothstep(0.0, 0.25, h)) * 0.3);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    scene.add(this.mesh);

    // stars
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.4 + 0.1;
      const r = 460;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.8, transparent: true, opacity: 0, depthWrite: false, fog: false, sizeAttenuation: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);
  }
  set(top, bottom, sunDir, sunColor, night) {
    this.uniforms.topColor.value.set(top);
    this.uniforms.botColor.value.set(bottom);
    this.uniforms.sunDir.value.copy(sunDir);
    if (sunColor !== undefined) this.uniforms.sunColor.value.set(sunColor);
    this.uniforms.night.value = night;
    this.stars.material.opacity = Math.max(0, (night - 0.35)) * 1.2;
    this.uniforms.sunPower.value = night > 0.5 ? 0.25 : 0.8;
  }
}

// ============================================================
// Engine
// ============================================================
export class Engine {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.audio = audio;
    this.quality = 'medium';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x9fb0a5);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xa8b39a, 150, 340);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 900);
    this.input = new Input(canvas);
    this.cameraCtl = new OverviewCamera(this.camera, this.input);
    this.particles = new Particles(this.scene, 520);
    this.sky = new Sky(this.scene);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 600;
    this._mouse = new THREE.Vector2();
    this.ambient = new THREE.HemisphereLight(0xbcd4e6, 0x5a5440, 1.15);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffe2b3, 2.1);
    this.sun.position.set(60, 90, 30);
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -70; this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70; this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.sunTarget = new THREE.Object3D(); this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.fps = 60; this._frames = 0; this._fpsT = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setQuality('medium');
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    if (q === 'low') {
      // 0.72 viewport scale keeps Intel HD-class GPUs above 60fps
      this.renderer.setPixelRatio(Math.min(1, dpr) * 0.72);
      this.renderer.shadowMap.enabled = false;
      this.scene.fog.near = 80; this.scene.fog.far = 380;
    } else if (q === 'high') {
      this.renderer.setPixelRatio(Math.min(1.6, dpr));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.needsUpdate = true;
      this.scene.fog.near = 160; this.scene.fog.far = 620;
    } else {
      this.renderer.setPixelRatio(Math.min(1.1, dpr));
      this.renderer.shadowMap.enabled = false;
      this.scene.fog.near = 130; this.scene.fog.far = 520;
    }
    if (this.quality === 'high') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
    } else {
      this.sun.castShadow = false;
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setRayFromPointer() {
    this._mouse.copy(this.input.pointer.ndc);
    this.raycaster.setFromCamera(this._mouse, this.camera);
  }

  raycast(objects, recursive = true) {
    this.setRayFromPointer();
    return this.raycaster.intersectObjects(objects, recursive);
  }

  groundPoint(y = 0) {
    this.setRayFromPointer();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  project(v3) {
    const p = v3.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, visible: p.z < 1 };
  }

  render(scene = this.scene, camera = this.camera) {
    this.renderer.render(scene, camera);
  }

  stats(dt) {
    this._frames++; this._fpsT += dt;
    if (this._fpsT > 0.5) { this.fps = this._frames / this._fpsT; this._frames = 0; this._fpsT = 0; }
  }

  focusSettlement(x = 0, z = 4) {
    this.cameraCtl.moveTo(x, z, true);
    this.cameraCtl.dist = this.cameraCtl.desiredDist = 52;
  }
}

// helpers
export function srgb(hex) { return new THREE.Color(hex); }
export function lerpColor(a, b, t, out) { out.copy(a).lerp(b, t); return out; }
