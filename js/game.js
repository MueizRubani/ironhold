import * as THREE from '../assets/lib/three.module.js?v=160';
import { Audio } from './audio.js';
import { Engine } from './engine.js';
import { World } from './world.js';
import { Settlement } from './settlement.js';
import { Economy } from './economy.js';
import { Army } from './army.js';
import { UI } from './ui.js';
import { Battle } from './battle.js';
import {
  BUILDINGS, KEEP_LEVELS, REGIONS, TUTORIAL, AMBITIONS, EVENTS, TIPS, SEASONS, RESOURCES, TRADE_RES, UNITS
} from './config.js';

const SAVE_KEY = 'ironhold_campaign_v1';
const ADJ = {
  vale: [],
  greenfields: ['vale'],
  ironhills: ['vale'],
  riverlands: ['greenfields'],
  thornwood: ['greenfields', 'riverlands'],
  sunkenmarsh: ['ironhills', 'riverlands'],
  stormcrag: ['ironhills', 'sunkenmarsh'],
  // The Pale Lord's seat can only be stormed once every outer region is yours.
  blackspire: ['greenfields', 'ironhills', 'riverlands', 'thornwood', 'sunkenmarsh', 'stormcrag'],
};
const DAY_SECONDS = 240;
const TUTORIAL_HINTS = [
  'Click your Keep to inspect the seat of your power.',
  'Open Build (B) and raise a Woodcutter\'s Camp near the woods.',
  'Select the camp and assign 2 villagers to it.',
  'Build a Farmstead so your people do not go hungry.',
  'Open the Market (M) and sell 20 Wood for coin.',
  'Build a Cottage to raise your population cap.',
  'Build a Quarry, then gather 40 Stone.',
  'Upgrade your Keep to Level 2 — this unlocks the Barracks.',
  'Build a Barracks, then recruit 4 Militia.',
  'Open the Realm (R) and march on the Greenfields bandits.',
];

function rnd(a, b) { return a + Math.random() * (b - a); }

export class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.audio = new Audio();
    this.mode = 'boot';
    this.booted = false;
    this.last = performance.now();
    this._uiT = 0;
    this._mmT = 0;
    this._objT = 0;
    this._hintT = 0;
    this._autoT = 0;
    this._tickCount = 0;
    this._hoverT = 0;
    this.placing = null;
    this.eventChoice = null;
    this._speedBeforeEvent = 1;
    this.state = this.defaultStateShell();
  }

  defaultStateShell() {
    return {
      version: 1,
      gold: 160,
      resources: { wood: 55, stone: 15, food: 50, iron: 0, goods: 0, weapons: 0 },
      population: 5,
      happiness: 70,
      keepLevel: 1,
      buildings: [],
      nextBuildingId: 1,
      army: { militia: 0, spearman: 0, axeman: 0, archer: 0, arrowman: 0, crossbow: 0, knight: 0, cavalry: 0, warElephant: 0, catapult: 0 },
      training: { militia: 0, spearman: 0, axeman: 0, archer: 0, arrowman: 0, crossbow: 0, knight: 0, cavalry: 0, warElephant: 0, catapult: 0 },
      equipTier: 0,
      regions: { vale: { owned: true }, greenfields: { owned: false }, ironhills: { owned: false }, riverlands: { owned: false }, thornwood: { owned: false }, sunkenmarsh: { owned: false }, stormcrag: { owned: false }, blackspire: { owned: false } },
      regionProgress: { greenfields: 0, ironhills: 0, riverlands: 0, thornwood: 0, sunkenmarsh: 0, stormcrag: 0, blackspire: 0 },
      rivalPower: 1,
      rivalMomentum: 0,
      rivalNews: [],
      mail: [],
      mailSeq: 1,
      mailMarks: {},
      coalitionWarned: false,
      timeOfDay: 8.2,
      day: 1,
      season: 0,
      speed: 1,
      tutorial: 0,
      tutorialSeenKeep: false,
      ambitionsDone: [],
      extraInfluence: 0,
      stats: { goldEarned: 0, woodSold: 0, battlesWon: 0, enemiesSlain: 0, weaponsForged: 0, days: 1 },
      marketPressure: { wood: 0, stone: 0, food: 0, iron: 0, goods: 0, weapons: 0 },
      settings: { quality: 'medium', sound: true, music: true, autosave: true },
      eventTimer: 220,
      raidTimer: 280,
      raidCount: 0,
      settlersInvited: 0,
      lastEvent: null,
      realmName: 'The Ashen Vale',
    };
  }

  // ============================================================
  // BOOT
  // ============================================================
  async boot() {
    const ui0 = document.getElementById('load-status');
    const loadEl = document.getElementById('load-fill');
    const setP = (p, t) => { loadEl.style.width = (p * 100) + '%'; if (t) ui0.textContent = t; };
    setP(0.08, 'Forging the valley…');
    await nextFrame();
    this.audio = new Audio();
    this.engine = new Engine(this.canvas, this.audio);
    setP(0.2, 'Raising mountains and rivers…');
    await nextFrame();
    this.world = new World(this.engine);
    setP(0.52, 'Planting the first woods…');
    await nextFrame();
    this.economy = new Economy(this.engine, this.audio, this.state, this);
    this.army = new Army(this.state, this);
    setP(0.65, 'Raising the keep…');
    await nextFrame();
    this.settlement = new Settlement(this.engine, this.world, this.audio, this.state, this);
    // initial buildings
    this.state.buildings = this._initialBuildings();
    this.settlement.restore();
    this.syncWorld();
    setP(0.82, 'Setting the war table…');
    await nextFrame();
    this.ui = new UI(this);
    this.battle = new Battle(this.engine, this.audio, this);
    this._bind();
    this.ui.updateTopbar(true);
    this.ui.updateObjectives();
    this.engine.setQuality(this.state.settings.quality || 'medium');
    setP(1, 'Ready');
    await nextFrame();
    this.ui.hideLoading();
    this.ui.showMenu();
    this.ui.setLoading(1);
    this.mode = 'menu';
    this.booted = true;
    this.last = performance.now();
    this._scheduleFrame();
    // Only an active campaign may write the save. On the main menu this.state is
    // a throwaway shell; saving it here would wipe the player's real campaign.
    window.addEventListener('beforeunload', () => { if (this.booted && this.mode === 'overview') this.saveGame(false); });
    window.addEventListener('pointerdown', () => { this.audio.init(); this.audio.resume(); }, { once: true });
    window.game = this;
  }

  _initialBuildings() {
    const defs = [
      { type: 'keep', x: 0, z: 4, rot: 0 },
      { type: 'market', x: 14, z: 13, rot: -0.35 },
      { type: 'house', x: -12, z: 13, rot: 0.25 },
    ];
    const out = [];
    let id = 0;
    for (const d of defs) {
      const f = this.world.featureFactors(d.x, d.z);
      out.push({
        id: ++id, type: d.type, level: 1, x: d.x, z: d.z, rot: d.rot, workers: 0,
        y: this.world.heightAt(d.x, d.z),
        near: { wood: f.tree, stone: f.rock, iron: f.rock, food: Math.max(f.water, 1) },
        region: 'vale',
      });
    }
    this.state.nextBuildingId = id;
    return out;
  }

  _bind() {
    const input = this.engine.input;
    input.onCanvasClick = () => this.onClick();
    input.onKey = (code, e) => this.onKey(code, e);
    // Right-click is a universal "cancel": leave placement or clear selection.
    this.engine.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.mode !== 'overview') return;
      if (this.placing) this.cancelPlacement();
      else this.clearSelection();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'overview' && this.state.speed > 0) {
        this._resumeAfterHidden = true;
        this.setSpeed(0);
      } else if (!document.hidden && this._resumeAfterHidden) {
        this._resumeAfterHidden = false;
        this.setSpeed(1);
      }
    });
    this.settlement.onProduction = (res) => {
      this._tickCount++;
      for (const item of res.gains) this.ui.produceFloat(item.b, item.gains);
      this.state.stats.weaponsForged += (res.gains || []).reduce((a, g) => a + (g.gains.weapons || 0), 0);
    };
    this.economy.onGrowth = () => {
      this.audio.pop();
      this.ui.toast('A new villager joins your realm.', 'good');
      this.ui.updateTopbar(true);
    };
    this.economy.onStarvation = () => {
      this.ui.toast('Your people are starving. Build farms or buy food.', 'bad');
      this.ui.updateTopbar(true);
    };
    this.engine.input.onPointerLockChange = () => { };
  }

  // ============================================================
  // MENU / CAMPAIGN
  // ============================================================
  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  continueGame() {
    if (!this.loadGame()) { this.ui.toast('No campaign found.', 'warn'); return; }
    this.startCampaign();
  }

  newGameRequest() {
    if (this.hasSave()) {
      this.ui.openModal('New Campaign', 'Begin again?', `
        <p style="font-size:12px;line-height:1.7;color:#b6a687">Starting a new campaign will replace your autosaved realm. There is no second chance for the old one — only a new legend.</p>
        <div class="settings-actions"><button class="btn btn-small btn-gold" data-action="new-start">Begin a New Campaign</button><button class="btn btn-small btn-ghost" data-action="close">Keep My Realm</button></div>`,
        `<span>Your current campaign will be overwritten.</span>`);
    } else this.newGame();
  }

  newGame() {
    this.ui.closeModal();
    this.state = this.defaultStateShell();
    this._rebindState();
    this.state.buildings = this._initialBuildings();
    this.settlement.restore();
    this.syncWorld();
    this.world.setSeason(0);
    this.world.setTime(8.2);
    this.engine.cameraCtl.moveTo(0, 6, true);
    this.engine.cameraCtl.dist = this.engine.cameraCtl.desiredDist = 86;
    this.engine.cameraCtl.pitch = 0.82;
    this.engine.cameraCtl.desiredDist = 54;
    this.audio.setBattle(false);
    this.audio.setMusic(this.state.settings.music);
    this.audio.setEnabled(this.state.settings.sound);
    this.mode = 'overview';
    this.setSpeed(1);
    this.ui.hideMenu();
    this.ui.setRealmName(this.state.realmName);
    this.ui.updateTopbar(true);
    this.ui.updateObjectives();
    this.ui.hint(TUTORIAL_HINTS[0]);
    this.ui.showSelection(this.state.buildings[0]);
    this.settlement.select(this.state.buildings[0]);
    this.ui.toast('A ruined keep. Five souls. A valley full of possibility.', 'good');
    this.sendMail(null, 'Steward', 'The vale is yours', 'My lord, the old keep is ours and five souls look to you. Raise cottages and farms first, then a barracks. When the host is ready, the rival kingdoms will not wait forever.', 'good');
    this.sendMail(null, 'Marshal', 'A word on war', "Each rival kingdom must be broken in three battles: the Outer Ring, the Inner Fort, then the Warlord's Keep. Bring at least twenty soldiers before you march, and train them in the Barracks.", 'info');
    setTimeout(() => this.ui.toast('Build an industry. Then build an army. <b>Open the Chronicle (J)</b> if you lose your way.'), 2600);
    this.audio.horn();
  }

  _rebindState() {
    this.settlement.state = this.state;
    this.economy.state = this.state;
    this.army.state = this.state;
    this.economy.pressure = this.state.marketPressure;
    this.economy.eventMods = { prodMult: 1, happiness: 0, caravan: 0, caravanGood: null, storm: 0, festival: 0 };
    this.economy._prevPrices = {};
    this.economy.trend = {};
    this.economy._goldIn = 0; this.economy._goldOut = 0; this.economy.goldRate = 0;
    this.economy._starveT = 0; this.economy._growthT = 0; this.economy._rateT = 0;
    this.settlement.prodTimer = 0;
    this.settlement.effects = {};
    this.world.owned = {};
    for (const [id, r] of Object.entries(this.state.regions)) this.world.owned[id] = !!r.owned;
  }

  startCampaign() {
    this.mode = 'overview';
    this.ui.hideMenu();
    this.ui.setRealmName(this.state.realmName);
    this.audio.setBattle(false);
    this.audio.setMusic(this.state.settings.music !== false);
    this.audio.setEnabled(this.state.settings.sound !== false);
    this.engine.setQuality(this.state.settings.quality || 'medium');
    this.settlement.restore();
    this.syncWorld();
    this.world.setSeason(this.state.season || 0);
    this.world.setTime(this.state.timeOfDay || 8);
    this.engine.cameraCtl.moveTo(0, 6, true);
    this.engine.cameraCtl.dist = this.engine.cameraCtl.desiredDist = 54;
    this.setSpeed(this.state.speed || 1);
    this.ui.updateTopbar(true);
    this.ui.updateObjectives();
    this.ui.updateMinimap();
    this.ui.hint(this.hintForState());
    this.ui.toast('Welcome back to your realm.', 'good');
  }

  returnToMenu() {
    if (this.mode === 'battle') return;
    this.saveGame(false);
    this.mode = 'menu';
    this.ui.showMenu();
    this.ui.closeModal();
    this.audio.setBattle(false);
  }

  // ============================================================
  // STATE HELPERS
  // ============================================================
  toast(text, kind = '') { this.ui.toast(text, kind); }

  focusRegion(id) {
    const reg = REGIONS[id];
    if (!reg) return;
    const x = reg.camp ? reg.camp.x : reg.x;
    const z = reg.camp ? reg.camp.z : reg.z;
    this.engine.cameraCtl.moveTo(x, z);
    this.ui.hint(reg.bonusText);
    this.audio.click();
  }

  onInputShortage(b, eff) {
    const now = performance.now();
    if (now - (this._shortT || 0) < 18000) return;
    this._shortT = now;
    const def = BUILDINGS[b.type];
    const missing = Object.keys(def.consume || {}).map(r => RESOURCES[r]?.name || r).join(' and ');
    this.ui.toast(`<b>${def.name}</b> is short of ${missing}. Buy more, or assign fewer workers.`, 'warn');
  }

  onKeepUpgraded(level) {
    this.ui.toast(`Your Keep rises to <b>Level ${level}</b>. New construction and a larger host await.`, 'good');
    this.engine.cameraCtl.addShake(0.25);
    this.ui.updateTopbar(true);
    this.checkObjectives();
    this.saveGame(false);
  }

  // ============================================================
  // RIVAL KINGDOMS / WAR
  // ============================================================
  rivalScale() {
    const s = this.state;
    const owned = this.ownedCount();
    return Math.min(2.35, 1 + Math.max(0, (s.day || 1) - 1) / 55 + owned * 0.08 + (s.rivalMomentum || 0) * 0.06);
  }

  coalitionActive() {
    return this.ownedCount() >= 3 || this.army.total() >= 32 || (this.state.day || 1) >= 16;
  }

  unownedCamps() {
    return Object.entries(REGIONS)
      .filter(([id, r]) => r.camp && !this.state.regions[id]?.owned && !r.camp.final)
      .map(([id]) => id);
  }

  campFullComp(id, factor = 1) {
    const reg = REGIONS[id];
    if (!reg?.camp) return {};
    const progress = Math.max(0, Math.min(2, this.state.regionProgress?.[id] || 0));
    // A kingdom does not defend a border fort with a patrol. These are
    // field armies: ~50 men at the first ring, and a true host of over a
    // thousand at Blackspire. The battle AI still keeps them in one army.
    const host = (reg.camp.final ? 5.2 : 2.4) + progress * 0.7;
    const mult = this.rivalScale() * factor * host;
    const out = {};
    let total = 0;
    for (const [type, n] of Object.entries(reg.camp.comp)) {
      const amt = Math.max(1, Math.round(n * mult));
      out[type] = amt;
      total += amt;
    }
    // Keep the field inside the renderer's stable slot budget. Extras are
    // folded into the line as veterans rather than silently vanishing.
    const MAX_HOST = 1200;
    if (total > MAX_HOST) {
      const k = MAX_HOST / total;
      for (const type of Object.keys(out)) out[type] = Math.max(1, Math.floor(out[type] * k));
    }
    return out;
  }

  campBattleComp(id) {
    const progress = Math.max(0, Math.min(2, this.state.regionProgress?.[id] || 0));
    const factors = [0.9, 1.0, 1.18];
    const comp = this.campFullComp(id, factors[progress]);
    const reg = REGIONS[id];
    if (progress === 2 && reg?.camp) {
      // The last stand is always led by the strongest troops the rival has.
      if (reg.camp.comp.giant) comp.giant = (comp.giant || 0) + 1;
      if (reg.camp.comp.warlord) comp.warlord = (comp.warlord || 0) + 1;
    }
    return comp;
  }

  campStageTotal(id) {
    return Object.values(this.campBattleComp(id)).reduce((a, b) => a + b, 0);
  }

  campParts() { return 3; }

  sendMail(key, from, subject, body, kind = 'info') {
    const s = this.state;
    if (!s) return false;
    if (key) {
      const last = s.mailMarks?.[key];
      if (last !== undefined && (s.day || 1) - last < 2) return false;
      s.mailMarks = s.mailMarks || {};
      s.mailMarks[key] = s.day || 1;
    }
    s.mail = s.mail || [];
    s.mail.push({
      id: s.mailSeq = (s.mailSeq || 1) + 1,
      from, subject, body, kind, day: s.day || 1, read: false,
    });
    if (s.mail.length > 40) s.mail.shift();
    this.ui?.updateMailBadge?.();
    return true;
  }

  unreadMail() { return (this.state.mail || []).filter(m => !m.read).length; }

  openMail() { this.ui.openMail(); }

  checkMailRequests(dt) {
    this._mailT = (this._mailT || 0) + dt;
    if (this._mailT < 8) return;
    this._mailT = 0;
    const s = this.state;
    const cap = this.settlement.effects.popCap || 6;
    if ((s.resources.food || 0) < 8) {
      this.sendMail('food', 'Granary Keeper', 'The granaries are thin',
        'My lord, the grain is nearly gone. Build another farm, or buy food at the market before the people go hungry.', 'bad');
    } else if (s.happiness < 40) {
      this.sendMail('happy', 'Village Elder', 'The people are restless',
        'There is grumbling in the lanes. A tavern, a full granary, or a feast would lift their spirits.', 'warn');
    } else if (s.population >= cap) {
      this.sendMail('housing', 'Steward', 'Nowhere left to sleep',
        'Every cottage is full. Raise more cottages or upgrade the Keep, then invite settlers to the vale.', 'warn');
    } else if (this.settlement.idleWorkers() > 3) {
      this.sendMail('idle', 'Reeve', 'Idle hands',
        `${this.settlement.idleWorkers()} villagers have no work. Put them in a workshop or farm, or recruit them into the host.`, 'info');
    } else if (this.army.total() === 0 && s.tutorial >= 8) {
      this.sendMail('army', 'Marshal', 'The host is empty',
        'We have no soldiers, my lord. Build a barracks and recruit before a rival tests our walls.', 'bad');
    }
  }

  advanceRivals() {
    const s = this.state;
    const owned = this.ownedCount();
    s.rivalPower = this.rivalScale();
    s.rivalMomentum = Math.min(8, (s.rivalMomentum || 0) + 0.015 + owned * 0.004);
    this.world.setRivalPower(s.rivalPower);

    const camps = this.unownedCamps();
    if (!camps.length) return;
    const pick = camps[(s.day + owned) % camps.length];
    const reg = REGIONS[pick];
    if (s.day % 3 === 0) {
      this.sendMail('growth-' + s.day, 'Spymaster', 'The rivals are recruiting',
        `${reg.camp.leader} has raised new banners at ${reg.name}. Their host is now ${Math.round(s.rivalPower * 100)}% of its original strength. They grow stronger every day we wait.`, 'warn');
    }
    // Rivals sometimes bleed each other. Not often, and never enough to save you.
    if (s.day % 4 === 0 && Math.random() < 0.34 && camps.length >= 2) {
      const a = camps[Math.floor(Math.random() * camps.length)];
      let b = camps[Math.floor(Math.random() * camps.length)];
      if (a === b) b = camps[(camps.indexOf(a) + 1) % camps.length];
      const winner = Math.random() < 0.5 ? a : b;
      const loser = winner === a ? b : a;
      s.rivalMomentum = Math.min(8, (s.rivalMomentum || 0) + 0.12);
      s.rivalNews = s.rivalNews || [];
      s.rivalNews.push({ day: s.day, text: `${REGIONS[winner].short} raided ${REGIONS[loser].short}. The survivors are already rebuilding.` });
      if (s.rivalNews.length > 20) s.rivalNews.shift();
      this.sendMail('clash-' + s.day, 'Spymaster', 'Rivals clash at the border',
        `${REGIONS[winner].short} and ${REGIONS[loser].short} fought over the outer passes. Both sides lost men, but the winner is already recruiting. They will be stronger for it.`, 'info');
    }
    // The coalition forms when one warlord becomes too large to ignore.
    if (this.coalitionActive() && !s.coalitionWarned) {
      s.coalitionWarned = true;
      const count = camps.length;
      this.sendMail('coalition', 'Marshal', 'They are uniting against you',
        `My lord, ${count} rival camps have signed a blood pact. They will send their warbands together. Expect larger raids, more giants, and no mercy.`, 'bad');
      this.ui.toast('<b>Rival coalition formed.</b> The valley\'s warlords now march together against you.', 'bad');
    }
  }


  inviteInfo(kind = 'standard') {
    const cap = this.settlement.effects.popCap || 6;
    const free = Math.max(0, cap - this.state.population);
    const max = kind === 'grand' ? 8 : 3;
    const count = Math.min(max, free);
    const premium = kind === 'grand' ? 1.35 : 1;
    // Cost grows with population, but on a soft square-root curve: inviting
    // 3 settlers at pop 100 should cost ~120 gold, not ~500. The old linear
    // formula made late-game growth feel like a punishment.
    const scale = Math.sqrt(Math.max(0, this.state.population));
    const perGold = 18 + scale * 2.2;
    const perFood = 4 + scale * 0.35;
    const cost = {
      gold: Math.ceil(perGold * count * premium),
      food: Math.ceil(perFood * count * premium),
    };
    if (!count) return { ok: false, count: 0, cost, kind, reason: 'Housing is full - build more cottages or upgrade the Keep.' };
    if (!this.economy.canAfford(cost)) return { ok: false, count, cost, kind, reason: 'Not enough gold or food to attract settlers.' };
    return { ok: true, count, cost, kind, reason: '' };
  }

  inviteSettlers(kind = 'standard') {
    const inv = this.inviteInfo(kind);
    if (!inv.ok) { this.ui.toast(inv.reason, 'bad'); this.audio.error(); return false; }
    this.economy.pay(inv.cost);
    this.state.population += inv.count;
    this.state.settlersInvited = (this.state.settlersInvited || 0) + inv.count;
    this.state.happiness = Math.min(100, this.state.happiness + (kind === 'grand' ? 5 : 2));
    this.audio.notification();
    this.ui.toast(`<b>${inv.count} settlers</b> ${kind === 'grand' ? 'answer your lavish call' : 'answer your call'} and join the vale.`, 'good');
    this.ui.updateTopbar(true);
    this.checkObjectives();
    const keep = this.state.buildings.find(b => b.type === 'keep');
    if (keep) this.ui.showSelection(keep);
    this.saveGame(false);
    return true;
  }

  feastInfo() {
    const cost = {
      gold: Math.round(90 + this.state.day * 8 + this.state.population * 3),
      food: Math.round(30 + this.state.population * 1.5),
    };
    if ((this.economy.eventMods.festival || 0) > 20) {
      return { ok: false, cost, reason: 'A feast is already underway.' };
    }
    if (!this.economy.canAfford(cost)) return { ok: false, cost, reason: 'Not enough gold or food for a proper feast.' };
    return { ok: true, cost, reason: '' };
  }

  holdFeast() {
    const info = this.feastInfo();
    if (!info.ok) { this.ui.toast(info.reason, 'bad'); this.audio.error(); return false; }
    this.economy.pay(info.cost);
    this.economy.eventMods.festival = Math.max(this.economy.eventMods.festival || 0, 120);
    const cap = this.settlement.effects.popCap || 6;
    const drawn = Math.min(2, Math.max(0, cap - this.state.population));
    if (drawn) this.state.population += drawn;
    this.state.happiness = Math.min(100, this.state.happiness + 8);
    this.audio.levelup();
    this.ui.toast(`<b>The vale feasts.</b> ${drawn ? `+${drawn} travellers join the tables. ` : ''}Happiness and settler growth surge for two minutes.`, 'good');
    this.ui.updateTopbar(true);
    const keep = this.state.buildings.find(b => b.type === 'keep');
    if (keep) this.ui.showSelection(keep);
    this.saveGame(false);
    return true;
  }

  // ============================================================
  // RAIDS
  // ============================================================
  raidTier() {
    return Math.max(0, Math.min(12,
      Math.floor((this.state.day - 1) / 2) +
      (this.state.keepLevel - 1) +
      Math.floor((this.state.raidCount || 0) * 0.7)
    ));
  }

  raidComp() {
    const t = this.raidTier();
    const comp = {
      bandit: 13 + Math.floor(t * 4),
      raider: 4 + Math.floor(t * 2.5),
      archer: 2 + Math.floor(t * 1.8),
      brute: 1 + Math.floor(t * 1.1),
      soldier: t >= 3 ? 2 + Math.floor((t - 3) * 2.4) : 0,
      berserker: t >= 4 ? 1 + Math.floor((t - 4) * 1.0) : 0,
      knight: t >= 5 ? 1 + Math.floor((t - 5) * 0.9) : 0,
      elephant: t >= 7 ? 1 + Math.floor((t - 7) * 0.6) : 0,
      catapult: t >= 8 ? 1 + Math.floor((t - 8) * 0.5) : 0,
      giant: t >= 3 ? 1 + Math.floor((t - 3) / 2) : 0,
      warlord: t >= 9 ? 1 + Math.floor((t - 9) / 2) : 0,
    };
    for (const k of Object.keys(comp)) if (comp[k] <= 0) delete comp[k];
    // Rival kingdoms grow with the player, and a coalition pools their hosts.
    const coalition = this.coalitionActive();
    const camps = this.unownedCamps().length;
    const mult = this.rivalScale() * (coalition ? 1.22 + Math.max(0, camps - 1) * 0.05 : 1);
    for (const k of Object.keys(comp)) comp[k] = Math.max(1, Math.round(comp[k] * mult));
    return comp;
  }

  nextRaidDelay() {
    return Math.max(70, 215 - this.state.day * 6 - this.state.keepLevel * 12);
  }

  checkRaids(dt) {
    if (this.mode !== 'overview') return;
    if (this.state.tutorial < 6) return;
    if (!this.ui.modalRoot.classList.contains('hidden')) return;
    this.state.raidTimer = (this.state.raidTimer ?? 280) - dt;
    if (this.state.raidTimer > 0) return;
    this.raidWarning();
  }

  raidWarning() {
    const comp = this.raidComp();
    this._pendingRaidComp = comp;
    const total = Object.values(comp).reduce((a, b) => a + b, 0);
    const giants = comp.giant || 0;
    const coalition = this.coalitionActive();
    const coalitionCamps = this.unownedCamps().length;
    const tribute = Math.round(50 + this.state.day * 14 + this.state.keepLevel * 40 + (this.state.raidCount || 0) * 18 + total * 2.5);
    this._speedBeforeRaid = this.state.speed || 1;
    this._raidPending = true;
    this.state.raidTimer = this.nextRaidDelay();
    this.setSpeed(0);
    this.ui.openModal(coalition ? 'The Valley Coalition' : 'Raiders at the Gates', `${total} enemies march on the vale`, `
      <p style="font-size:12px;line-height:1.7;color:#b6a687">
        ${coalition ? `<b>${coalitionCamps} rival camps have united.</b> Their warbands march under one banner. ` : 'A warband has crossed the border. '}${giants ? `<b>${giants} giant${giants > 1 ? 's' : ''}</b> walk among them. ` : ''}
        Your host numbers <b>${this.army.total()}</b> and your people will not survive a sack.
      </p>
      <p style="font-size:11px;color:#8c7e66">Raid ${ (this.state.raidCount || 0) + 1 } - ${coalition ? 'The valley has decided you are the greater threat.' : (this.state.day >= 12 ? 'The border is lawless now.' : 'The border grows restless.')}</p>
      <div class="settings-actions">
        <button class="btn btn-small btn-gold" data-action="raid-fight">Take Command</button>
        <button class="btn btn-small btn-ghost" data-action="raid-pay" data-value="${tribute}" ${this.state.gold < tribute ? 'disabled' : ''}>Pay ${tribute} Gold</button>
      </div>`,
      `<span>Your host: ${this.army.total()} soldiers - ${this.army.rating()} rating</span>`);
  }

  beginRaidBattle() {
    const comp = this._pendingRaidComp || this.raidComp();
    this._pendingRaidComp = null;
    this.setSpeed(1);
    this.startRaid(comp);
  }

  payOffRaiders(cost) {
    this.ui.closeModal();
    this.state.gold = Math.max(0, this.state.gold - cost);
    this.state.raidCount = (this.state.raidCount || 0) + 1;
    this.state.raidTimer = this.nextRaidDelay();
    this.ui.toast(`The raiders take <b>${cost} gold</b> and ride off. The vale endures — for now.`, 'warn');
    this.setSpeed(this._speedBeforeRaid || 1);
    this.ui.updateTopbar(true);
    this.saveGame(false);
  }

  influence() {
    return Math.round((this.settlement.effects.influence || 0) + (this.state.extraInfluence || 0) +
      Object.values(this.state.regions).filter(r => r.owned).length * 2);
  }

  ownedCount() { return Object.values(this.state.regions).filter(r => r.owned).length; }

  regionMods(id) {
    const out = { wood: 1, stone: 1, food: 1, iron: 1, goods: 1, weapons: 1 };
    if (!id || !this.state.regions[id]?.owned) return out;
    const reg = REGIONS[id];
    if (!reg) return out;
    const m = reg.mods || {};
    if (m.all) for (const k of Object.keys(out)) out[k] *= m.all;
    for (const k of ['wood', 'stone', 'food', 'iron', 'goods', 'weapons']) if (m[k]) out[k] *= m[k];
    return out;
  }

  syncWorld() {
    for (const [id, r] of Object.entries(this.state.regions)) {
      this.world.owned[id] = !!r.owned;
      if (REGIONS[id].camp) {
        this.world.setRegionOwned(id, !!r.owned);
        const p = r.owned ? 3 : (this.state.regionProgress?.[id] || 0);
        this.world.setCampProgress(id, p);
      }
    }
    if (this.world.regionFlags.vale) this.world.regionFlags.vale.visible = !!this.state.regions.vale?.owned;
    this.world.setRivalPower(this.rivalScale ? this.rivalScale() : 1);
  }

  // ============================================================
  // INPUT
  // ============================================================
  onKey(code, e) {
    if (this.mode === 'battle') return;
    if ((e?.ctrlKey || e?.metaKey) && code === 'KeyS' && this.mode === 'overview') {
      e.preventDefault();
      this.saveGame(true);
      return;
    }
    const modalOpen = !this.ui.modalRoot.classList.contains('hidden');
    if (code === 'Escape') {
      if (this.placing) { this.cancelPlacement(); return; }
      if (modalOpen) { this.ui.closeModal(); return; }
      if (!this.ui.buildPanel.classList.contains('hidden')) { this.ui.closeBuild(); return; }
      // Esc must first clear a selected building or camp, not open Settings.
      if (this.ui.selectedBuilding) { this.clearSelection(); return; }
      this.ui.openSettings();
      return;
    }
    if (this.ui.handleShortcut && this.ui.handleShortcut(code, e)) return;
    if (modalOpen) return;
    if (this.mode === 'menu') return;
    if (this.mode === 'battle') return;
    if (e && (e.ctrlKey || e.metaKey || e.altKey)) return;
    if (this.placing) {
      if (code === 'KeyR') { this.settlement.ghostRot += Math.PI / 2; this.ui.hint('Rotated. LMB to place, Esc to cancel.'); return; }
    }
    switch (code) {
      case 'KeyB': this.ui.toggleBuild(); break;
      case 'KeyM': this.ui.openMarket(); break;
      case 'KeyT': this.ui.openArmy(); break;
      case 'KeyR': this.ui.openRealm(); break;
      case 'KeyJ': this.ui.openChronicle(); break;
      case 'KeyH': this.ui.openHelp(); break;
      case 'KeyF': {
        const out = this.engine.cameraCtl.toggleValleyView();
        this.ui.hint(out ? 'Whole valley view - scroll in to return' : 'Returned to the settlement');
        break;
      }
      case 'KeyU': this.upgradeAllAffordable(); break;
      case 'Space': e?.preventDefault(); this.setSpeed(this.state.speed === 0 ? 1 : 0); break;
      case 'Digit1': this.setSpeed(1); break;
      case 'Digit2': this.setSpeed(2); break;
      case 'Digit3': this.setSpeed(4); break;
      case 'Digit4': this.setSpeed(8); break;
      default: break;
    }
  }

  setSpeed(s) {
    if (this.mode === 'battle') return;
    this.state.speed = s;
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', +b.dataset.speed === s));
  }

  onClick() {
    if (this.mode !== 'overview') return;
    if (this.placing) { this.confirmPlacement(); return; }
    const b = this.settlement.pickAt();
    if (b) { this.selectBuilding(b); return; }
    const camp = this.pickCamp();
    if (camp) { this.selectCamp(camp); return; }
    this.clearSelection();
  }

  pickCamp() {
    const groups = [];
    for (const [id, g] of Object.entries(this.world.camps)) if (g.visible) groups.push(g);
    for (const [id, g] of Object.entries(this.world.friendlyCamps)) if (g.visible) groups.push(g);
    const hits = this.engine.raycast(groups, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.regionId) o = o.parent;
    return o ? o.userData.regionId : null;
  }

  selectBuilding(b) {
    this.settlement.select(b);
    this.settlement.hover(null);
    this.ui.showSelection(b);
    if (b.type === 'keep' && !this.state.tutorialSeenKeep) this.state.tutorialSeenKeep = true;
    this.audio.click();
  }

  selectCamp(regionId) {
    this.settlement.select(null);
    this.ui.showCamp(regionId);
    // camera ease toward camp
    const reg = REGIONS[regionId];
    if (reg?.camp) this.engine.cameraCtl.moveTo(reg.camp.x, reg.camp.z);
    this.audio.click();
  }

  clearSelection() {
    this.settlement.select(null);
    this.ui.hideSelection();
  }

  // ============================================================
  // BUILDING
  // ============================================================
  beginPlacement(type) {
    if (this.mode !== 'overview') return;
    const def = BUILDINGS[type];
    if (this.state.keepLevel < def.unlock) { this.ui.toast(`Requires Keep Level ${def.unlock}.`, 'warn'); return; }
    if (!this.economy.canAfford(def.cost)) { this.ui.toast('Not enough resources.', 'bad'); return; }
    this.placing = type;
    this.settlement.beginPlacement(type);
    this.ui.showPlacement(type, def.cost);
    this.ui.hideSelection();
    this.ui.hint('LMB to place · R to rotate · Esc to cancel');
    this.canvas.classList.add('cursor-build');
    this.audio.buildMenu();
  }

  confirmPlacement() {
    if (!this.placing) return;
    const g = this.settlement.ghost;
    if (!g) return;
    const type = this.placing;
    const x = this.settlement.ghostPos.x, z = this.settlement.ghostPos.z;
    if (!this.settlement.ghostValid) {
      this.ui.toast(this.settlement.ghostBonus?.reason || 'Cannot build there.', 'bad');
      this.audio.error();
      return;
    }
    const def = BUILDINGS[type];
    if (!this.economy.canAfford(def.cost)) { this.ui.toast('Not enough resources.', 'bad'); this.audio.error(); return; }
    const b = this.settlement.place(type, x, z, this.settlement.ghostRot);
    if (b) {
      this.ui.updateTopbar(true);
      this.ui.updateObjectives();
      this.checkObjectives();
      const canBuildAnother = this.economy.canAfford(def.cost);
      if (canBuildAnother) {
        // Stay in placement mode: the player can raise a whole row of buildings
        // without reopening the Build panel and reselecting the type.
        this.placing = type;
        const info = this.settlement.updateGhost(this.settlement.ghostPos, this.settlement.ghostRot);
        if (info) this.ui.updatePlacement(info.ok, info.reason);
        this.ui.showPlacement(type, def.cost);
        this.ui.hint('Placed. Click to place another - Esc to finish.');
        this.ui.toast(`<b>${def.name}</b> raised. Click to place another, or press <b>Esc</b> to finish.`, 'good');
      } else {
        this.cancelPlacement();
        this.selectBuilding(b);
        this.ui.toast(`<b>${def.name}</b> raised. ${def.workers ? 'Assign workers to begin production.' : ''}`, 'good');
      }
    }
  }

  cancelPlacement() {
    this.placing = null;
    this.settlement.cancelPlacement();
    this.ui.hidePlacement();
    this.canvas.classList.remove('cursor-build');
  }

  upgradeBuilding(b) {
    const ok = this.settlement.upgrade(b.id);
    if (ok) {
      this.ui.updateTopbar(true);
      this.checkObjectives();
      const updated = this.state.buildings.find(x => x.id === b.id);
      if (updated) {
        this.ui.showSelection(updated);
        this.ui.toast(`<b>${BUILDINGS[updated.type].name}</b> upgraded to level ${updated.level}.`, 'good');
      }
    }
  }

  upgradeAllAffordable(quiet = false) {
    const s = this.state;
    let count = 0;
    const spent = { gold: 0, wood: 0, stone: 0, food: 0, iron: 0, goods: 0, weapons: 0 };
    const list = [...s.buildings].sort((a, b) => {
      const ak = a.type === 'keep' ? 1 : 0, bk = b.type === 'keep' ? 1 : 0;
      return ak - bk || a.level - b.level;
    });
    for (const b of list) {
      const max = b.type === 'keep' ? KEEP_LEVELS.length - 1 : 10;
      if (b.level >= max) continue;
      const cost = b.type === 'keep'
        ? KEEP_LEVELS[Math.min(max, b.level + 1)].cost
        : this.settlement.upgradeCost(b);
      if (!cost || !this.economy.canAfford(cost)) continue;
      for (const [k, v] of Object.entries(cost)) spent[k] = (spent[k] || 0) + v;
      if (!this.settlement.upgrade(b.id)) continue;
      count++;
    }
    if (!count) {
      if (!quiet) {
        this.ui.toast('Nothing can be upgraded with what we have right now.', 'warn');
        this.audio.error();
      }
      return 0;
    }
    this.ui.updateTopbar(true);
    this.ui.renderBuild();
    const keep = s.buildings.find(b => b.type === 'keep');
    if (keep && this.ui.selectedBuilding && this.ui.selectedBuilding.type === 'keep') this.ui.showSelection(keep);
    if (!quiet) this.audio.levelup();
    this.saveGame(false);
    if (!quiet) this.ui.toast(`<b>${count} upgrade${count > 1 ? 's' : ''}</b> completed at once. Spent ${Math.round(spent.gold)} gold and the needed materials.`, 'good');
    return count;
  }

  upgradeAllHouses() {
    const s = this.state;
    const housing = new Set(['house', 'longhouse', 'manor']);
    const list = s.buildings
      .filter(b => housing.has(b.type) && b.level < 10)
      .sort((a, b) => a.level - b.level);
    if (!list.length) {
      this.ui.toast('Every cottage, longhouse, and manor is already fully upgraded.', 'warn');
      this.audio.error();
      return 0;
    }
    let count = 0;
    let totalGold = 0;
    for (const b of list) {
      const cost = this.settlement.upgradeCost(b);
      if (!cost || !this.economy.canAfford(cost)) continue;
      if (!this.settlement.upgrade(b.id)) continue;
      count++;
      totalGold += cost.gold || 0;
    }
    if (!count) {
      this.ui.toast('Not enough materials to upgrade any housing right now.', 'warn');
      this.audio.error();
      return 0;
    }
    this.ui.updateTopbar(true);
    this.ui.renderBuild();
    if (this.ui.selectedBuilding && housing.has(this.ui.selectedBuilding.type)) {
      this.ui.showSelection(this.ui.selectedBuilding);
    }
    this.audio.levelup();
    this.saveGame(false);
    this.ui.toast(`<b>${count} home${count > 1 ? 's' : ''}</b> upgraded at once for ${Math.round(totalGold)} gold. More villagers can move in.`, 'good');
    return count;
  }

  trainingCost(type) {
    const lvl = this.state.training?.[type] || 0;
    if (lvl >= 3) return null;
    const u = UNITS[type];
    if (!u) return null;
    return {
      gold: Math.round(55 + (u.hp || 80) * 0.22 + lvl * 90),
      food: 4 + Math.round((u.hp || 80) * 0.025) + lvl * 4,
      iron: lvl >= 2 ? 4 : 0,
    };
  }

  trainUnit(type) {
    const s = this.state;
    if (!this.settlement.effects.recruit) { this.ui.toast('Build a Barracks before training soldiers.', 'bad'); this.audio.error(); return false; }
    if (!(s.army[type] > 0)) { this.ui.toast('You have no soldiers of that type to train.', 'warn'); return false; }
    const cost = this.trainingCost(type);
    if (!cost) { this.ui.toast('These soldiers are already veterans.', 'warn'); return false; }
    if (!this.economy.canAfford(cost)) { this.ui.toast('Not enough gold, food, or iron for training.', 'bad'); this.audio.error(); return false; }
    this.economy.pay(cost);
    s.training = s.training || {};
    s.training[type] = (s.training[type] || 0) + 1;
    this.audio.levelup();
    const u = UNITS[type];
    this.ui.toast(`<b>${u.name}</b> trained to <b>Veteran ${s.training[type]}</b>. +${s.training[type] * 10}% health and +${s.training[type] * 8}% damage.`, 'good');
    this.ui.updateTopbar(true);
    if (this.ui.modalType === 'army') this.ui.openArmy();
    this.saveGame(false);
    return true;
  }

  trainAllUnits() {
    let trained = 0;
    for (const [type, n] of Object.entries(this.state.army)) {
      if (!n || (this.state.training?.[type] || 0) >= 3) continue;
      const cost = this.trainingCost(type);
      if (!cost || !this.economy.canAfford(cost)) continue;
      this.economy.pay(cost);
      this.state.training = this.state.training || {};
      this.state.training[type] = (this.state.training[type] || 0) + 1;
      trained++;
    }
    if (!trained) { this.ui.toast('No unit could be trained with current resources.', 'warn'); this.audio.error(); return 0; }
    this.audio.levelup();
    this.ui.toast(`<b>${trained} unit group${trained > 1 ? 's' : ''}</b> trained. Your host grows deadlier.`, 'good');
    this.ui.updateTopbar(true);
    if (this.ui.modalType === 'army') this.ui.openArmy();
    this.saveGame(false);
    return trained;
  }

  demolishBuilding(b) {
    this.ui.showSelection(b);
    this.ui.openModal('Demolish', BUILDINGS[b.type].name, `
      <p style="font-size:12px;line-height:1.7;color:#b6a687">Tear down this building? You recover half of its construction cost, and any assigned workers return to the village.</p>
      <div class="settings-actions">
        <button class="btn btn-small danger" data-action="demolish-confirm" data-value="${b.id}">Demolish</button>
        <button class="btn btn-small btn-ghost" data-action="close">Keep It</button>
      </div>`, '');
  }

  confirmDemolish(id) {
    this.ui.closeModal();
    const target = this.state.buildings.find(b => b.id === id);
    const name = target ? BUILDINGS[target.type].name : 'Building';
    if (!this.settlement.demolish(id)) return;
    this.ui.hideSelection();
    this.ui.toast(`<b>${name}</b> torn down. Half of its cost was recovered.`, '');
    this.ui.updateTopbar(true);
    this.ui.updateObjectives();
    this.saveGame(false);
  }

  // ============================================================
  // REGIONS / WAR
  // ============================================================
  canMarch(id) {
    const reg = REGIONS[id];
    if (!reg?.camp) return { ok: false, reason: 'No enemy here.' };
    if (this.state.regions[id]?.owned) return { ok: false, reason: 'Already yours.' };
    if (this.army.total() === 0) return { ok: false, reason: 'Recruit soldiers first.' };
    const adj = ADJ[id] || [];
    const mustHoldAll = !!reg.camp.final;
    const holds = mustHoldAll ? adj.every(a => this.state.regions[a]?.owned) : adj.some(a => this.state.regions[a]?.owned);
    if (!holds) {
      return { ok: false, reason: mustHoldAll
        ? 'Hold every outer region before you march on Blackspire.'
        : 'Requires ' + adj.map(a => REGIONS[a].short).join(' or ') };
    }
    return { ok: true };
  }

  march(id) {
    const can = this.canMarch(id);
    if (!can.ok) { this.ui.toast(can.reason, 'bad'); this.audio.error(); return; }
    this.ui.confirmMarch(id);
  }

  startMarch(id) {
    const reg = REGIONS[id];
    if (!reg?.camp) return;
    this.ui.closeModal();
    this.ui.closeBuild();
    this.clearSelection();
    const progress = Math.max(0, Math.min(2, this.state.regionProgress?.[id] || 0));
    const comp = this.campBattleComp(id);
    const enemyComp = [];
    for (const [type, n] of Object.entries(comp)) for (let i = 0; i < n; i++) enemyComp.push(type);
    const stageNames = ['Outer Ring', 'Inner Fort', "Warlord's Keep"];
    this.saveGame(false);
    this.mode = 'battle';
    this.audio.init();
    this.audio.resume();
    this.battle.start({
      regionId: id,
      campPart: progress,
      title: 'THE BATTLE OF ' + reg.name.toUpperCase(),
      subtitle: `${reg.camp.leader} holds the ${stageNames[progress]}. ${3 - progress} battle${3 - progress > 1 ? 's' : ''} remain to take this kingdom.`,
      friendlyComp: this.army.composition(),
      enemyComp,
      loot: reg.camp.loot,
      influence: reg.camp.influence,
      defense: false,
      // Large hosts are already a threat through numbers. Slightly softer
      // per-man stats keep a 1,200-man garrison hard without being unfair.
      enemyStatScale: Math.min(1.28, 0.80 + (this.rivalScale() - 1) * 0.28 + progress * 0.06),
    });
    this.ui.updateTopbar(true);
  }

  startRaid(comp = null) {
    const c = comp || this.raidComp();
    const enemyComp = [];
    for (const [type, n] of Object.entries(c)) for (let i = 0; i < n; i++) enemyComp.push(type);
    const friendly = this.army.composition();
    // The village garrison always answers the alarm, even if the field army is away.
    while (friendly.length < 8) friendly.push(friendly.length < 5 ? 'militia' : 'archer');
    this.saveGame(false);
    this.mode = 'battle';
    this.ui.closeModal();
    this.audio.init(); this.audio.resume();
    this.battle.start({
      regionId: null,
      title: 'DEFEND THE VALE',
      subtitle: `${enemyComp.length} raiders at the gates. Drive them off.`,
      friendlyComp: friendly,
      enemyComp,
      loot: 80 + enemyComp.length * 9 + this.raidTier() * 30,
      influence: 4 + Math.floor(enemyComp.length / 6),
      defense: true,
      enemyStatScale: Math.min(1.32, 0.82 + (this.rivalScale() - 1) * 0.28),
    });
  }

  finishBattle(result) {
    if (!result) { this.mode = 'overview'; this.ui.setBattle(false); return; }
    this.mode = 'overview';
    this.audio.setBattle(false);
    this.army.applyCasualties(result.losses);
    const lossTotal = Object.values(result.losses).reduce((a, b) => a + b, 0);
    if (!result.victory) {
      // A defeat costs more than men: the rival retakes ground and the realm bleeds.
      this.army.loseFraction(0.22);
      const lostGold = Math.round(this.state.gold * 0.12);
      this.state.gold = Math.max(0, this.state.gold - lostGold);
      let lostGoods = 0;
      for (const r of ['wood', 'stone', 'food', 'iron']) {
        const lost = Math.round((this.state.resources[r] || 0) * 0.12);
        this.state.resources[r] = Math.max(0, (this.state.resources[r] || 0) - lost);
        lostGoods += lost;
      }
      let retaken = false;
      if (result.regionId) {
        const cur = this.state.regionProgress?.[result.regionId] || 0;
        if (cur > 0) {
          this.state.regionProgress[result.regionId] = cur - 1;
          this.world.setCampProgress(result.regionId, cur - 1);
          retaken = true;
        }
      }
      this.state.rivalMomentum = Math.min(8, (this.state.rivalMomentum || 0) + 0.35);
      this.state.rivalPower = this.rivalScale();
      this.sendMail('defeat-' + this.state.day, 'Marshal', 'A black day',
        `We were broken in the field. ${lossTotal} soldiers are lost, ${lostGold} gold and ${lostGoods} goods are gone.${retaken ? ' The enemy has retaken one of the rings we captured.' : ''} The rival grows bolder.`, 'bad');
      this.ui.toast(`<b>Defeat.</b> You lost ${lossTotal} soldiers, ${lostGold} gold and ${lostGoods} goods.${retaken ? ' The rival retook a captured ring.' : ''}`, 'bad');
      this.engine.cameraCtl.moveTo(0, 6);
    } else {
      this.state.stats.battlesWon++;
      this.state.stats.enemiesSlain += result.enemyLosses || 0;
      this.state.rivalMomentum = Math.max(0, (this.state.rivalMomentum || 0) - 0.12);
      if (result.defense) {
        this.state.raidCount = (this.state.raidCount || 0) + 1;
        this.state.raidTimer = this.nextRaidDelay();
        this.state.gold += result.loot;
        this.state.stats.goldEarned += result.loot;
        this.economy.eventMods.festival = Math.max(this.economy.eventMods.festival, 60);
        this.ui.toast(`<b>Raiders broken.</b> +${result.loot} gold, the vale is safe.`, 'good');
        this.sendMail('raid-win-' + this.state.day, 'Marshal', 'The gates held',
          `The warband is broken. We took ${result.loot} gold from their baggage train. The vale is safe, for now.`, 'good');
      } else if (result.regionId) {
        const reg = REGIONS[result.regionId];
        const cur = this.state.regionProgress?.[result.regionId] || 0;
        const next = Math.min(3, cur + 1);
        const final = next >= 3;
        const loot = final ? result.loot : Math.round(result.loot * 0.28);
        const inf = final ? result.influence : Math.round(result.influence * 0.3);
        this.state.gold += loot;
        this.state.extraInfluence += inf;
        this.state.stats.goldEarned += loot;
        this.state.regionProgress[result.regionId] = next;
        if (final) {
          this.state.regions[result.regionId].owned = true;
          this.world.setRegionOwned(result.regionId, true);
          this.ui.toast(`<b>${reg.name} is yours.</b> +${loot} gold - +${inf} renown. ${reg.bonusText}.`, 'good');
          this.sendMail('captured-' + result.regionId, 'Marshal', `${reg.name} is ours`,
            `${reg.camp.leader} is dead or in chains. ${reg.name} flies your banner. The rival kingdom is broken.`, 'good');
          this.engine.cameraCtl.moveTo(reg.x, reg.z);
          if (reg.camp.final) this.showVictory();
        } else {
          this.world.setCampProgress(result.regionId, next);
          const ring = ['the outer ring', 'the inner fort'][next - 1] || 'the outer ring';
          this.ui.toast(`<b>${ring[0].toUpperCase() + ring.slice(1)} of ${reg.name} is captured.</b> +${loot} gold - +${inf} renown. ${3 - next} battle${3 - next > 1 ? 's' : ''} remain.`, 'good');
          this.sendMail('progress-' + result.regionId + '-' + next, 'Marshal', `${reg.name}: ${next}/3 captured`,
            `We have taken ${ring}. The enemy still holds the heart of ${reg.name}. Their remaining host is stronger and waiting.`, 'info');
          this.engine.cameraCtl.moveTo(reg.x, reg.z);
        }
      }
      this.audio.levelup();
      if (lossTotal > 0) {
        setTimeout(() => this.ui.toast(`You lost <b>${lossTotal}</b> soldiers. ${result.playerKills} fell to your own blade.`, 'warn'), 1300);
      } else {
        setTimeout(() => this.ui.toast(`Not a single soldier lost. ${result.playerKills} enemies fell to your blade.`, 'good'), 1300);
      }
    }
    this.engine.input.keys.clear();
    if ((this.state.speed || 0) <= 0) this.setSpeed(1);
    this.ui.setBattle(false);
    this.ui.updateTopbar(true);
    this.ui.updateObjectives();
    this.checkObjectives();
    this.saveGame(false);
  }

  retreatBattle(result = {}) {
    const surrender = !!result.surrender;
    const defense = !!result.defense;
    // Only soldiers who actually fell are removed. The rest of the host
    // marches home alive, which is the whole point of a withdrawal.
    this.army.applyCasualties(result.losses || {});
    const lossTotal = Object.values(result.losses || {}).reduce((a, b) => a + b, 0);
    let lostGold = 0, lostGoods = 0, retaken = false;

    const goldRate = surrender ? 0.16 : 0.07;
    const goodsRate = surrender ? 0.11 : 0.05;
    lostGold = Math.round(this.state.gold * goldRate);
    this.state.gold = Math.max(0, this.state.gold - lostGold);
    for (const r of ['wood', 'stone', 'food', 'iron']) {
      const lost = Math.round((this.state.resources[r] || 0) * goodsRate);
      this.state.resources[r] = Math.max(0, (this.state.resources[r] || 0) - lost);
      lostGoods += lost;
    }

    if (!defense && surrender && result.regionId) {
      const cur = this.state.regionProgress?.[result.regionId] || 0;
      if (cur > 0) {
        this.state.regionProgress[result.regionId] = cur - 1;
        this.world.setCampProgress(result.regionId, cur - 1);
        retaken = true;
      }
    }
    this.state.rivalMomentum = Math.min(8, (this.state.rivalMomentum || 0) + (surrender ? 0.32 : 0.14));
    this.state.rivalPower = this.rivalScale();
    this.world.setRivalPower?.(this.state.rivalPower);

    if (defense) {
      this.state.raidTimer = this.nextRaidDelay();
      this.sendMail('withdraw-' + this.state.day, 'Marshal',
        surrender ? 'The vale is surrendered' : 'We quit the field',
        `${lossTotal} soldiers fell covering the withdrawal. The raiders took ${lostGold} gold and ${lostGoods} goods, and the village is poorer for it. The survivors are alive - that is not nothing.`, 'warn');
      this.ui.toast(`<b>${surrender ? 'Surrender' : 'Retreat'}.</b> ${lossTotal} soldiers fell. Raiders looted ${lostGold} gold and ${lostGoods} goods. Your survivors came home.`, 'warn');
    } else {
      this.sendMail('retreat-' + (result.regionId || 'field') + '-' + this.state.day, 'Marshal',
        surrender ? 'We yield the field' : 'The retreat is sounded',
        `${lossTotal} soldiers fell in the withdrawal. We abandoned ${lostGold} gold and ${lostGoods} goods in the camps.${retaken ? ' The enemy has retaken one of the rings we held.' : ''} The rest of the host lives to march again.`, surrender ? 'bad' : 'warn');
      this.ui.toast(`<b>${surrender ? 'Surrender' : 'Retreat'}.</b> ${lossTotal} soldiers fell, ${lostGold} gold and ${lostGoods} goods lost.${retaken ? ' A captured ring was yielded.' : ''} Your survivors live.`, surrender ? 'bad' : 'warn');
    }

    this.mode = 'overview';
    this.audio.setBattle(false);
    this.ui.setBattle(false);
    this.engine.cameraCtl.moveTo(0, 6);
    this.engine.input.keys.clear();
    if ((this.state.speed || 0) <= 0) this.setSpeed(1);
    this.ui.updateTopbar(true);
    this.ui.updateObjectives();
    this.checkObjectives();
    this.saveGame(false);
  }

  showVictory() {
    this.state.extraInfluence += 40;
    const body = `
      <div style="text-align:center;padding:10px 0 4px">
        <div style="font-size:34px;color:#e3b95c;margin-bottom:6px">♛</div>
        <h3 style="font-family:var(--serif);font-size:30px;color:#f5e4bd;font-weight:500;letter-spacing:.04em">Warlord of the Vale</h3>
        <p style="font-family:var(--serif);font-style:italic;font-size:14px;color:#bfae8d;margin:10px auto 16px;max-width:480px;line-height:1.7">Blackspire has fallen. The Pale Lord is broken, the river roads are yours, and the smoke of your workshops rises over a valley that once held only ruins.</p>
      </div>
      <div class="market-top">
        <div class="mkt-stat"><span>Regions ruled</span><b>${this.ownedCount()} / 8</b><small>One banner over the vale</small></div>
        <div class="mkt-stat"><span>Gold earned</span><b>${Math.floor(this.state.stats.goldEarned)}</b><small>Across your rise</small></div>
        <div class="mkt-stat"><span>Battles won</span><b>${this.state.stats.battlesWon}</b><small>${this.state.stats.enemiesSlain} enemies slain</small></div>
      </div>
      <p style="font-size:11px;color:#91836b;margin-top:14px;text-align:center">Your campaign continues. The valley is yours to build.</p>`;
    setTimeout(() => {
      this.ui.openModal('The Chronicle Is Yours', 'The Ashen Vale is united', body,
        `<span>Renown ${this.influence()}</span><button class="btn btn-small btn-gold" data-action="continue-victory">Continue Ruling</button>`);
    }, 1400);
  }

  // ============================================================
  // EVENTS
  // ============================================================
  checkEvents(dt) {
    if (this.mode !== 'overview') return;
    if (this.state.tutorial < 4) return;
    if (!this.ui.modalRoot.classList.contains('hidden')) return;
    this.state.eventTimer -= dt;
    if (this.state.eventTimer <= 0) {
      this.state.eventTimer = rnd(150, 240);
      this.triggerEvent();
    }
  }

  triggerEvent() {
    const day = this.state.day;
    const pool = EVENTS.filter(e => day >= (e.minDay || 1) && e.id !== this.state.lastEvent);
    const weighted = [];
    for (const e of pool) for (let i = 0; i < (e.weight || 1); i++) weighted.push(e);
    const evt = weighted[Math.floor(Math.random() * weighted.length)];
    if (!evt) return;
    this.state.lastEvent = evt.id;
    this._speedBeforeEvent = this.state.speed;
    this.setSpeed(0);
    this.ui.showEvent(evt, (i) => this.resolveEvent(evt, i));
  }

  resolveEvent(evt, choiceIndex) {
    const choice = evt.choices[choiceIndex];
    const e = choice?.effect;
    switch (e) {
      case 'caravan': {
        const good = TRADE_RES[Math.floor(Math.random() * TRADE_RES.length)];
        this.economy.activateCaravan(good, 90);
        this.ui.toast(`Caravan arrived. <b>${RESOURCES[good].name}</b> sells at a premium for 90s.`, 'good');
        break;
      }
      case 'payBandits':
        this.state.gold = Math.max(0, this.state.gold - 80);
        this.ui.toast('You pay the toll. The road is quiet — for now.', 'warn');
        break;
      case 'fightBandits':
        this.setSpeed(1);
        this.startRaid();
        return;
      case 'migrants':
        this.state.population = Math.min(this.settlement.effects.popCap, this.state.population + 3);
        this.ui.toast('Three families settle in your vale.', 'good');
        break;
      case 'festival':
        this.economy.eventMods.festival = 120;
        this.ui.toast('A festival lifts every heart. Happiness rises for two minutes.', 'good');
        break;
      case 'vein':
        this.economy.gainResource('iron', 60);
        this.ui.toast('<b>+60 iron</b> from the new seam.', 'good');
        break;
      case 'storm':
        this.economy.eventMods.storm = 90;
        this.ui.toast('The long rain slows production by 20% for 90s.', 'warn');
        break;
      case 'taxman':
        this.state.gold += 200;
        this.state.stats.goldEarned += 200;
        this.ui.toast('The assessor\'s silver fills your coffers. <b>+200 gold</b>.', 'good');
        break;
      case 'refuseTaxman':
        this.state.extraInfluence += 8;
        this.ui.toast('You refuse. The valley whispers of your spine. <b>+8 renown</b>.', 'good');
        break;
      default: break;
    }
    this.setSpeed(this._speedBeforeEvent || 1);
    this.ui.updateTopbar(true);
  }

  // ============================================================
  // OBJECTIVES / TUTORIAL
  // ============================================================
  getObjectives() {
    const s = this.state;
    if (s.tutorial < TUTORIAL.length) {
      const out = TUTORIAL.map((t, i) => ({
        title: t.title,
        detail: i === s.tutorial ? t.text : undefined,
        done: i < s.tutorial,
        active: i === s.tutorial,
        reward: t.reward,
      }));
      return out;
    }
    const out = [];
    for (const a of AMBITIONS) {
      const done = s.ambitionsDone.includes(a.id);
      out.push({ title: a.title, detail: done ? undefined : a.text, done, active: false, reward: a.reward });
    }
    if (out.length && !out.every(o => o.done)) {
      const idx = out.findIndex(o => !o.done);
      if (idx >= 0) out[idx].active = true;
    }
    return out;
  }

  checkObjectives() {
    if (this.mode === 'battle' || !this.state) return;
    const s = this.state;
    let changed = false;
    while (s.tutorial < TUTORIAL.length) {
      const step = TUTORIAL[s.tutorial];
      if (!this.stepComplete(step.id)) break;
      // grant reward
      const r = step.reward;
      if (r.gold) { this.state.gold += r.gold; this.state.stats.goldEarned += r.gold; }
      if (r.wood) this.economy.gainResource('wood', r.wood);
      if (r.stone) this.economy.gainResource('stone', r.stone);
      if (r.food) this.economy.gainResource('food', r.food);
      if (r.influence) this.state.extraInfluence += r.influence;
      this.audio.levelup();
      this.ui.toast(`<b>${step.title}</b> complete. Reward: ${Object.entries(r).map(([k, v]) => `+${v} ${k}`).join(', ')}`, 'good');
      s.tutorial++;
      changed = true;
      if (s.tutorial === TUTORIAL.length) {
        setTimeout(() => {
          this.ui.toast('<b>The tutorial is complete.</b> Your Chronicle now records your ambitions.', 'good');
          this.ui.updateObjectives();
        }, 1200);
      }
    }
    if (changed) {
      this.ui.updateObjectives();
      this.ui.updateTopbar(true);
      this.saveGame(false);
    }
    // ambitions
    if (s.tutorial >= TUTORIAL.length) {
      for (const a of AMBITIONS) {
        if (s.ambitionsDone.includes(a.id)) continue;
        if (!this.ambitionComplete(a.id)) continue;
        s.ambitionsDone.push(a.id);
        if (a.reward.gold) { this.state.gold += a.reward.gold; this.state.stats.goldEarned += a.reward.gold; }
        if (a.reward.influence) this.state.extraInfluence += a.reward.influence;
        this.audio.levelup();
        this.ui.toast(`<b>${a.title}</b> achieved. +${a.reward.gold || 0} gold · +${a.reward.influence || 0} renown.`, 'good');
        this.ui.updateObjectives();
        changed = true;
      }
    }
    return changed;
  }

  stepComplete(id) {
    const s = this.state, st = this.settlement;
    switch (id) {
      case 'keep': return !!s.tutorialSeenKeep;
      case 'lumber': return st.countType('woodcutter') >= 1;
      case 'workers': {
        const w = s.buildings.filter(b => b.type === 'woodcutter').reduce((a, b) => a + b.workers, 0);
        return w >= 2;
      }
      case 'farm': return st.countType('farm') >= 1;
      case 'sell': return (s.stats.woodSold || 0) >= 20;
      case 'house': return st.countType('house') >= 2;
      case 'stone': return st.countType('quarry') >= 1 && (s.resources.stone || 0) >= 40;
      case 'keep2': return s.keepLevel >= 2;
      case 'barracks': return st.countType('barracks') >= 1 && this.army.total() >= 4;
      case 'battle': return !!s.regions.greenfields.owned;
      default: return false;
    }
  }

  ambitionComplete(id) {
    const s = this.state;
    switch (id) {
      case 'claim2': return this.ownedCount() >= 2;
      case 'smithy': return this.settlement.countType('smithy') >= 1 && (s.stats.weaponsForged || 0) >= 30;
      case 'keep3': return s.keepLevel >= 3;
      case 'army25': return this.army.total() >= 25;
      case 'claim3': return this.ownedCount() >= 3;
      case 'victory': return !!s.regions.blackspire.owned;
      default: return false;
    }
  }

  hintForState() {
    const s = this.state;
    if (this.placing) return 'LMB to place · R to rotate · Esc to cancel';
    if (s.tutorial < TUTORIAL.length) return TUTORIAL_HINTS[s.tutorial] || '';
    if ((s.resources.food || 0) < 6) return 'Your granary is thin. Build farms or buy food at the market.';
    const popCap = this.settlement.effects.popCap || 6;
    if (s.population >= popCap) return 'The village is full. Build cottages, or select the Keep to invite more settlers.';
    if (s.population < popCap && s.gold >= 80) return 'Select your Keep to invite settlers — more hands mean more workers and recruits.';
    if (this.settlement.idleWorkers() > 2) return `${this.settlement.idleWorkers()} idle villagers — put them to work in a workshop or farm.`;
    if (s.gold < 30) return 'Coin is short. Sell goods at the market, or raise a caravan\'s interest.';
    if (s.happiness < 45) return 'Your people are unhappy. A tavern and full granary will lift their spirits.';
    if (this.army.total() === 0) return 'The valley will not conquer itself. Build a Barracks when the Keep allows.';
    return TIPS[Math.floor(this._hintT / 9) % TIPS.length];
  }

  // ============================================================
  // SETTINGS / SAVE
  // ============================================================
  setQuality(q) {
    this.state.settings.quality = q;
    this.engine.setQuality(q);
    this.ui.toast(`Graphics set to <b>${q}</b>.`, '');
    this.saveGame(false);
  }
  setSound(on) { this.state.settings.sound = on; this.audio.setEnabled(on); }
  setMusic(on) { this.state.settings.music = on; this.audio.setMusic(on); }

  saveGame(manual = false) {
    if (this.mode !== 'overview') {
      if (manual && this.mode === 'battle') this.ui.toast('Finish the battle before saving.', 'warn');
      return false;
    }
    if (!this.state) return false;
    try {
      const data = JSON.parse(JSON.stringify(this.state));
      data.savedAt = Date.now();
      data.version = 2;
      const raw = JSON.stringify(data);
      localStorage.setItem(SAVE_KEY, raw);
      this._lastSave = data.savedAt;
      this.ui?.setSaveStatus?.(true, data.savedAt);
      if (manual) this.ui.toast('Campaign saved to this browser.', 'good');
      return true;
    } catch (e) {
      console.warn('Save failed', e);
      this.ui?.setSaveStatus?.(false);
      if (manual) {
        const why = e && e.name === 'QuotaExceededError' ? 'browser storage is full' : 'browser storage is blocked';
        this.ui.toast(`Save failed: ${why}. Use Settings → Export Save.`, 'bad');
      }
      return false;
    }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      this.state = this._mergeState(data);
      this._rebindState();
      if (!this.state.buildings?.length) return false;
      this.settlement.restore();
      this.syncWorld();
      this.engine.setQuality(this.state.settings.quality || 'medium');
      this.world.setSeason(this.state.season || 0);
      this.world.setTime(this.state.timeOfDay || 8);
      this.ui.updateTopbar(true);
      this.ui.updateObjectives();
      this.ui.updateMinimap();
      this.ui.closeModal();
      this.ui.setSaveStatus?.(true, data.savedAt);
      this.checkObjectives();
      return true;
    } catch (e) {
      console.warn('Load failed', e);
      return false;
    }
  }

  exportSave() {
    try {
      // Prefer the live campaign: this must still work when localStorage is
      // blocked or full (the exact case where Export Save is the fallback).
      let raw = null;
      if (this.mode === 'overview' && this.state) {
        raw = JSON.stringify({ ...this.state, savedAt: Date.now(), version: 2 });
      } else {
        raw = localStorage.getItem(SAVE_KEY);
      }
      if (!raw) { this.ui.toast('No save found to export.', 'warn'); return false; }
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ironhold-save-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      this.ui.toast('Save exported as a file. Keep it somewhere safe.', 'good');
      return true;
    } catch (e) {
      console.warn('Export failed', e);
      this.ui.toast('Could not export the save file.', 'bad');
      return false;
    }
  }

  importSave(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) {
      this.ui.toast('That file is not a valid Ironhold save.', 'bad');
      return false;
    }
    if (!data || !Array.isArray(data.buildings) || !data.buildings.length) {
      this.ui.toast('That file is not a valid Ironhold save.', 'bad');
      return false;
    }
    try {
      this.state = this._mergeState(data);
      this._rebindState();
      this.startCampaign();
      this.ui.closeModal();
      this.saveGame(false);
      this.ui.toast('Campaign imported successfully.', 'good');
      return true;
    } catch (e) {
      console.warn('Import failed', e);
      this.ui.toast('Import failed: ' + (e.message || 'unknown error'), 'bad');
      return false;
    }
  }

  _mergeState(data) {
    const base = this.defaultStateShell();
    const st = {
      ...base, ...data,
      resources: { ...base.resources, ...(data.resources || {}) },
      army: { ...base.army, ...(data.army || {}) },
      training: { ...base.training, ...(data.training || {}) },
      settings: { ...base.settings, ...(data.settings || {}) },
      stats: { ...base.stats, ...(data.stats || {}) },
      marketPressure: { ...base.marketPressure, ...(data.marketPressure || {}) },
      regionProgress: { ...base.regionProgress, ...(data.regionProgress || {}) },
      mail: Array.isArray(data.mail) ? data.mail.slice(-40) : [],
      rivalNews: Array.isArray(data.rivalNews) ? data.rivalNews.slice(-20) : [],
      mailMarks: { ...(data.mailMarks || {}) },
      rivalPower: data.rivalPower || 1,
      rivalMomentum: data.rivalMomentum || 0,
      coalitionWarned: !!data.coalitionWarned,
      regions: {},
      buildings: data.buildings || [],
      ambitionsDone: data.ambitionsDone || [],
    };
    for (const id of Object.keys(base.regions)) {
      st.regions[id] = { owned: !!(data.regions && data.regions[id] && data.regions[id].owned) };
    }
    st.regions.vale.owned = true;
    st.nextBuildingId = Math.max(data.nextBuildingId || 0, ...st.buildings.map(b => b.id || 0), 1);
    st.keepLevel = data.keepLevel || 1;
    st.season = data.season || 0;
    st.speed = data.speed || 1;
    st.tutorial = Math.min(data.tutorial || 0, TUTORIAL.length);
    return st;
  }

  // ============================================================
  // UI REFRESH
  // ============================================================
  refreshUI() {
    this.ui.updateTopbar();
    this.ui.updateObjectives();
    if (this.ui.modalType === 'market' && !this.ui.modalRoot.classList.contains('hidden')) this.ui.openMarket(true);
    else if (this.ui.modalType === 'army' && !this.ui.modalRoot.classList.contains('hidden')) this.ui.openArmy();
    this.ui.updateMinimap();
    this._hintT += 1;
    this.ui.hint(this.hintForState());
    if (this.ui.selectedBuilding && !this.ui.selectedBuilding.isCamp) {
      const b = this.state.buildings.find(x => x.id === this.ui.selectedBuilding.id);
      if (b) this.ui.showSelection(b);
    }
  }

  // ============================================================
  // LOOP
  // ============================================================
  // Schedule the next loop tick. rAF is preferred, but some embedded /
  // backgrounded windows suppress animation frames entirely — fall back to a
  // timer so the simulation never freezes while the tab is hidden.
  _scheduleFrame() {
    const token = (this._frameToken = (this._frameToken || 0) + 1);
    let ran = false;
    const run = (t) => {
      if (ran || token !== this._frameToken) return;
      ran = true;
      this.loop(typeof t === 'number' ? t : performance.now());
    };
    requestAnimationFrame(run);
    setTimeout(() => {
      if (!ran && token === this._frameToken && this.booted) run(performance.now());
    }, 90);
  }

  loop(now) {
    if (!this.booted) return;
    const rawDt = Math.min(0.06, Math.max(0.0001, (now - this.last) / 1000));
    this.last = now;
    this.engine.stats(rawDt);

    if (this.mode === 'battle') {
      this.battle.update(rawDt);
      this._uiT += rawDt;
      if (this._uiT > 0.25) {
        this._uiT = 0;
        this.engine.particles.update(0); // no-op; battle has its own particles
      }
      this._scheduleFrame();
      return;
    }

    if (this.mode === 'menu') {
      this.renderMenuBackdrop(rawDt);
      this._scheduleFrame();
      return;
    }

    // overview
    const speed = this.state.speed || 0;
    const simDt = rawDt * speed;
    if (simDt > 0) {
      // Long days, short nights: ~17h of light to ~7h of darkness, and the
      // dark hours pass quickly so the war table is readable most of the time.
      const hourNow = this.state.timeOfDay;
      const daylight = hourNow >= 4.6 && hourNow < 21.4;
      this.state.timeOfDay += simDt * (24 / DAY_SECONDS) * (daylight ? 0.88 : 1.75);
      while (this.state.timeOfDay >= 24) {
        this.state.timeOfDay -= 24;
        this.state.day++;
        this.state.stats.days = this.state.day;
        this.advanceRivals();
        if ((this.state.day - 1) % 4 === 0) {
          const ns = Math.floor((this.state.day - 1) / 4) % 4;
          if (ns !== this.state.season) {
            this.state.season = ns;
            this.world.setSeason(ns);
            this.ui.toast(`<b>${SEASONS[ns].name}</b> settles over the vale.`, '');
          }
        }
        if (this.state.day % 5 === 0) this.ui.toast(`Day ${this.state.day}. Your realm endures.`, '');
      }
      this.settlement.update(simDt);
      this.economy.update(simDt);
      this.checkEvents(simDt);
      this.checkRaids(simDt);
      this.checkMailRequests(simDt);
      this.engine.cameraCtl.update(rawDt);
      this.particlesUpdate(rawDt);
      // placement ghost
      if (this.placing && this.engine.input.pointer.overCanvas) {
        this.engine.setRayFromPointer();
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const pt = new THREE.Vector3();
        if (this.engine.raycaster.ray.intersectPlane(plane, pt)) {
          const info = this.settlement.updateGhost(pt, this.settlement.ghostRot);
          if (info) this.ui.updatePlacement(info.ok, info.reason);
        }
      }
    } else {
      this.engine.cameraCtl.update(rawDt);
      this.particlesUpdate(rawDt);
    }

    this.world.update(rawDt, this.state);
    this.engine.render(this.engine.scene, this.engine.camera);

    // hover
    this._hoverT += rawDt;
    if (this._hoverT > 0.12 && !this.placing) {
      this._hoverT = 0;
      const b = this.settlement.pickAt();
      this.settlement.hover(b);
      this.canvas.style.cursor = b ? 'pointer' : 'default';
    }

    // timers
    this._uiT += rawDt;
    if (this._uiT > 0.4) {
      this._uiT = 0;
      this.ui.updateTopbar();
    }
    this._mmT += rawDt;
    if (this._mmT > 0.12) { this._mmT = 0; this.ui.updateMinimap(); }
    this._objT += rawDt;
    if (this._objT > 1.2) {
      this._objT = 0;
      this.ui.updateObjectives();
      this.ui.hint(this.hintForState());
      this.checkObjectives();
      if (this.ui.modalType === 'market' && !this.ui.modalRoot.classList.contains('hidden')) this.ui.openMarket(true);
    }
    // Hold U: keep upgrading until everything is maxed or unaffordable.
    // A selected building is upgraded repeatedly; with nothing selected,
    // whole upgrade rounds run instead. Quiet — no toast/sound spam.
    this._holdUpgT = (this._holdUpgT || 0) + rawDt;
    const uHeld = this.mode === 'overview' && !this.placing &&
      this.ui.modalRoot.classList.contains('hidden') &&
      this.engine.input.keys.has('KeyU') &&
      !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');
    if (!uHeld) this._holdUpgDone = false;
    else if (!this._holdUpgDone && this._holdUpgT >= 0.28) {
      this._holdUpgT = 0;
      let did = 0;
      const sel = this.ui.selectedBuilding;
      if (sel && !sel.isCamp) {
        const b = this.state.buildings.find(x => x.id === sel.id);
        if (b) {
          const max = b.type === 'keep' ? KEEP_LEVELS.length - 1 : 10;
          const cost = b.type === 'keep'
            ? KEEP_LEVELS[Math.min(max, b.level + 1)]?.cost
            : this.settlement.upgradeCost(b);
          if (b.level < max && cost && this.economy.canAfford(cost) && this.settlement.upgrade(b.id)) {
            this.ui.updateTopbar(true);
            did = 1;
          }
        }
      } else {
        did = this.upgradeAllAffordable(true);
      }
      if (!did) this._holdUpgDone = true;
    }
    this._autoT += rawDt;
    if (this._autoT > 30) {
      this._autoT = 0;
      if (this.state.settings.autosave !== false) this.saveGame(false);
    }

    this._scheduleFrame();
  }

  particlesUpdate(dt) {
    // overview particles belong to the engine scene
    this.engine.particles.update(dt);
  }

  renderMenuBackdrop(dt) {
    // menu is opaque, but this keeps the scene warm and the audio scheduler alive
    this._menuT = (this._menuT || 0) + dt;
    if (this._menuT > 0.1) {
      this._menuT = 0;
      this.world.update(0.1, this.state);
      this.engine.render(this.engine.scene, this.engine.camera);
    }
  }
}

function nextFrame() {
  return new Promise(res => {
    let done = false;
    const go = () => { if (done) return; done = true; res(); };
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 160);
  });
}
