import { UNITS, EQUIP_TIERS, ENEMY_UNITS, REGIONS } from './config.js';

export class Army {
  constructor(state, game) {
    this.state = state;
    this.game = game;
    this.onChange = null;
  }

  total() {
    return Object.values(this.state.army).reduce((a, b) => a + b, 0);
  }

  counts() { return this.state.army; }

  capacity() {
    return this.game.settlement?.effects?.armyCap || 6;
  }

  availablePop() {
    const assigned = this.game.settlement.totalWorkers();
    return Math.max(0, this.state.population - assigned - this.total());
  }

  equipment() {
    return EQUIP_TIERS[this.state.equipTier] || EQUIP_TIERS[0];
  }

  power() {
    let p = 0;
    for (const [type, n] of Object.entries(this.state.army)) {
      const u = UNITS[type];
      if (!u || !n) continue;
      p += n * (u.hp * 0.35 + u.dmg * 3.4 + u.armor * 60);
    }
    return Math.round(p * (1 + this.equipment().bonus));
  }

  rating() {
    const weight = { militia: 1, archer: 1.25, arrowman: 1.4, spearman: 1.45, axeman: 1.7, crossbow: 1.6, knight: 2.4, cavalry: 2.8, warElephant: 6.5, catapult: 5.5 };
    let r = 0;
    for (const [type, n] of Object.entries(this.state.army)) {
      if (!n) continue;
      r += n * (weight[type] || 1.4);
    }
    return Math.round(r * (1 + this.equipment().bonus * 0.8));
  }

  canRecruit(type, n = 1) {
    const u = UNITS[type];
    if (!u) return { ok: false, reason: 'Unknown unit.' };
    if (!this.game.settlement.effects.recruit) return { ok: false, reason: 'Build a Barracks first.' };
    if (this.total() + n > this.capacity()) return { ok: false, reason: 'Army limit reached. Upgrade your Keep or Barracks.' };
    if (this.availablePop() < n) return { ok: false, reason: 'No free villagers. Build housing.' };
    const cost = {};
    for (const [k, v] of Object.entries(u.cost)) cost[k] = v * n;
    if (!this.game.economy.canAfford(cost)) return { ok: false, reason: 'Not enough resources.', cost, missing: true };
    return { ok: true, cost };
  }

  // The largest batch of this unit that is actually possible right now,
  // bounded by free villagers, army space and resources.
  maxRecruit(type, limit = 5) {
    const byPop = Math.floor(this.availablePop());
    const byCap = Math.max(0, this.capacity() - this.total());
    let n = Math.max(0, Math.min(limit, byPop, byCap));
    while (n > 0) {
      if (this.canRecruit(type, n).ok) return n;
      n--;
    }
    return 0;
  }

  recruit(type, n = 1) {
    const check = this.canRecruit(type, n);
    if (!check.ok) { this.game.toast(check.reason, 'bad'); this.game.audio.error(); return false; }
    this.game.economy.pay(check.cost);
    this.state.army[type] = (this.state.army[type] || 0) + n;
    this.game.audio.notification();
    this.game.ui.updateTopbar(true);
    this.game.ui.openArmy();
    if (this.onChange) this.onChange();
    return true;
  }

  dismiss(type, n = 1) {
    const have = this.state.army[type] || 0;
    const amt = Math.min(have, n);
    if (!amt) return;
    this.state.army[type] = have - amt;
    this.game.ui.openArmy();
    if (this.onChange) this.onChange();
  }

  canUpgradeEquip() {
    const next = EQUIP_TIERS[this.state.equipTier + 1];
    if (!next) return { ok: false, reason: 'Already at the finest equipment.' };
    if (!this.game.settlement.effects.recruit) return { ok: false, reason: 'Build a Barracks to arm your host.' };
    if (!this.game.economy.canAfford(next.cost)) return { ok: false, reason: 'Not enough gold or weapons.', cost: next.cost };
    return { ok: true, next, cost: next.cost };
  }

  upgradeEquip() {
    const r = this.canUpgradeEquip();
    if (!r.ok) { this.game.toast(r.reason, 'bad'); this.game.audio.error(); return false; }
    this.game.economy.pay(r.cost);
    this.state.equipTier++;
    this.game.audio.levelup();
    this.game.ui.openArmy();
    this.game.toast(`Your host is now armed with <b>${r.next.name}</b>. +${Math.round(r.next.bonus * 100)}% damage.`, 'good');
    if (this.onChange) this.onChange();
    return true;
  }

  composition() {
    // One entry per soldier. The entire host deploys; the battle renderer has
    // stable instanced slots for a thousand per side and adapts its draw rate.
    const list = [];
    for (const [type, n] of Object.entries(this.state.army)) {
      for (let i = 0; i < n; i++) list.push(type);
    }
    return list;
  }

  applyCasualties(losses) {
    for (const [type, n] of Object.entries(losses || {})) {
      this.state.army[type] = Math.max(0, (this.state.army[type] || 0) - n);
    }
    if (this.onChange) this.onChange();
  }

  loseFraction(f) {
    const losses = {};
    for (const [type, n] of Object.entries(this.state.army)) {
      losses[type] = Math.floor(n * f);
    }
    this.applyCasualties(losses);
    return losses;
  }

  enemyFor(regionId) {
    const reg = REGIONS[regionId];
    if (!reg?.camp) return null;
    const comp = [];
    for (const [type, n] of Object.entries(reg.camp.comp)) {
      for (let i = 0; i < n; i++) comp.push(type);
    }
    return comp;
  }

  enemyStats(type) { return ENEMY_UNITS[type] || ENEMY_UNITS.bandit; }
}
