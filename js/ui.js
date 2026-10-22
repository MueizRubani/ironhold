import { BUILDINGS, BUILD_CATS, RESOURCES, TRADE_RES, KEEP_LEVELS, UNITS, EQUIP_TIERS, REGIONS, TUTORIAL, AMBITIONS, SEASONS } from './config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => {
  n = Math.floor(n || 0);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString('en-US');
};
const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function costHTML(cost, check = true) {
  if (!cost) return '';
  return Object.entries(cost).map(([k, v]) => {
    const icon = k === 'gold' ? 'i-gold' : RESOURCES[k]?.icon || 'i-goods';
    const missing = check && !(window.game?.economy?.canAfford({ [k]: v }));
    return `<span class="cost-chip ${missing ? 'missing' : ''}"><svg><use href="#${icon}"/></svg>${fmt(v)}</span>`;
  }).join('');
}

export class UI {
  constructor(game) {
    this.game = game;
    this.engine = game.engine;
    this.audio = game.audio;
    this.buildCat = 'gather';
    this.modalType = null;
    this.selectedBuilding = null;
    this._last = {};
    this._floatCount = 0;
    this._toastCount = 0;
    this._battleFeedT = [];
    this._menuMode = true;
    this._mapHits = [];
    this._cacheDom();
    this._bind();
  }

  _cacheDom() {
    this.hud = $('hud');
    this.menu = $('menu-screen');
    this.loading = $('loading-screen');
    this.modalRoot = $('modal-root');
    // reparent modal so it can appear over the main menu
    $('app').appendChild(this.modalRoot);
    this.modal = $('modal');
    this.modalTitle = $('modal-title');
    this.modalSub = $('modal-sub');
    this.modalBody = $('modal-body');
    this.modalFoot = $('modal-foot');
    this.sel = $('selection-card');
    this.buildPanel = $('build-panel');
    this.buildGrid = $('build-grid');
    this.buildTabs = $('build-tabs');
    this.eventModal = $('event-modal');
    this.battleHud = $('battle-hud');
    this.toasts = $('toasts');
    this.floats = $('floating-layer');
    this.tooltip = $('tooltip');
    this.hintEl = $('hint-text');
    this.mm = $('minimap');
    this.mmCtx = this.mm.getContext('2d');
    this.realmCanvas = null;
  }

  _bind() {
    document.querySelectorAll('.rail-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.game.mode === 'battle') return;
        this.audio.click();
        const p = btn.dataset.panel;
        if (p === 'build') this.toggleBuild();
        else if (p === 'market') this.openMarket();
        else if (p === 'army') this.openArmy();
        else if (p === 'realm') this.openRealm();
        else if (p === 'objectives') this.openChronicle();
        else if (p === 'settings') this.openSettings();
      });
    });
    document.querySelectorAll('.panel-close,[data-close="build"]').forEach(b => {
      b.addEventListener('click', () => this.closeBuild());
    });
    $('objective-list').addEventListener('click', () => this.openChronicle());
    $('objectives-card').addEventListener('click', () => this.openChronicle());

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.game.mode === 'battle') return;
        const s = +btn.dataset.speed;
        this.game.setSpeed(s);
        this.audio.click();
      });
    });

    const saveBtn = $('btn-save');
    if (saveBtn) saveBtn.addEventListener('click', () => { this.audio.click(); this.game.saveGame(true); });
    const mailBtn = $('btn-mail');
    if (mailBtn) mailBtn.addEventListener('click', () => this.openMail());
    const valleyBtn = $('btn-valley');
    if (valleyBtn) valleyBtn.addEventListener('click', () => {
      const out = this.game.engine.cameraCtl.toggleValleyView();
      this.game.ui.hint(out ? 'Whole valley view - scroll in to return' : 'Returned to the settlement');
      this.audio.click();
    });
    const upAll = $('btn-upgrade-all');
    if (upAll) upAll.addEventListener('click', () => { this.audio.click(); this.game.upgradeAllAffordable(); });
    const upHouses = $('btn-upgrade-houses');
    if (upHouses) upHouses.addEventListener('click', () => { this.audio.click(); this.game.upgradeAllHouses(); });

    const imp = document.createElement('input');
    imp.type = 'file';
    imp.accept = 'application/json,.json';
    imp.style.display = 'none';
    imp.addEventListener('change', () => {
      const f = imp.files && imp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => this.game.importSave(String(r.result || ''));
      r.onerror = () => this.toast('Could not read that file.', 'bad');
      r.readAsText(f);
      imp.value = '';
    });
    document.body.appendChild(imp);
    this._importInput = imp;

    this.sel.addEventListener('click', (e) => {
      const close = e.target.closest('.sel-close');
      if (close) { this.game.clearSelection(); return; }
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      const b = this.selectedBuilding;
      if (!b) return;
      this.audio.click();
      if (a === 'worker+') this.game.settlement.assign(b.id, 1);
      else if (a === 'worker-') this.game.settlement.assign(b.id, -1);
      else if (a === 'upgrade') this.game.upgradeBuilding(b);
      else if (a === 'demolish') this.game.demolishBuilding(b);
      else if (a === 'invite') this.game.inviteSettlers();
      else if (a === 'invite-grand') this.game.inviteSettlers('grand');
      else if (a === 'feast') this.game.holdFeast();
      else if (a === 'march') this.game.march(b.regionId);
      else if (a === 'focus') this.game.focusRegion(b.regionId);
    });

    this.buildTabs.addEventListener('click', (e) => {
      const t = e.target.closest('.b-tab');
      if (!t) return;
      this.buildCat = t.dataset.cat;
      this.renderBuild();
      this.audio.click();
    });
    this.buildGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.build-card');
      if (!card) return;
      this._startBuild(card.dataset.type);
    });

    // modal handlers
    $('modal-close').addEventListener('click', () => this.closeModal());
    this.modalRoot.querySelector('.modal-back').addEventListener('click', () => this.closeModal());
    this.modalBody.addEventListener('click', (e) => this._modalAction(e));
    this.modalFoot.addEventListener('click', (e) => this._modalAction(e));
    this.modalBody.addEventListener('input', (e) => {
      const inp = e.target.closest('.trade-qty');
      if (!inp) return;
      this._marketQty = this._marketQty || {};
      this._marketQty[inp.dataset.good] = this._clampQty(inp.value);
    });

    // minimap
    let mmDrag = false;
    const mmMove = (e) => {
      const r = this.mm.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      this.game.world.cameraCtl.moveTo((x - 0.5) * 300, (y - 0.5) * 300);
    };
    this.mm.addEventListener('pointerdown', (e) => { mmDrag = true; mmMove(e); this.audio.click(); });
    window.addEventListener('pointermove', (e) => { if (mmDrag) mmMove(e); });
    window.addEventListener('pointerup', () => { mmDrag = false; });

    // menu
    $('btn-continue').addEventListener('click', () => this.game.continueGame());
    $('btn-new').addEventListener('click', () => this.game.newGameRequest());
    $('btn-menu-settings').addEventListener('click', () => this.openSettings(true));
    $('btn-menu-help').addEventListener('click', () => this.openHelp(true));

    // battle
    document.querySelectorAll('.order-btn[data-order]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.game.battle?.active) this.game.battle._setOrder(btn.dataset.order);
      });
    });
    $('battle-rally').addEventListener('click', () => this.game.battle?.rally());
    $('battle-powershot').addEventListener('click', () => this.game.battle?._powerShot());
    $('battle-resume').addEventListener('click', () => this.game.battle?.setPaused(false));
    $('battle-retreat-quick').addEventListener('click', () => {
      if (this.game.battle?.active) this.game.battle.setPaused(true);
    });
    $('battle-retreat').addEventListener('click', () => this.game.battle?.retreat(false));
    $('battle-surrender').addEventListener('click', () => this.game.battle?.retreat(true));

    // prevent camera/select clicks through UI
    document.querySelectorAll('#hud > *').forEach(el => {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    this._embers();
  }

  _embers() {
    const wrap = $('menu-embers');
    for (let i = 0; i < 26; i++) {
      const d = document.createElement('div');
      d.className = 'ember';
      d.style.left = Math.random() * 100 + '%';
      d.style.animationDuration = (7 + Math.random() * 10) + 's';
      d.style.animationDelay = (-Math.random() * 12) + 's';
      d.style.opacity = 0.2 + Math.random() * 0.6;
      d.style.transform = `scale(${0.5 + Math.random() * 1.2})`;
      wrap.appendChild(d);
    }
  }

  // ============================================================
  // LOADING / MENU
  // ============================================================
  setLoading(p, text) {
    $('load-fill').style.width = clamp(p * 100, 0, 100) + '%';
    if (text) $('load-status').textContent = text;
  }
  hideLoading() { this.loading.classList.add('hidden'); }
  showMenu() {
    this.menu.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.modalRoot.classList.add('hidden');
    this._menuMode = true;
    const has = this.game.hasSave();
    $('btn-continue').disabled = !has;
    $('btn-continue').textContent = has ? 'Continue Campaign' : 'No Campaign Found';
  }
  hideMenu() {
    this.menu.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this._menuMode = false;
  }
  setRealmName(name) { $('realm-name').textContent = name; }

  // ============================================================
  // GENERIC FEEDBACK
  // ============================================================
  toast(text, kind = '') {
    if (this.toasts.childElementCount > 5) this.toasts.removeChild(this.toasts.firstChild);
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<span>${text}</span>`;
    this.toasts.appendChild(el);
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 320); }, 4300);
    if (kind === 'bad') this.audio.error();
  }
  hint(text) { if (this.hintEl && this.hintEl.textContent !== text) this.hintEl.textContent = text; }

  setSaveStatus(ok, at = Date.now()) {
    const b = document.getElementById('btn-save');
    if (!b) return;
    clearTimeout(this._saveFlash);
    b.classList.toggle('failed', !ok);
    if (!ok) {
      b.textContent = 'SAVE!';
      b.title = 'Save failed — use Settings → Export Save';
      return;
    }
    b.textContent = 'SAVED';
    b.title = 'Saved at ' + new Date(at).toLocaleTimeString();
    this._saveFlash = setTimeout(() => {
      b.textContent = 'SAVE';
      b.title = 'Save campaign (Ctrl+S)';
    }, 1600);
  }

  float(worldPos, text, cls = '', opts = {}) {
    if (this.floats.childElementCount > 26) return;
    const p = this.engine.project(worldPos);
    if (!p.visible) return;
    if (p.x < -40 || p.x > window.innerWidth + 40 || p.y < 40 || p.y > window.innerHeight) return;
    const el = document.createElement('div');
    el.className = 'float-txt ' + cls;
    el.textContent = text;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    if (opts.scale) el.style.fontSize = opts.scale + 'px';
    this.floats.appendChild(el);
    setTimeout(() => el.remove(), 1250);
  }
  coinBurst(worldPos, n = 4) {
    const p = this.engine.project(worldPos);
    if (!p.visible) return;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'float-coin';
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.style.setProperty('--dx', (Math.random() - 0.5) * 70 + 'px');
      el.style.setProperty('--dy', (-30 - Math.random() * 55) + 'px');
      el.style.animationDelay = (i * 50) + 'ms';
      this.floats.appendChild(el);
      setTimeout(() => el.remove(), 1000 + i * 50);
    }
  }
  flashDamage() {
    const fx = $('screen-fx');
    fx.classList.add('flash');
    clearTimeout(this._fxT);
    this._fxT = setTimeout(() => fx.classList.remove('flash'), 160);
  }
  produceFloat(b, gains) {
    const y = (b.y || 0) + 5;
    const entries = Object.entries(gains).filter(([, v]) => v > 0.4);
    const tmp = this._floatVec || (this._floatVec = new this.engine.camera.position.constructor());
    entries.slice(0, 2).forEach(([r, v], i) => {
      const icon = r === 'gold' ? 'i-gold' : RESOURCES[r]?.icon;
      tmp.set(b.x, y + i * 0.7, b.z);
      const p = this.engine.project(tmp);
      if (!p.visible) return;
      if (this.floats.childElementCount > 24) return;
      const el = document.createElement('div');
      el.className = 'float-txt res';
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.innerHTML = `${icon ? `<svg style="width:12px;height:12px;display:inline;vertical-align:-1px"><use href="#${icon}"/></svg> ` : ''}+${v >= 10 ? Math.round(v) : fmt1(v)}`;
      this.floats.appendChild(el);
      setTimeout(() => el.remove(), 1250);
    });
    if (Math.random() < 0.22) this.audio.chop();
  }

  // ============================================================
  // TOPBAR
  // ============================================================
  updateTopbar(force = false) {
    const s = this.game.state;
    if (!s) return;
    const setVal = (id, val, idCap, cap) => {
      const el = $(id);
      if (!el) return;
      const txt = fmt(val);
      if (el.textContent !== txt) el.textContent = txt;
      if (idCap) {
        const c = $(idCap);
        if (c) c.textContent = '/' + fmt(cap);
      }
    };
    setVal('v-gold', s.gold);
    const gr = $('gold-rate');
    const rate = this.game.economy?.goldRate || 0;
    gr.textContent = (rate >= 0 ? '+' : '') + fmt(Math.abs(rate) >= 1000 ? rate : Math.round(rate)) + '/m';
    gr.style.color = rate >= 0 ? 'var(--good)' : 'var(--bad)';
    for (const r of ['wood', 'stone', 'food', 'iron', 'goods', 'weapons']) {
      setVal('v-' + r, s.resources[r] || 0, 'cap-' + r, this.game.economy.cap(r));
    }
    const pop = `${s.population}/${this.game.settlement.effects.popCap || 0}`;
    if ($('v-pop').textContent !== pop) $('v-pop').textContent = pop;
    $('v-happy').textContent = Math.round(s.happiness);
    $('v-happy').style.color = s.happiness > 65 ? 'var(--good)' : s.happiness > 40 ? '#d9c27e' : 'var(--bad)';
    $('v-influence').textContent = fmt(this.game.influence());
    const h = Math.floor(s.timeOfDay), m = Math.floor((s.timeOfDay % 1) * 60);
    $('v-hour').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    $('v-day').textContent = 'Day ' + s.day;
    $('v-season').textContent = SEASONS[s.season].name;
    // flash on increase
    for (const r of ['gold', 'wood', 'stone', 'food', 'iron', 'goods', 'weapons']) {
      const key = r === 'gold' ? '$gold' : r;
      const cur = Math.floor(r === 'gold' ? s.gold : s.resources[r] || 0);
      if (this._last[key] !== undefined && cur > this._last[key] && !this._noBump) {
        const el = $('res-' + r);
        if (el) { el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 400); }
      }
      this._last[key] = cur;
    }
    this.updateMailBadge();
  }

  // ============================================================
  // OBJECTIVES / TUTORIAL
  // ============================================================
  updateObjectives() {
    const objs = this.game.getObjectives();
    const list = $('objective-list');
    list.innerHTML = objs.slice(0, 4).map(o => `
      <div class="obj ${o.done ? 'done' : o.active ? 'active' : ''}">
        <div class="obj-mark">${o.done ? '✓' : o.active ? '◆' : ''}</div>
        <div class="obj-text">${o.title}${o.detail ? `<small>${o.detail}</small>` : ''}</div>
      </div>`).join('');
    const total = objs.length, done = objs.filter(o => o.done).length;
    $('objective-count').textContent = `${done}/${total}`;
    $('objective-hint').textContent = this.game.state.tutorial < TUTORIAL.length ? 'The chronicle guides your rise' : 'Press J for the full chronicle';
    // rail attention
    const step = this.game.state.tutorial;
    document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('attention'));
    const attn = step <= 1 ? 'build' : step === 4 ? 'market' : step === 9 ? 'realm' : step === 8 ? 'army' : null;
    if (attn) {
      const btn = document.querySelector(`.rail-btn[data-panel="${attn}"]`);
      if (btn) btn.classList.add('attention');
    }
  }

  // ============================================================
  // SELECTION CARD
  // ============================================================
  showSelection(b) {
    if (!b) { this.hideSelection(); return; }
    this.hud.classList.add('has-selection');
    this.selectedBuilding = b;
    const def = BUILDINGS[b.type];
    const eff = def.effect || {};
    const cap = this.game.economy;
    const s = this.game.state;
    const isKeep = b.type === 'keep';
    const inv = isKeep ? this.game.inviteInfo() : null;
    const grand = isKeep ? this.game.inviteInfo('grand') : null;
    const feast = isKeep ? this.game.feastInfo() : null;
    const maxLvl = isKeep ? KEEP_LEVELS.length - 1 : 10;
    let cost = isKeep ? KEEP_LEVELS[Math.min(maxLvl, b.level + 1)].cost : this.game.settlement.upgradeCost(b);
    const upgradeName = isKeep ? KEEP_LEVELS[Math.min(maxLvl, b.level + 1)].name : `Level ${b.level + 1}`;
    const canUp = b.level < maxLvl;
    const afford = canUp && this.game.economy.canAfford(cost);
    // A constant anchor in the header, so the upgrade action is obvious even
    // when the card body is busy or the button below is scrolled past.
    const topUp = `<button class="act-btn primary sel-up-top" data-action="upgrade" ${canUp && afford ? '' : 'disabled'}
      title="${canUp ? 'Upgrade this building (U)' : 'Maximum level reached'}">
      <svg><use href="#i-up"/></svg> ${canUp ? 'Upgrade' : 'Max Level'}<span class="keycap">U</span>
    </button>`;
    const prod = def.prod;
    let statsHTML = '';
    if (prod) {
      const entries = Object.entries(prod);
      statsHTML += entries.map(([r, v]) => {
        if (r === 'gold') return `<div class="sel-stat"><svg><use href="#i-gold"/></svg><b>+${fmt1(v * Math.max(1, b.workers))}</b> gold / 4s</div>`;
        return `<div class="sel-stat"><svg><use href="#${RESOURCES[r].icon}"/></svg><b>${fmt1(v * Math.max(1, b.workers))}</b> / 4s</div>`;
      }).join('');
      if (def.consume) statsHTML += Object.entries(def.consume).map(([r, v]) => `<div class="sel-stat bad"><svg><use href="#${RESOURCES[r].icon}"/></svg>−${fmt1(v * Math.max(1, b.workers))} / 4s</div>`).join('');
    }
    if (eff.popCap) statsHTML += `<div class="sel-stat"><svg><use href="#i-pop"/></svg>Housing <b>+${eff.popCap + (b.level - 1) * Math.max(2, Math.round(eff.popCap * 0.65))}</b></div>`;
    if (eff.happiness) statsHTML += `<div class="sel-stat good"><svg><use href="#i-happy"/></svg>Happiness <b>+${eff.happiness * b.level}</b></div>`;
    if (eff.growth) statsHTML += `<div class="sel-stat good"><svg><use href="#i-pop"/></svg>Growth <b>+${Math.round(eff.growth * b.level * 100)}%</b></div>`;
    if (eff.armyCap) statsHTML += `<div class="sel-stat"><svg><use href="#i-sword"/></svg>Army cap <b>+${eff.armyCap + (b.level - 1) * Math.max(4, Math.round(eff.armyCap * 0.9))}</b></div>`;
    if (eff.defense) statsHTML += `<div class="sel-stat"><svg><use href="#i-stone"/></svg>Defense <b>${eff.defense * b.level}</b></div>`;
    if (eff.storage) statsHTML += `<div class="sel-stat"><svg><use href="#i-goods"/></svg>Storage <b>+${eff.storage * b.level}</b></div>`;
    if (eff.influence) statsHTML += `<div class="sel-stat"><svg><use href="#i-influence"/></svg>Renown <b>+${eff.influence}</b></div>`;
    if (def.near) {
      const nb = b.near ? Math.max(...Object.values(b.near)) : 1;
      if (nb > 1.02) statsHTML += `<div class="sel-stat good">Location bonus <b>+${Math.round((nb - 1) * 100)}%</b></div>`;
    }
    if (isKeep) {
      const kd = KEEP_LEVELS[b.level];
      statsHTML += `<div class="sel-stat"><svg><use href="#i-crown"/></svg>Keep <b>Level ${b.level}</b></div>`;
      statsHTML += `<div class="sel-stat"><svg><use href="#i-happy"/></svg>Renown <b>+${kd.influence}</b></div>`;
    }

    const wcap = this.game.settlement.workerCap(b);
    const workerRow = def.workers ? `
      <div class="worker-row">
        <span class="worker-label">WORKERS <span class="keycap" title="Shortcut [">[</span><span class="keycap" title="Shortcut ]">]</span></span>
        <button class="wbtn" data-action="worker-" ${b.workers <= 0 ? 'disabled' : ''}>−</button>
        <div class="wbar"><i style="width:${(b.workers / wcap) * 100}%"></i></div>
        <button class="wbtn" data-action="worker+" ${b.workers >= wcap ? 'disabled' : ''}>+</button>
        <span class="worker-count">${b.workers}/${wcap}</span>
      </div>
      <div style="font-size:9.5px;color:#8c7e66;margin-top:-3px;margin-bottom:6px">${this.game.settlement.idleWorkers()} idle villagers available</div>` : '';

    let actionHTML = '';
    if (canUp) {
      actionHTML = `<button class="act-btn primary" data-action="upgrade" ${afford ? '' : 'disabled'} title="Shortcut U">
        <svg><use href="#i-up"/></svg> Upgrade to ${upgradeName}<span class="keycap">U</span>
      </button>
      <div class="cost-row">${costHTML(cost)}</div>`;
    } else {
      actionHTML = `<button class="act-btn primary" disabled title="Maximum level reached">
        <svg><use href="#i-up"/></svg> Max Level<span class="keycap">U</span>
      </button>
      <div class="cost-row" style="color:#9a8c72">Fully upgraded</div>`;
    }
    if (!isKeep) {
      actionHTML += `<button class="act-btn danger" data-action="demolish" style="margin-left:auto" title="Shortcut X"><svg><use href="#i-close"/></svg> Demolish<span class="keycap">X</span></button>`;
    }

    let inviteHTML = '';
    if (isKeep && inv) {
      inviteHTML = `<button class="act-btn ${inv.ok ? 'primary' : ''}" data-action="invite" ${inv.ok ? '' : 'disabled'} title="Shortcut I">
        <svg><use href="#i-pop"/></svg> ${inv.count ? `Invite ${inv.count} Settlers` : 'Housing Full'}<span class="keycap">I</span>
      </button>`;
      if (inv.count) inviteHTML += `<div class="cost-row">${costHTML(inv.cost)}<span style="color:#8c7e66">for ${inv.count} settler${inv.count > 1 ? 's' : ''} - rises slowly with population</span></div>`;
      else inviteHTML += `<div class="cost-row" style="color:#9a8c72">${inv.reason}</div>`;
      if (grand) {
        inviteHTML += `<button class="act-btn ${grand.ok ? '' : ''}" data-action="invite-grand" ${grand.ok ? '' : 'disabled'} title="Shortcut G">
          <svg><use href="#i-pop"/></svg> ${grand.count ? `Grand Invite (${grand.count})` : 'Grand Invite'}<span class="keycap">G</span>
        </button>`;
        if (grand.count) inviteHTML += `<div class="cost-row">${costHTML(grand.cost)}<span style="color:#8c7e66">for ${grand.count} settlers</span></div>`;
      }
      if (feast) {
        inviteHTML += `<button class="act-btn ${feast.ok ? '' : ''}" data-action="feast" ${feast.ok ? '' : 'disabled'} title="Shortcut E">
          <svg><use href="#i-happy"/></svg> Hold a Feast<span class="keycap">E</span>
        </button>`;
        if (feast.ok) inviteHTML += `<div class="cost-row">${costHTML(feast.cost)}</div>`;
        else inviteHTML += `<div class="cost-row" style="color:#9a8c72">${feast.reason}</div>`;
      }
    }

    this.sel.innerHTML = `
      <div class="sel-top">
        <div class="sel-icon">${def.icon}</div>
        <div class="sel-title">
          <h3>${def.name} <span class="lvl">Lv ${b.level}</span></h3>
          <p>${isKeep ? KEEP_LEVELS[b.level].name : def.desc}</p>
        </div>
        <div class="sel-top-actions">${topUp}<button class="sel-close" title="Close"><svg><use href="#i-close"/></svg></button></div>
      </div>
      <div class="sel-body">
        <div class="sel-stats">${statsHTML}</div>
        ${workerRow}
        <div class="sel-actions">${inviteHTML}${actionHTML}</div>
      </div>`;
    this.sel.classList.remove('hidden');
  }

  showCamp(regionId) {
    const reg = REGIONS[regionId];
    const owned = this.game.state.regions[regionId]?.owned;
    const camp = reg.camp;
    const rating = this.game.army.rating();
    const can = this.game.canMarch(regionId);
    const progress = this.game.state.regionProgress?.[regionId] || 0;
    const stageNames = ['Outer Ring', 'Inner Fort', "Warlord's Keep"];
    const stageTotal = this.game.campStageTotal(regionId);
    this.selectedBuilding = { regionId, isCamp: true, x: reg.x, z: reg.z };
    const content = `
      <div class="sel-top">
        <div class="sel-icon">${owned ? '🏳️' : '🏴'}</div>
        <div class="sel-title">
          <h3>${reg.name} <span class="lvl" style="${owned ? '' : 'background:#a5463a;color:#f2d7cf'}">${owned ? 'Yours' : 'Hostile'}</span></h3>
          <p>${reg.bonusText}</p>
        </div>
        <button class="sel-close"><svg><use href="#i-close"/></svg></button>
      </div>
      <div class="sel-body">
        ${camp && !owned ? `
          <div class="sel-desc">${camp.flavor}</div>
          <div class="sel-stats">
            <div class="sel-stat"><svg><use href="#i-sword"/></svg>${camp.leader}</div>
            <div class="sel-stat bad"><svg><use href="#i-weapons"/></svg>${stageNames[progress]} <b>${stageTotal}</b> enemies</div>
            <div class="sel-stat"><svg><use href="#i-sword"/></svg>Your host <b>${rating}</b></div>
            <div class="sel-stat"><svg><use href="#i-crown"/></svg>Holdings <b>${progress}/3</b> - ${3 - progress} battle${3 - progress > 1 ? 's' : ''} left</div>
          </div>
          <div class="sel-actions">
            <button class="act-btn primary" data-action="march" ${can.ok ? '' : 'disabled'} title="Shortcut M"><svg><use href="#i-sword"/></svg> ${progress === 0 ? 'Storm the Outer Ring' : progress === 1 ? 'Storm the Inner Fort' : "Take the Warlord's Keep"}<span class="keycap">M</span></button>
            <button class="act-btn" data-action="focus" title="Shortcut V"><svg><use href="#i-map"/></svg> Focus<span class="keycap">V</span></button>
          </div>
          ${can.ok ? '' : `<div class="cost-row" style="color:#c08a6a">${can.reason}</div>`}
        ` : `
          <div class="sel-desc">${owned ? 'Your banner flies here. Build within this region to expand your production.' : reg.bonusText}</div>
          <div class="sel-actions"><button class="act-btn" data-action="focus" title="Shortcut V"><svg><use href="#i-map"/></svg> Focus<span class="keycap">V</span></button></div>
        `}
      </div>`;
    this.sel.innerHTML = content;
    this.sel.classList.remove('hidden');
    this.hud.classList.add('has-selection');
  }

  hideSelection() {
    this.selectedBuilding = null;
    this.sel.classList.add('hidden');
    this.hud.classList.remove('has-selection');
  }

  // ============================================================
  // BUILD PANEL
  // ============================================================
  toggleBuild() { if (this.buildPanel.classList.contains('hidden')) this.openBuild(); else this.closeBuild(); }
  openBuild() {
    this.closeModal();
    this.buildPanel.classList.remove('hidden');
    this.renderBuild();
    document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === 'build'));
  }
  closeBuild() {
    this.buildPanel.classList.add('hidden');
    document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('active'));
  }
  _startBuild(type) {
    const def = BUILDINGS[type];
    if (!def) return;
    if (this.game.state.keepLevel < def.unlock) {
      this.toast(`Requires Keep Level ${def.unlock}.`, 'warn');
      this.audio.error(); return;
    }
    if (!this.game.economy.canAfford(def.cost)) {
      this.toast('Not enough resources.', 'bad');
      this.audio.error(); return;
    }
    this.closeBuild();
    this.game.beginPlacement(type);
  }

  // Context-aware one-key shortcuts. Every badge shown in the UI routes here,
  // so the labels and the actual keys cannot drift apart.
  handleShortcut(code, e) {
    const modalOpen = !this.modalRoot.classList.contains('hidden');
    if (modalOpen) return this._modalShortcut(code, e || {});
    if (this.game.placing) return false;
    if (!this.buildPanel.classList.contains('hidden')) return this._buildShortcut(code);
    const b = this.selectedBuilding;
    if (b) return this._selectionShortcut(code, b);
    if (code === 'KeyU') { this.game.upgradeAllAffordable(); return true; }
    if (code === 'KeyC') { this.game.upgradeAllHouses(); return true; }
    return false;
  }

  _buildShortcut(code) {
    const m = /^Digit([1-9])$/.exec(code);
    if (m) {
      const type = (this._buildHotkeys || [])[+m[1] - 1];
      if (!type) return true;
      this.audio.click();
      this._startBuild(type);
      return true;
    }
    if (code === 'KeyC') { this.game.upgradeAllHouses(); return true; }
    if (code === 'KeyU') { this.game.upgradeAllAffordable(); return true; }
    return false;
  }

  _selectionShortcut(code, b) {
    if (b.isCamp) {
      if (code === 'KeyM') { this.game.march(b.regionId); return true; }
      if (code === 'KeyV') { this.game.focusRegion(b.regionId); return true; }
      return false;
    }
    if (code === 'KeyU') { this.game.upgradeBuilding(b); return true; }
    if (code === 'KeyX') { this.game.demolishBuilding(b); return true; }
    if (code === 'BracketLeft') { this.game.settlement.assign(b.id, -1); return true; }
    if (code === 'BracketRight') { this.game.settlement.assign(b.id, 1); return true; }
    if (b.type === 'keep') {
      if (code === 'KeyI') { this.game.inviteSettlers(); return true; }
      if (code === 'KeyG') { this.game.inviteSettlers('grand'); return true; }
      if (code === 'KeyE') { this.game.holdFeast(); return true; }
    }
    return false;
  }

  _modalShortcut(code, e) {
    if (this.modalType !== 'army') return false;
    const types = Object.keys(UNITS);
    const m = /^Digit([0-9])$/.exec(code);
    if (m) {
      const type = types[m[1] === '0' ? 9 : +m[1] - 1];
      if (!type) return true;
      if (e.shiftKey) {
        const n = this.game.army.maxRecruit(type, 5);
        this.game.army.recruit(type, n || 1);
      } else this.game.army.recruit(type, 1);
      return true;
    }
    const trainKey = {
      KeyM: 'militia', KeyS: 'spearman', KeyA: 'axeman', KeyR: 'archer',
      KeyL: 'arrowman', KeyC: 'crossbow', KeyK: 'knight', KeyV: 'cavalry',
      KeyO: 'warElephant', KeyP: 'catapult',
    }[code];
    if (trainKey) { this.game.trainUnit(trainKey); return true; }
    if (code === 'KeyE') { this.game.army.upgradeEquip(); return true; }
    if (code === 'KeyT') { this.game.trainAllUnits(); return true; }
    return false;
  }

  renderBuild() {
    const lvl = this.game.state.keepLevel;
    this.buildTabs.innerHTML = BUILD_CATS.map(c => `<button class="b-tab ${c.id === this.buildCat ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>`).join('');
    const items = Object.entries(BUILDINGS).filter(([type, d]) => d.cat === this.buildCat && !d.keep);
    this._buildHotkeys = items.slice(0, 9).map(([type]) => type);
    this.buildGrid.innerHTML = items.map(([type, d], i) => {
      const locked = lvl < d.unlock;
      const afford = this.game.economy.canAfford(d.cost);
      const missing = !locked && !afford;
      const hotkey = i < 9 ? `<span class="bc-key" title="Shortcut ${i + 1}">${i + 1}</span>` : '';
      return `<button class="build-card ${locked ? 'locked' : ''} ${missing ? 'unaffordable' : ''}" data-type="${type}" title="Shortcut ${i + 1}: build ${d.name}">
        ${hotkey}
        <div class="bc-top"><div class="bc-icon">${d.icon}</div><div class="bc-name">${d.name}</div></div>
        <div class="bc-desc">${d.desc.length > 76 ? d.desc.slice(0, 74) + '…' : d.desc}</div>
        <div class="bc-cost">${costHTML(d.cost)}</div>
        ${locked ? `<div class="bc-lock">Requires Keep Level ${d.unlock}</div>` : ''}
      </button>`;
    }).join('');
  }
  showPlacement(type, cost) {
    const def = BUILDINGS[type];
    $('placement-bar').classList.remove('hidden');
    $('placement-name').textContent = def.name;
    $('placement-cost').innerHTML = costHTML(cost, false);
  }
  updatePlacement(valid, reason) {
    const el = $('placement-bar');
    el.style.borderColor = valid ? 'var(--gold-dim)' : 'var(--red)';
    let extra = $('placement-reason');
    if (!extra) {
      extra = document.createElement('span');
      extra.id = 'placement-reason';
      extra.style.color = 'var(--bad)';
      extra.style.fontSize = '10px';
      el.appendChild(extra);
    }
    extra.textContent = valid ? '' : (reason || 'Cannot build here');
  }
  hidePlacement() { $('placement-bar').classList.add('hidden'); }

  // ============================================================
  // MODALS
  // ============================================================
  openModal(title, sub, body, foot = '') {
    this.modalTitle.textContent = title;
    this.modalSub.textContent = sub || '';
    this.modalBody.innerHTML = body;
    this.modalFoot.innerHTML = foot;
    this.modalRoot.classList.remove('hidden');
    this.modalRoot.style.zIndex = this._menuMode ? 95 : 50;
    this.modalBody.scrollTop = 0;
  }
  closeModal() {
    this.modalRoot.classList.add('hidden');
    this.modalType = null;
    if (this.game._raidPending) {
      // closing the warning without choosing must not leave the game frozen
      this.game._raidPending = false;
      this.game.setSpeed(this.game._speedBeforeRaid || 1);
    }
    this.game.audio.click();
  }
  setModalBody(html) { this.modalBody.innerHTML = html; }

  _clampQty(v) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(99999, n);
  }

  _tradeQty(btn, good) {
    const input = btn.closest('tr')?.querySelector('.trade-qty');
    const qty = this._clampQty(input ? input.value : (this._marketQty?.[good] || 1));
    this._marketQty = this._marketQty || {};
    this._marketQty[good] = qty;
    return qty;
  }

  _modalAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    const v = btn.dataset.value;
    const v2 = btn.dataset.value2;
    this.audio.click();
    const g = this.game;
    switch (a) {
      case 'close': this.closeModal(); break;
      case 'sell': g.economy.sell(v, +v2); this.openMarket(true); g.ui.updateTopbar(true); break;
      case 'buyqty': {
        const qty = this._tradeQty(btn, v);
        const bought = g.economy.buy(v, qty);
        if (!bought) {
          const full = (g.state.resources[v] || 0) >= g.economy.cap(v) - 0.01;
          this.toast(full ? 'Storage is full.' : 'Not enough gold for that purchase.', 'bad');
        } else {
          this.audio.coin();
          const note = bought < qty ? ` Storage had room for only ${fmt(bought)}.` : '';
          this.toast(`Bought <b>${fmt(bought)} ${RESOURCES[v].name}</b>.${note}`, bought < qty ? 'warn' : 'good');
        }
        g.ui.updateTopbar(true);
        this.openMarket(true);
        break;
      }
      case 'sellqty': {
        const qty = this._tradeQty(btn, v);
        const before = g.state.resources[v] || 0;
        const rev = g.economy.sell(v, qty);
        const sold = before - (g.state.resources[v] || 0);
        if (rev <= 0) this.toast('There is nothing to sell.', 'warn');
        else this.toast(`Sold <b>${fmt(sold)} ${RESOURCES[v].name}</b> for <b>${fmt(rev)} gold</b>.`, 'good');
        g.ui.updateTopbar(true);
        this.openMarket(true);
        break;
      }
      case 'sellall': {
        const amt = g.state.resources[v] || 0;
        const rev = g.economy.sell(v, amt);
        if (rev > 0) this.toast(`Sold ${fmt(amt)} ${RESOURCES[v].name} for <b>${fmt(rev)} gold</b>.`, 'good');
        this.openMarket(true); break;
      }
      case 'buy': {
        const ok = g.economy.buy(v, +v2);
        if (!ok) this.toast('Not enough gold or storage is full.', 'bad');
        else this.audio.coin();
        this.openMarket(true); break;
      }
      case 'recruit': g.army.recruit(v, +v2); break;
      case 'recruitmax': {
        const n = g.army.maxRecruit(v, +(v2 || 5));
        g.army.recruit(v, n || 1);
        break;
      }
      case 'train': g.trainUnit(v); break;
      case 'train-all': g.trainAllUnits(); break;
      case 'upgrade-all': g.upgradeAllAffordable(); break;
      case 'dismiss': g.army.dismiss(v, +v2); break;
      case 'equip': g.army.upgradeEquip(); this.openArmy(); break;
      case 'march': this.closeModal(); g.march(v); break;
      case 'close-march': this.closeModal(); break;
      case 'quality': g.setQuality(v); this.openSettings(); break;
      case 'sound': g.setSound(!g.state.settings.sound); this.openSettings(this._menuMode); break;
      case 'music': g.setMusic(!g.state.settings.music); this.openSettings(this._menuMode); break;
      case 'autosave': g.state.settings.autosave = !g.state.settings.autosave; this.openSettings(this._menuMode); break;
      case 'save': g.saveGame(true); break;
      case 'load': g.loadGame(); break;
      case 'export-save': g.exportSave(); break;
      case 'import-save': this._importInput?.click(); break;
      case 'raid-fight': g.beginRaidBattle(); break;
      case 'raid-pay': g.payOffRaiders(+v); break;
      case 'mail-goto':
        this.closeModal();
        if (v === 'army') this.openArmy();
        else if (v === 'build') this.openBuild();
        else if (v === 'realm') this.openRealm();
        break;
      case 'newcampaign': this.closeModal(); g.newGameRequest(); break;
      case 'help': this.openHelp(this._menuMode); break;
      case 'menu': g.returnToMenu(); break;
      case 'resume': this.closeModal(); break;
      case 'focus': g.focusRegion(v); this.closeModal(); break;
      case 'continue-victory': this.closeModal(); break;
      case 'march-confirm': this.closeModal(); g.startMarch(v); break;
      case 'demolish-confirm': g.confirmDemolish(+v); break;
      case 'new-start': g.newGame(); break;
      default: break;
    }
  }

  // ---------------- DISPATCHES ----------------
  updateMailBadge() {
    const badge = $('mail-badge');
    const btn = $('btn-mail');
    if (!badge || !btn) return;
    const n = this.game.unreadMail ? this.game.unreadMail() : 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.toggle('hidden', n === 0);
    btn.classList.toggle('has-unread', n > 0);
    btn.title = n ? `${n} unread dispatches` : 'Dispatches';
  }

  openMail() {
    if (this.game.mode === 'battle') return;
    const g = this.game;
    const all = (g.state.mail || []).slice().reverse();
    const unread = all.filter(m => !m.read).length;
    const rows = all.length ? all.map(m => `
      <div class="mail-item ${m.read ? '' : 'unread'} ${m.kind || 'info'}">
        <div class="mail-head"><span class="mail-from">${m.from}</span><span class="mail-day">Day ${m.day}</span></div>
        <div class="mail-subject">${m.subject}</div>
        <div class="mail-body">${m.body}</div>
      </div>`).join('') : '<div class="mail-empty">No dispatches yet. Your captains and villagers will write as the realm grows.</div>';
    all.forEach(m => { m.read = true; });
    this.updateMailBadge();
    this.modalType = 'mail';
    this.openModal('Dispatches', unread ? `${unread} unread letter${unread > 1 ? 's' : ''}` : 'Letters from your people', rows,
      `<span>Your people speak. Listen, and the vale will follow.</span>
       <div class="settings-actions" style="margin:0">
         <button class="btn btn-small btn-ghost" data-action="mail-goto" data-value="army">Army</button>
         <button class="btn btn-small btn-ghost" data-action="mail-goto" data-value="build">Build</button>
         <button class="btn btn-small btn-ghost" data-action="mail-goto" data-value="realm">Realm</button>
         <button class="btn btn-small btn-gold" data-action="close">Close</button>
       </div>`);
    this.audio.click();
  }

  // ---------------- MARKET ----------------
  openMarket(refresh = false) {
    if (this.game.mode === 'battle') return;
    const g = this.game;
    const wasOpen = this.modalType === 'market';
    const keepScroll = wasOpen ? this.modalBody.scrollTop : 0;
    this.modalType = 'market';
    this._marketQty = this._marketQty || {};
    const caravan = this.game.economy.eventMods;
    let rows = '';
    for (const r of TRADE_RES) {
      const res = RESOURCES[r];
      const stock = g.state.resources[r] || 0;
      const price = g.economy.sellPrice(r);
      const buyPrice = g.economy.buyPrice(r);
      const trend = g.economy.trend[r] || 0;
      const cap = g.economy.cap(r);
      const revenue = stock * price;
      const qty = this._marketQty[r] || 10;
      rows += `<tr>
        <td><div class="trade-good"><svg><use href="#${res.icon}"/></svg><div><div>${res.name}<small>Stock ${fmt(stock)} / ${fmt(cap)}</small></div></div></div></td>
        <td class="price">${fmt1(price)}<span class="trend ${trend > 0 ? 'up' : trend < 0 ? 'dn' : ''}">${trend > 0 ? '▲' : trend < 0 ? '▼' : ''}</span><small>buy ${fmt1(buyPrice)}</small></td>
        <td>${fmt(stock)}</td>
        <td>${fmt(revenue)}</td>
        <td><div class="trade-actions">
          <input class="trade-qty" type="number" min="1" max="99999" step="1" value="${qty}" data-good="${r}" aria-label="${res.name} quantity" title="Type any quantity">
          <button class="mini-btn" data-action="buyqty" data-value="${r}" ${g.state.gold < buyPrice ? 'disabled' : ''}>Buy</button>
          <button class="mini-btn" data-action="sellqty" data-value="${r}" ${stock < 1 ? 'disabled' : ''}>Sell</button>
          <button class="mini-btn" data-action="sellall" data-value="${r}" ${stock < 1 ? 'disabled' : ''}>All</button>
        </div></td>
      </tr>`;
    }
    const caravanHTML = caravan.caravan > 0 ? `
      <div class="caravan-banner"><div class="cb-icon">🐫</div><div><b>A caravan waits at your gates</b>
        <span>Premium prices for ${RESOURCES[caravan.caravanGood]?.name || 'goods'} · ${Math.ceil(caravan.caravan)}s remaining · +65% on ${RESOURCES[caravan.caravanGood]?.name || 'goods'}, +15% all</span></div></div>` : '';
    const body = `
      ${caravanHTML}
      <div class="market-top">
        <div class="mkt-stat"><span>Trade bonus</span><b>${Math.round((g.economy.sellPrice('wood') / RESOURCES.wood.sell) * 100)}%</b><small>Dynamic prices · sell high</small></div>
        <div class="mkt-stat"><span>Gold</span><b>${fmt(g.state.gold)}</b><small>${g.economy.goldRate >= 0 ? '+' : ''}${fmt(g.economy.goldRate)} / min</small></div>
        <div class="mkt-stat"><span>Caravan</span><b>${caravan.caravan > 0 ? Math.ceil(caravan.caravan) + 's' : '—'}</b><small>${caravan.caravan > 0 ? 'Premium active' : 'Wanders the roads'}</small></div>
      </div>
      <table class="trade-table">
        <thead><tr><th>Goods</th><th>Price</th><th>Stock</th><th>Value</th><th style="text-align:right">Trade</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:10px;color:#86795f;font-style:italic;margin-top:12px">Selling in bulk depresses the local price. It recovers over time — or find a caravan for a premium.</p>`;
    this.openModal('The Market', 'Trade the wealth of your valley', body,
      `<span>Set any quantity, then buy or sell that exact amount.</span><button class="btn btn-small btn-ghost" data-action="close">Close</button>`);
    this.modalBody.scrollTop = keepScroll;
    if (!refresh) this.audio.buildMenu();
  }

  // ---------------- ARMY ----------------
  openArmy() {
    if (this.game.mode === 'battle') return;
    // Training/recruiting rebuilds this modal. Preserve the player's place
    // instead of snapping the scroll position back to the top.
    const keepScroll = this.modalType === 'army' ? this.modalBody.scrollTop : 0;
    this.modalType = 'army';
    const g = this.game;
    const army = g.army;
    const total = army.total();
    const cap = army.capacity();
    const eq = army.equipment();
    const nextEq = EQUIP_TIERS[g.state.equipTier + 1];
    const trainKeys = { militia: 'M', spearman: 'S', axeman: 'A', archer: 'R', arrowman: 'L', crossbow: 'C', knight: 'K', cavalry: 'V', warElephant: 'O', catapult: 'P' };
    const slotKey = (i) => (i < 9 ? String(i + 1) : '0');
    const units = Object.entries(UNITS).map(([type, u], idx) => {
      const owned = g.state.army[type] || 0;
      const check = army.canRecruit(type, 1);
      const max5 = army.maxRecruit(type, 5);
      const recNote = check.ok ? '' : `<div class="unit-note">${check.reason}</div>`;
      const tLvl = g.state.training?.[type] || 0;
      const tCost = g.trainingCost(type);
      const canTrain = owned > 0 && !!tCost && g.economy.canAfford(tCost) && g.settlement.effects.recruit;
      return `<div class="unit-card">
        <div class="unit-head"><h4>${u.name}</h4><div class="unit-owned">${owned}</div></div>
        <div class="unit-desc">${u.desc}</div>
        <div class="unit-stats"><span>HP <b>${u.hp}</b></span><span>DMG <b>${u.dmg}</b></span><span>${u.ranged ? 'RNG' : 'ARM'} <b>${u.ranged ? u.range : Math.round(u.armor * 100) + '%'}</b></span><span>VET <b>${tLvl}</b></span></div>
        <div class="bc-cost" style="margin:2px 0">${costHTML(u.cost)}</div>
        <div class="unit-actions">
          <button class="mini-btn" data-action="recruit" data-value="${type}" data-value2="1" ${check.ok ? '' : 'disabled'} title="${check.ok ? `Recruit one (${slotKey(idx)})` : check.reason}">Recruit <span class="keycap">${slotKey(idx)}</span></button>
          <button class="mini-btn" data-action="recruitmax" data-value="${type}" data-value2="5" ${max5 ? '' : 'disabled'} title="${max5 ? `Recruit up to ${max5} now (Shift+${slotKey(idx)})` : check.reason}">x${max5 || 5} <span class="keycap">⇧${slotKey(idx)}</span></button>
          <button class="mini-btn" data-action="train" data-value="${type}" ${canTrain ? '' : 'disabled'} title="Train (${trainKeys[type]})">Train${tCost ? ` (${tCost.gold}g)` : ''} <span class="keycap">${trainKeys[type]}</span></button>
          <button class="mini-btn" data-action="dismiss" data-value="${type}" data-value2="1" ${owned ? '' : 'disabled'} title="Dismiss one">-</button>
        </div>
        ${recNote}
      </div>`;
    }).join('');
    const tierDots = EQUIP_TIERS.map((t, i) => `<div class="etier ${i <= g.state.equipTier ? 'on' : ''}" title="${t.name}"></div>`).join('');
    const campaigns = Object.entries(REGIONS).filter(([id, r]) => r.camp && !g.state.regions[id].owned).map(([id, r]) => {
      const can = g.canMarch(id);
      return `<div class="region-card ${can.ok ? 'enemy' : ''}">
        <h4>${r.name}<span class="region-tag hostile">Stage ${(g.state.regionProgress?.[id] || 0) + 1}/3 · ${g.campStageTotal(id)} enemies</span></h4>
        <div class="region-bonus">${r.camp.leader} · ${r.camp.flavor}</div>
        <div class="region-str">Your host <b>${army.rating()}</b> vs <b>${g.campStageTotal(id)}</b> <div class="str-pips">${[1,2,3,4,5].map(i => `<i class="${i <= Math.ceil(g.campStageTotal(id) / 18) ? 'on' : ''}"></i>`).join('')}</div></div>
        <button class="mini-btn" data-action="march" data-value="${id}" ${can.ok ? '' : 'disabled'} style="margin-top:6px">${can.ok ? 'March' : can.reason}</button>
      </div>`;
    }).join('');
    const body = `
      <div class="army-top">
        <div class="army-power">${army.rating()}<span>HOST POWER</span></div>
        <div class="army-top-stats">
          <div><span>Soldiers</span><b>${total} / ${cap}</b></div>
          <div><span>Free villagers</span><b>${army.availablePop()}</b></div>
          <div><span>Equipment</span><b>+${Math.round(eq.bonus * 100)}%</b></div>
        </div>
      </div>
      <div class="modal-sec">
        <div class="sec-head"><h3>Recruit</h3><span>Soldiers consume food and population</span></div>
        ${!g.settlement.effects.recruit ? '<div class="army-note"><b>No Barracks.</b> Upgrade the Keep to Level 2 and raise a Barracks before you can recruit or arm soldiers.</div>' : ''}
        ${g.settlement.effects.recruit && total >= cap ? `<div class="army-note"><b>Army at capacity (${total}/${cap}).</b> Upgrade the Keep or Barracks to raise the limit.</div>` : ''}
        ${g.settlement.effects.recruit && total < cap && army.availablePop() < 1 ? '<div class="army-note"><b>No free villagers.</b> Invite settlers, build housing, or free up workers before recruiting.</div>' : ''}
        <div class="unit-grid">${units}</div>
      </div>
      <div class="modal-sec">
        <div class="sec-head"><h3>Armament</h3><span>${eq.name}</span></div>
        <div class="equip-row">
          <div class="equip-tier">${tierDots}</div>
          <div style="flex:1;font-size:10.5px;color:#a2947a">${nextEq ? `Next: <b style="color:#e2ceA3">${nextEq.name}</b> · +${Math.round(nextEq.bonus * 100)}% damage to all soldiers.` : 'Your soldiers carry the finest steel in the vale.'}</div>
          ${nextEq ? `<button class="mini-btn" data-action="equip" ${army.canUpgradeEquip().ok ? '' : 'disabled'} title="Forge better arms (E)">Forge · ${costHTML(nextEq.cost)} <span class="keycap">E</span></button>` : ''}
        </div>
      </div>
      <div class="modal-sec">
        <div class="sec-head"><h3>Training Ground</h3><span>Veterans fight longer and hit harder — train all owned units at once</span></div>
        <div class="train-row">
          <div class="train-copy"><b>Barracks drills</b><span>Each rank gives +10% health and +8% damage to that unit type. Maximum rank 3.</span></div>
          <button class="mini-btn" data-action="train-all" ${g.settlement.effects.recruit ? '' : 'disabled'} title="Train every owned unit (T)">Train All <span class="keycap">T</span></button>
        </div>
      </div>
      <div class="modal-sec">
        <div class="sec-head"><h3>Campaigns</h3><span>Fight alongside your host — each kingdom has 3 stages</span></div>
        ${campaigns ? `<div class="region-grid">${campaigns}</div>` : '<p style="font-size:11px;color:#91836b">The valley is yours. The Pale Lord is broken.</p>'}
      </div>`;
    this.openModal('Your Host', 'Recruit, arm, and lead', body,
      `<span>${total ? 'Order your host from the overview — or lead it in battle.' : 'You need soldiers before you can march.'}</span><button class="btn btn-small btn-ghost" data-action="close">Close</button>`);
    this.modalBody.scrollTop = keepScroll;
  }

  // ---------------- REALM ----------------
  openRealm() {
    if (this.game.mode === 'battle') return;
    this.modalType = 'realm';
    const g = this.game;
    const ownedCount = Object.values(g.state.regions).filter(r => r.owned).length;
    const cards = Object.entries(REGIONS).map(([id, r]) => {
      const owned = g.state.regions[id].owned;
      const can = g.canMarch(id);
      const isCamp = !!r.camp;
      if (!isCamp) return `<div class="region-card owned">
        <h4>${r.name}<span class="region-tag">Capital</span></h4>
        <div class="region-bonus">${r.bonusText}</div>
        <div class="region-str">Your seat of power · Defense <b>${g.settlement.effects.defense || 0}</b></div>
      </div>`;
      return `<div class="region-card ${owned ? 'owned' : 'enemy'}">
        <h4>${r.name}<span class="region-tag ${owned ? '' : 'hostile'}">${owned ? 'Yours' : 'Hostile'}</span></h4>
        <div class="region-bonus">${r.bonusText}</div>
        ${!owned ? `<div class="region-str">${r.camp.leader} · Strength <b>${r.camp.strength}</b>
          <div class="str-pips">${[1,2,3,4,5].map(i => `<i class="${i <= Math.ceil(r.camp.strength / 12) ? 'on' : ''}"></i>`).join('')}</div></div>` : ''}
        ${owned ? '<div class="region-str" style="color:#93b37b">Banner raised · production active</div>' :
          `<button class="mini-btn" data-action="march" data-value="${id}" ${can.ok ? '' : 'disabled'} style="margin-top:5px">${can.ok ? 'March to Battle' : can.reason}</button>`}
      </div>`;
    }).join('');
    const body = `
      <div style="position:relative;border:1px solid var(--line);border-radius:2px;overflow:hidden;margin-bottom:16px;background:#14110c">
        <canvas id="realm-canvas" width="820" height="300" style="width:100%;height:300px;display:block;cursor:crosshair"></canvas>
        <div style="position:absolute;left:10px;top:8px;font-size:9px;letter-spacing:.2em;color:#cfbc96;background:rgba(14,11,8,.6);padding:3px 7px">THE ASHEN VALE</div>
      </div>
      <div class="modal-sec"><div class="sec-head"><h3>Regions</h3><span>${ownedCount} of ${Object.keys(REGIONS).length} under your banner</span></div>
      <div class="region-grid">${cards}</div></div>`;
    this.openModal('The Realm', 'A valley ripe for the taking', body,
      `<span>Victory requires 2 regions bordering your own.</span><button class="btn btn-small btn-ghost" data-action="close">Close</button>`);
    this._drawRealmMap();
  }

  _drawRealmMap() {
    const canvas = $('realm-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const base = this.game.world.getMinimapBase(300);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base, 0, 0, w, h);
    // vignette
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, w * 0.6);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(10,8,5,.65)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    this._mapHits = [];
    for (const [id, r] of Object.entries(REGIONS)) {
      const x = (r.x / 300 + 0.5) * w, y = (r.z / 300 + 0.5) * h;
      const owned = this.game.state.regions[id].owned;
      this._mapHits.push({ id, x, y, r: 26 });
      // region area
      ctx.beginPath();
      ctx.arc(x, y, (r.radius / 300) * w * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = owned ? 'rgba(100,140,82,.14)' : r.camp ? 'rgba(150,62,48,.12)' : 'rgba(200,170,100,.08)';
      ctx.fill();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = owned ? 'rgba(150,190,125,.5)' : r.camp ? 'rgba(200,115,90,.45)' : 'rgba(220,190,120,.4)';
      ctx.stroke(); ctx.setLineDash([]);
      // marker
      if (r.camp) {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        if (owned) { ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fillStyle = '#6d9460'; ctx.fill(); ctx.strokeStyle = '#cfe0b5'; }
        else {
          ctx.moveTo(0, -8); ctx.lineTo(7, 6); ctx.lineTo(-7, 6); ctx.closePath();
          ctx.fillStyle = '#a5463a'; ctx.fill(); ctx.strokeStyle = '#e2a48f';
        }
        ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#d6ab55'; ctx.fill(); ctx.strokeStyle = '#f4e2b0'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      // label
      ctx.font = '600 12px "Palatino Linotype", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,8,5,.7)';
      const tw = ctx.measureText(r.short).width + 10;
      ctx.fillRect(x - tw / 2, y + 12, tw, 17);
      ctx.fillStyle = owned ? '#d8e4c2' : '#e0c9b0';
      ctx.fillText(r.short, x, y + 25);
    }
    // player camera marker
    const c = this.game.engine.cameraCtl;
    ctx.beginPath();
    ctx.arc((c.target.x / 300 + 0.5) * w, (c.target.z / 300 + 0.5) * h, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff4d0'; ctx.fill();
    // click handling
    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width * w;
      const my = (e.clientY - rect.top) / rect.height * h;
      for (const hit of this._mapHits) {
        if (Math.hypot(mx - hit.x, my - hit.y) < 30) {
          this.game.focusRegion(hit.id);
          this.audio.click();
          break;
        }
      }
    };
  }

  // ---------------- CHRONICLE ----------------
  openChronicle() {
    if (this.game.mode === 'battle') return;
    this.modalType = 'chronicle';
    const g = this.game;
    const tut = g.state.tutorial;
    let rows = '';
    TUTORIAL.forEach((t, i) => {
      const done = i < tut;
      const active = i === tut;
      rows += `<div class="chronicle-item ${done ? 'done' : active ? 'active' : ''}">
        <div class="ch-icon">${done ? '✓' : active ? '◆' : i + 1}</div>
        <div class="ch-text"><b>${t.title}</b><span>${t.text}</span></div>
        <div class="ch-reward">${Object.entries(t.reward).map(([k, v]) => `+${v} ${k}`).join(' · ')}</div>
      </div>`;
    });
    let amb = '';
    if (tut >= TUTORIAL.length) {
      AMBITIONS.forEach((a) => {
        const done = g.state.ambitionsDone.includes(a.id);
        amb += `<div class="chronicle-item ${done ? 'done' : ''}">
          <div class="ch-icon">${done ? '✓' : '★'}</div>
          <div class="ch-text"><b>${a.title}</b><span>${a.text}</span></div>
          <div class="ch-reward">${Object.entries(a.reward).map(([k, v]) => `+${v} ${k}`).join(' · ')}</div>
        </div>`;
      });
    }
    const stats = g.state.stats;
    const body = `
      <div class="modal-sec">
        <div class="sec-head"><h3>The Rise</h3><span>${tut >= TUTORIAL.length ? 'Tutorial complete' : `${tut} of ${TUTORIAL.length} completed`}</span></div>
        <div class="chronicle-list">${rows}</div>
      </div>
      ${tut >= TUTORIAL.length ? `<div class="modal-sec"><div class="sec-head"><h3>Ambitions</h3><span>A warlord's work is never done</span></div><div class="chronicle-list">${amb}</div></div>` : ''}
      <div class="modal-sec"><div class="sec-head"><h3>Ledger</h3><span>Your story so far</span></div>
        <div class="market-top">
          <div class="mkt-stat"><span>Gold earned</span><b>${fmt(stats.goldEarned || 0)}</b><small>Across the campaign</small></div>
          <div class="mkt-stat"><span>Battles won</span><b>${stats.battlesWon || 0}</b><small>${stats.enemiesSlain || 0} enemies slain</small></div>
          <div class="mkt-stat"><span>Days ruled</span><b>${g.state.day}</b><small>Renown ${g.influence()}</small></div>
        </div>
      </div>`;
    this.openModal('Chronicle', 'Your rise from ruin to renown', body,
      `<span>${tut < TUTORIAL.length ? 'Follow the next entry to grow your power.' : 'The valley remembers those who build.'}</span><button class="btn btn-small btn-ghost" data-action="close">Close</button>`);
  }

  // ---------------- SETTINGS ----------------
  openSettings(fromMenu = false) {
    if (this.game.mode === 'battle') return;
    this.modalType = 'settings';
    const s = this.game.state?.settings || { quality: 'medium', sound: true, music: true, autosave: true };
    const body = `
      <div class="setting-row">
        <div class="setting-label"><b>Graphics quality</b><span>Lower this on older hardware for a smoother war table.</span></div>
        <div class="seg">
          <button data-action="quality" data-value="low" class="${s.quality === 'low' ? 'active' : ''}">Low</button>
          <button data-action="quality" data-value="medium" class="${s.quality === 'medium' ? 'active' : ''}">Medium</button>
          <button data-action="quality" data-value="high" class="${s.quality === 'high' ? 'active' : ''}">High</button>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-label"><b>Sound effects</b><span>Coins, hammers, and the clash of steel.</span></div>
        <button class="toggle ${s.sound ? 'on' : ''}" data-action="sound"></button>
      </div>
      <div class="setting-row">
        <div class="setting-label"><b>Music & ambience</b><span>A quiet score for a growing realm.</span></div>
        <button class="toggle ${s.music ? 'on' : ''}" data-action="music"></button>
      </div>
      <div class="setting-row">
        <div class="setting-label"><b>Autosave</b><span>Every 30 seconds, and after major actions.</span></div>
        <button class="toggle ${s.autosave !== false ? 'on' : ''}" data-action="autosave"></button>
      </div>
      <div class="settings-actions">
        ${!fromMenu ? `<button class="btn btn-small btn-ghost" data-action="save">Save Now</button>
        <button class="btn btn-small btn-ghost" data-action="load">Load Last Save</button>
        <button class="btn btn-small btn-ghost" data-action="menu">Main Menu</button>` : ''}
        <button class="btn btn-small btn-ghost" data-action="export-save">Export Save</button>
        <button class="btn btn-small btn-ghost" data-action="import-save">Import Save</button>
        <button class="btn btn-small btn-ghost" data-action="help">How to Play</button>
        <button class="btn btn-small btn-ghost" data-action="newcampaign">New Campaign</button>
      </div>
      ${!fromMenu ? '<p style="font-size:10px;color:#7f725c;margin-top:12px;line-height:1.6">Autosave stores one campaign in this browser. Manual saving is instant.</p>' : ''}`;
    this.openModal('Settings', 'Tune the war table to your machine', body,
      `<span>IRONHOLD · built for low-end hardware</span><button class="btn btn-small btn-ghost" data-action="close">Close</button>`);
  }

  openHelp(fromMenu = false) {
    this.modalType = 'help';
    const body = `
      <div class="help-grid">
        <div class="help-block">
          <h4>The Overview</h4>
          <p><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span> pan the war table. Mouse wheel zooms. Right-drag rotates the camera, middle-drag pans, or drag the minimap.</p>
          <p>Click a building to inspect it. Assign workers to produce. Open <b>Build</b> with <span class="key">B</span>, the <b>Market</b> with <span class="key">M</span>, your <b>Army</b> with <span class="key">T</span>, and the <b>Realm</b> with <span class="key">R</span>.</p>
          <p>Click an enemy camp to march. Choose your moment — a battle switches to personal command.</p>
          <p><b>Selected building:</b> <span class="key">U</span> upgrade · <span class="key">X</span> demolish · <span class="key">[</span> / <span class="key">]</span> workers · <span class="key">I</span> invite · <span class="key">G</span> grand invite · <span class="key">E</span> feast. <b>Build menu:</b> <span class="key">1</span>-<span class="key">9</span> choose a building · <span class="key">C</span> upgrade housing · <span class="key">U</span> upgrade all. <b>Army:</b> <span class="key">1</span>-<span class="key">8</span> recruit · <span class="key">Shift</span>+number recruit as many as fit · letter keys train · <span class="key">E</span> forge · <span class="key">T</span> train all.</p>
        </div>
        <div class="help-block">
          <h4>Your Economy</h4>
          <p>Villagers work buildings. Every building produces on a 4-second cycle. Build near forests, rock and water for bonuses. Sell goods at the market when prices are high; caravans pay more.</p>
          <p>Food feeds your people and army. Happiness multiplies all production. Housing raises the population cap. Upgrading the Keep unlocks new buildings.</p>
          <p>Select your Keep to <b>invite settlers</b> for gold and food. A Tavern draws families in faster. More people means more workers, taxes, and recruits.</p>
          <p>Your campaign autosaves every 30 seconds. Click <b>SAVE</b> in the topbar or press <span class="key">Ctrl</span>+<span class="key">S</span> at any time. <span class="key">Space</span> pauses. <span class="key">1</span>-<span class="key">4</span> set speed.</p>
        </div>
        <div class="help-block" style="grid-column:1 / -1">
          <h4>In Battle</h4>
          <p><span class="key">Drag</span> the battlefield to look around, or press <span class="key">V</span> to capture the mouse. <span class="key">WASD</span> move, <span class="key">Shift</span> sprint, <span class="key">Space</span> dodge, <span class="key">LMB</span> click to strike (mouse direction shapes the blow), <span class="key">RMB</span> raise your shield. A red ring warns of an incoming attack. Chain hits for combo damage.</p>
          <p>Command your host from the saddle: <span class="key">1</span> Advance · <span class="key">2</span> Hold · <span class="key">3</span> Charge · <span class="key">4</span> Follow Me · <span class="key">Q</span> Rally. Break the enemy's morale, not just their bodies.</p>
          <p><b>Giants</b> are slow and heavily armored, but one blow can end you. Block the overhead swing or dodge to the side.</p>
        </div>
      </div>`;
    this.openModal('How to Play', 'A merchant first. A warlord when the time comes.', body,
      `<span>The valley rewards patience — and steel.</span><button class="btn btn-small btn-ghost" data-action="close">Close</button>`);
  }

  // ---------------- MARCH CONFIRM ----------------
  confirmMarch(regionId) {
    const r = REGIONS[regionId];
    const g = this.game;
    const comp = Object.entries(r.camp.comp).map(([t, n]) => `<span style="display:inline-block;margin-right:8px">${n}× ${t}</span>`).join('');
    const body = `
      <p class="sel-desc" style="font-size:13px;line-height:1.7;color:#c3b394">${r.camp.flavor}</p>
      <div class="market-top">
        <div class="mkt-stat"><span>Enemy</span><b>${r.camp.strength}</b><small>${r.camp.leader}</small></div>
        <div class="mkt-stat"><span>Your host</span><b>${g.army.rating()}</b><small>${g.army.total()} soldiers · +${Math.round(g.army.equipment().bonus * 100)}% arms</small></div>
        <div class="mkt-stat"><span>Expected spoils</span><b>${fmt(r.camp.loot)}</b><small>gold + ${r.camp.influence} renown</small></div>
      </div>
      <div class="help-block" style="margin-top:14px">
        <h4>Enemy composition</h4>
        <p>${comp}</p>
        <p style="color:#c8a46c">You will fight personally in the battle. If you fall, the host loses heart.</p>
      </div>
      <p style="font-size:10.5px;color:#887b63;margin-top:14px">Your whole host takes the field, however many soldiers you have raised.</p>`;
    this.openModal('March to Battle', r.name, body,
      `<button class="btn btn-small btn-ghost" data-action="close-march">Not Yet</button>
       <button class="btn btn-small btn-gold" data-action="march-confirm" data-value="${regionId}">Sound the Horns</button>`);
  }

  // ---------------- EVENTS ----------------
  showEvent(evt, onChoice) {
    this.eventChoice = onChoice;
    this.eventModal.classList.remove('hidden');
    this.eventModal.innerHTML = `
      <div class="event-card">
        <div class="event-kicker">${evt.kind === 'bad' ? 'A shadow on the road' : 'Fortune favours the bold'}</div>
        <h3>${evt.icon || '✦'} ${evt.title}</h3>
        <p>${evt.text}</p>
        <div class="event-choices">
          ${evt.choices.map((c, i) => `<button class="event-choice" data-choice="${i}"><b>${c.label}</b><span>${c.desc}</span></button>`).join('')}
        </div>
      </div>`;
    this.eventModal.querySelectorAll('[data-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.choice;
        this.eventModal.classList.add('hidden');
        this.audio.click();
        onChoice(i);
      });
    });
    this.audio.notification();
  }

  // ---------------- BATTLE HUD ----------------
  setBattle(on, title) {
    if (on) {
      this.hud.classList.add('is-battle');
      this.battleHud.classList.remove('hidden');
      $('b-battle-title').textContent = title || 'BATTLE';
      this.closeModal();
      this.closeBuild();
      this.hideSelection();
      this.eventModal.classList.add('hidden');
      this._battleFeedT.forEach(t => clearTimeout(t));
      $('battle-feed').innerHTML = '';
      $('battle-pause').classList.add('hidden');
      this.setBattleOrder('advance');
      this._updateRallyButton(0);
    } else {
      this.hud.classList.remove('is-battle');
      this.battleHud.classList.add('hidden');
      $('battle-banner').classList.add('hidden');
      $('battle-pause').classList.add('hidden');
      $('screen-fx').style.opacity = '';
      this.battleHud.querySelector('.battle-vitals').style.opacity = '';
    }
  }
  updateBattleHud(d) {
    $('b-ally-count').textContent = d.ally;
    $('b-enemy-count').textContent = d.enemy;
    $('b-ally-morale').style.width = clamp(d.allyMorale, 0, 100) + '%';
    $('b-enemy-morale').style.width = clamp(d.enemyMorale, 0, 100) + '%';
    $('b-hp').style.width = clamp(d.hp / d.maxHp * 100, 0, 100) + '%';
    $('b-hp-text').textContent = Math.ceil(d.hp);
    $('b-stam').style.width = clamp(d.stamina, 0, 100) + '%';
    $('b-stam-text').textContent = Math.round(d.stamina);
    const combo = $('b-combo');
    if (d.combo >= 2) { combo.classList.add('show'); combo.textContent = `COMBO ×${d.combo}`; }
    else combo.classList.remove('show');
    $('b-battle-obj').textContent = d.objective;
    this._updateRallyButton(d.rallyCd);
    this._updatePowerButton(d.powerCd);
    const vignette = d.incoming > 0.35 ? Math.min(0.7, d.incoming * 0.55) : 0;
    $('screen-fx').style.opacity = vignette ? String(vignette) : '';
  }
  _updateRallyButton(cd) {
    const btn = $('battle-rally');
    if (!btn) return;
    if (cd > 0) { btn.classList.add('cool'); btn.querySelector('span').textContent = Math.ceil(cd) + 's'; }
    else { btn.classList.remove('cool'); btn.querySelector('span').textContent = 'Rally'; }
  }
  _updatePowerButton(cd) {
    const btn = $('battle-powershot');
    if (!btn) return;
    const cooled = typeof cd === 'number' && cd > 0;
    if (cooled) { btn.classList.add('cool'); btn.querySelector('span').textContent = Math.ceil(cd) + 's'; }
    else { btn.classList.remove('cool'); btn.querySelector('span').textContent = 'Power Shot'; }
  }
  setBattleOrder(order) {
    document.querySelectorAll('.order-btn[data-order]').forEach(b => b.classList.toggle('active', b.dataset.order === order));
    const note = { advance: 'Formation: Advance', hold: 'Formation: Hold the Line', charge: 'Formation: Charge', follow: 'Formation: Follow Me', shield: 'Formation: Shieldwall' }[order];
    $('b-order-note').textContent = order ? (note || '') : '';
  }
  battleBanner(title, sub) {
    const el = $('battle-banner');
    el.innerHTML = `${title}<small>${sub || ''}</small>`;
    el.classList.remove('hidden');
    clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => el.classList.add('hidden'), 3200);
  }
  hideBattleBanner() { $('battle-banner').classList.add('hidden'); }
  battleFeed(text, bad) {
    const feed = $('battle-feed');
    if (!feed) return;
    const el = document.createElement('div');
    el.className = 'feed-item ' + (bad ? 'bad' : '');
    el.textContent = text;
    feed.appendChild(el);
    if (feed.childElementCount > 6) feed.firstChild.remove();
    setTimeout(() => el.remove(), 5200);
  }
  battleOrderToast(text) {
    const el = document.createElement('div');
    el.className = 'order-toast';
    el.textContent = text;
    this.battleHud.appendChild(el);
    setTimeout(() => el.remove(), 1050);
  }
  setBattlePaused(p) {
    $('battle-pause').classList.toggle('hidden', !p);
    if (p && this.game.battle) this.game.battle.ui.setBattlePausedState?.(true);
  }

  // ============================================================
  // MINIMAP
  // ============================================================
  updateMinimap() {
    if (this.game.mode === 'menu' || !this.game.state) return;
    const ctx = this.mmCtx;
    const S = this.mm.width;
    const base = this.game.world.getMinimapBase(256);
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(base, 0, 0, S, S);
    const px = (x) => (x / 300 + 0.5) * S;
    const pz = (z) => (z / 300 + 0.5) * S;
    // buildings
    for (const b of this.game.state.buildings) {
      ctx.fillStyle = b.type === 'keep' ? '#ffe2a0' : b.type === 'wall' ? '#a09a86' : '#e3b95c';
      ctx.fillRect(px(b.x) - 1.6, pz(b.z) - 1.6, 3.2, 3.2);
    }
    // camps
    for (const [id, r] of Object.entries(REGIONS)) {
      if (!r.camp) continue;
      const owned = this.game.state.regions[id].owned;
      ctx.beginPath();
      ctx.arc(px(r.camp.x), pz(r.camp.z), 4, 0, Math.PI * 2);
      ctx.fillStyle = owned ? '#7fae62' : '#c4634f';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // camera target & facing
    const c = this.game.engine.cameraCtl;
    ctx.save();
    ctx.translate(px(c.target.x), pz(c.target.z));
    ctx.rotate(-c.yaw);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 4); ctx.lineTo(0, 1); ctx.lineTo(-6, 4); ctx.closePath();
    ctx.fillStyle = 'rgba(255,244,208,.85)'; ctx.fill();
    ctx.restore();
    // border
    ctx.strokeStyle = 'rgba(227,185,92,.25)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
}

export { fmt, costHTML };
