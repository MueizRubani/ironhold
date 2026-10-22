// ============================================================
// IRONHOLD — procedural audio (no external assets)
// ============================================================
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.enabled = true;
    this.musicOn = true;
    this.battle = false;
    this._noise = null;
    this._musicTimer = null;
    this._step = 0;
    this._last = {};
  }

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.7 : 0;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.62;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.16 : 0;
      this.musicBus.connect(this.master);

      // noise buffer for impacts / ambience
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;

      this._startAmbience();
      this._startMusic();
    } catch (e) {
      console.warn('Audio unavailable', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.7 : 0, this.ctx.currentTime, 0.05);
  }
  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.2);
  }
  setBattle(on) {
    this.battle = on;
  }

  _guard(name, ms) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (this._last[name] && now - this._last[name] < ms / 1000) return false;
    this._last[name] = now;
    return true;
  }

  tone(freq, dur, type = 'sine', vol = 0.1, slide = 0, filterFreq = 0, attack = 0.005) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    let node = o;
    if (filterFreq) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      o.connect(f); node = f;
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.15, freq = 900, type = 'lowpass', q = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }

  // ---------------- SFX ----------------
  click()      { if (this._guard('click', 40)) this.tone(520, .045, 'triangle', .035); }
  hover()      { if (this._guard('hover', 60)) this.tone(760, .03, 'sine', .012); }
  error()      { if (this._guard('error', 120)) { this.tone(170, .16, 'sawtooth', .05, -40, 600); } }
  coin()       {
    if (!this._guard('coin', 55)) return;
    const base = 900 + Math.random() * 300;
    this.tone(base, .18, 'triangle', .06);
    setTimeout(() => this.tone(base * 1.5, .22, 'sine', .035), 38);
  }
  coins(n = 3) {
    if (!this._guard('coins', 140)) return;
    for (let i = 0; i < n; i++) setTimeout(() => this.coin(), i * 55 + Math.random() * 30);
  }
  chop()       { if (this._guard('chop', 90)) { this.noise(.09, .16, 1300, 'bandpass', 2); this.tone(120, .1, 'sine', .07, -40); } }
  place()      {
    this.noise(.25, .22, 420, 'lowpass');
    this.tone(95, .35, 'sine', .16, -25);
    setTimeout(() => this.tone(190, .18, 'triangle', .04), 30);
  }
  upgrade() {
    [392, 494, 587, 784].forEach((f, i) => setTimeout(() => this.tone(f, .5, 'triangle', .045), i * 80));
    this.noise(.4, .1, 900);
  }
  levelup() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, .65, 'sine', .05), i * 110));
    this.noise(.5, .06, 2400, 'highpass');
  }
  pop()        { this.tone(430, .09, 'sine', .05, 130); }
  horn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [110, 146.8, 220].forEach((f, i) => {
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); const fl = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f;
      fl.type = 'lowpass'; fl.frequency.value = 700;
      g.gain.setValueAtTime(0, t + i * 0.04);
      g.gain.linearRampToValueAtTime(.05, t + .12 + i * .04);
      g.gain.setValueAtTime(.05, t + .55);
      g.gain.exponentialRampToValueAtTime(.0001, t + 1.25);
      o.connect(fl); fl.connect(g); g.connect(this.sfxBus);
      o.start(t); o.stop(t + 1.3);
    });
  }
  sword()      { if (this._guard('sword', 55)) { this.noise(.13, .14, 3200, 'bandpass', 1.4); this.tone(940, .1, 'triangle', .025, -500); } }
  heavySwing() { if (this._guard('swing', 90)) this.noise(.22, .16, 1500, 'bandpass', 1); }
  hit()        { if (this._guard('hit', 45)) { this.noise(.09, .22, 260, 'lowpass'); this.tone(80, .1, 'square', .06, -30, 500); } }
  block()      { if (this._guard('block', 80)) { this.tone(1350, .14, 'square', .04, -500, 5000); this.noise(.08, .12, 2200, 'highpass'); } }
  shieldBreak(){ this.noise(.25, .2, 800, 'bandpass'); this.tone(150, .3, 'sawtooth', .07, -60); }
  death()      { if (this._guard('death', 120)) this.tone(150, .5, 'sawtooth', .045, -90, 500); }
  arrow()      { if (this._guard('arrow', 60)) this.noise(.1, .04, 3000, 'highpass'); }
  victory() {
    [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => {
      this.tone(f, .9, 'triangle', .06);
      this.tone(f / 2, .9, 'sine', .04);
    }, i * 130));
    setTimeout(() => this.horn(), 200);
  }
  defeat() {
    [330, 294, 247, 196].forEach((f, i) => setTimeout(() => this.tone(f, .9, 'sine', .05), i * 220));
  }
  notification() { this.tone(700, .12, 'sine', .04); setTimeout(() => this.tone(1050, .18, 'sine', .035), 90); }
  buildMenu()    { if (this._guard('menu', 80)) this.tone(320, .08, 'triangle', .03, 40); }
  battleCry()    { this.noise(.6, .1, 500, 'bandpass', .6); this.tone(120, .5, 'sawtooth', .03, 40, 500); }

  // ---------------- ambience & music ----------------
  _startAmbience() {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = .4;
    const g = this.ctx.createGain(); g.gain.value = .012;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = .07;
    const lg = this.ctx.createGain(); lg.gain.value = .006;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(); lfo.start();
  }

  _startMusic() {
    if (this._musicTimer) return;
    const scale = [146.8, 174.6, 196.0, 220.0, 261.6, 293.7, 349.2, 392.0];
    this._musicTimer = setInterval(() => {
      if (!this.ctx || !this.musicOn || !this.enabled) return;
      const t = this.ctx.currentTime;
      const step = this._step++;
      // drone every 8 steps
      if (step % 8 === 0) {
        const root = this.battle ? 110 : [146.8, 174.6, 130.8, 164.8][Math.floor(step / 8) % 4];
        [1, 1.5, 2].forEach((m, i) => {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
          o.type = i === 0 ? 'triangle' : 'sine'; o.frequency.value = root * m;
          f.type = 'lowpass'; f.frequency.value = 500;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(this.battle ? .05 : .035, t + 1.2);
          g.gain.setValueAtTime(this.battle ? .05 : .035, t + 3.4);
          g.gain.exponentialRampToValueAtTime(.0001, t + 5.4);
          o.connect(f); f.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 5.5);
        });
      }
      if (this.battle && step % 2 === 0) {
        // war drum
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(42, t + .18);
        g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.0001, t + .3);
        o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + .35);
      }
      // sparse plucks
      if (Math.random() < (this.battle ? .2 : .5)) {
        const f = scale[Math.floor(Math.random() * scale.length)] * (this.battle ? 2 : 1);
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), fl = this.ctx.createBiquadFilter();
        o.type = 'triangle'; o.frequency.value = f;
        fl.type = 'lowpass'; fl.frequency.value = 1800;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.035, t + .01);
        g.gain.exponentialRampToValueAtTime(.0001, t + 1.8);
        o.connect(fl); fl.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 1.9);
      }
    }, 700);
  }
}
