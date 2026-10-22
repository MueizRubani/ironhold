import { RESOURCES, TRADE_RES, REGIONS } from './config.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Economy {
  constructor(engine, audio, state, game) {
    this.engine = engine;
    this.audio = audio;
    this.state = state;
    this.game = game;
    this.pressure = state.marketPressure || { wood: 0, stone: 0, food: 0, iron: 0, goods: 0, weapons: 0 };
    state.marketPressure = this.pressure;
    this.globalMult = 1;
    this.drift = 0;
    this.eventMods = { prodMult: 1, happiness: 0, caravan: 0, caravanGood: null, storm: 0 };
    this._goldIn = 0; this._goldOut = 0;
    this._rateT = 0;
    this.goldRate = 0;
    this._happyT = 0;
    this._growthT = 0;
    this._starveT = 0;
    this._priceT = 0;
    this._prevPrices = {};
    this.trend = {};
    this.onGrowth = null;
    this.onStarvation = null;
  }

  cap(r) {
    const s = this.game.settlement;
    return RESOURCES[r].base + (s?.effects?.storage || 0) + (this.state.keepLevel || 1) * 30;
  }

  canAfford(cost) {
    if (!cost) return true;
    if ((cost.gold || 0) > this.state.gold + 0.001) return false;
    for (const [k, v] of Object.entries(cost)) {
      if (k === 'gold') continue;
      if ((this.state.resources[k] || 0) + 0.001 < v) return false;
    }
    return true;
  }

  pay(cost) {
    if (!cost) return true;
    if (!this.canAfford(cost)) return false;
    this.state.gold -= cost.gold || 0;
    for (const [k, v] of Object.entries(cost)) {
      if (k === 'gold') continue;
      this.state.resources[k] = Math.max(0, (this.state.resources[k] || 0) - v);
    }
    return true;
  }

  gain(resources, silent = false) {
    for (const [k, v] of Object.entries(resources)) {
      if (k === 'gold') this.gainGold(v);
      else this.gainResource(k, v);
    }
    if (!silent) this.audio.coins(2);
  }

  gainGold(amount) {
    if (!isFinite(amount) || amount === 0) return;
    this.state.gold = Math.max(0, this.state.gold + amount);
    if (amount > 0) this._goldIn += amount;
    else this._goldOut += -amount;
  }

  gainResource(r, amount) {
    if (!isFinite(amount) || amount <= 0) return 0;
    const cap = this.cap(r);
    const cur = this.state.resources[r] || 0;
    const gained = Math.max(0, Math.min(cap, cur + amount) - cur);
    this.state.resources[r] = cur + gained;
    return gained;
  }

  spendResource(r, amount) {
    const cur = this.state.resources[r] || 0;
    const spent = Math.min(cur, Math.max(0, amount));
    this.state.resources[r] = cur - spent;
    return spent;
  }

  // ---------------- market ----------------
  sellPrice(r) {
    const base = RESOURCES[r].sell;
    const p = clamp(this.pressure[r] || 0, 0, 0.45);
    let price = base * this.globalMult * (1 - p);
    // region trade bonus (riverlands)
    let trade = 1;
    for (const [id, reg] of Object.entries(REGIONS)) {
      if (this.state.regions[id]?.owned && reg.mods.trade) trade *= reg.mods.trade;
    }
    price *= trade;
    if (this.eventMods.caravan > 0) price *= (this.eventMods.caravanGood === r ? 1.65 : 1.15);
    return price;
  }

  buyPrice(r) {
    const base = RESOURCES[r].buy;
    return base * this.globalMult * (1 + (this.pressure[r] || 0) * 0.4) * (this.eventMods.caravan > 0 ? 1.15 : 1);
  }

  sell(r, amount) {
    const stock = this.state.resources[r] || 0;
    const amt = Math.min(stock, amount, this.cap(r));
    if (amt < 0.5) return 0;
    const price = this.sellPrice(r);
    const revenue = amt * price;
    this.state.resources[r] = stock - amt;
    this.gainGold(revenue);
    // Track campaign statistics (used by the tutorial and the ledger).
    this.state.stats.goldEarned = (this.state.stats.goldEarned || 0) + revenue;
    if (r === 'wood') this.state.stats.woodSold = (this.state.stats.woodSold || 0) + amt;
    this.pressure[r] = clamp((this.pressure[r] || 0) + amt * 0.0045, 0, 0.45);
    this.audio.coins(Math.min(5, 1 + Math.floor(amt / 20)));
    return revenue;
  }

  buy(r, amount) {
    const want = Math.max(0, Math.floor(Number(amount) || 0));
    if (want <= 0) return 0;
    const price = this.buyPrice(r);
    const cap = this.cap(r);
    const stock = this.state.resources[r] || 0;
    // Never charge for goods that will not fit in the warehouse.
    const qty = Math.min(want, Math.max(0, Math.floor(cap - stock)));
    if (qty <= 0) return 0;
    const total = price * qty;
    if (this.state.gold + 0.001 < total) return 0;
    this.gainGold(-total);
    const gained = this.gainResource(r, qty);
    // Fractional storage can shave a little off; refund anything not delivered.
    if (gained < qty) this.gainGold((qty - gained) * price);
    this.pressure[r] = clamp((this.pressure[r] || 0) - gained * 0.003, 0, 0.45);
    return gained;
  }

  activateCaravan(good, seconds = 90) {
    this.eventMods.caravan = seconds;
    this.eventMods.caravanGood = good || 'goods';
  }

  // ---------------- simulation ----------------
  update(dt) {
    const s = this.state;
    // market drift
    this.drift += dt * 0.03;
    this.globalMult = 1 + Math.sin(this.drift * 0.7) * 0.08 + Math.sin(this.drift * 1.9 + 2.1) * 0.035;
    this._priceT += dt;
    if (this._priceT > 2) {
      this._priceT = 0;
      for (const r of TRADE_RES) {
        const p = this.sellPrice(r);
        this.trend[r] = this._prevPrices[r] === undefined ? 0 : (p - this._prevPrices[r] > 0.01 ? 1 : p - this._prevPrices[r] < -0.01 ? -1 : 0);
        this._prevPrices[r] = p;
        this.pressure[r] = Math.max(0, (this.pressure[r] || 0) - 0.0035);
      }
    }
    // event timers
    for (const k of ['caravan', 'storm', 'festival']) {
      if (this.eventMods[k] > 0) this.eventMods[k] = Math.max(0, this.eventMods[k] - dt);
    }
    this.eventMods.prodMult = this.eventMods.storm > 0 ? 0.8 : 1;
    this.eventMods.happiness = this.eventMods.festival > 0 ? 15 : 0;

    // food consumption
    const army = this.game.army.total();
    const eat = (s.population * 0.095 + army * 0.15) * dt;
    const food = s.resources.food || 0;
    if (eat > 0) {
      if (food >= eat) s.resources.food = food - eat;
      else {
        s.resources.food = 0;
        this._starveT += dt;
        if (this._starveT > 14) {
          this._starveT = 0;
          if (s.population > 1) {
            s.population--;
            if (this.onStarvation) this.onStarvation();
          }
        }
      }
    } else this._starveT = 0;
    if ((s.resources.food || 0) <= 0.1) this._starveT += dt * 0.4;
    else this._starveT = Math.max(0, this._starveT - dt);

    // happiness
    this._happyT += dt;
    if (this._happyT > 1.5) {
      this._happyT = 0;
      this.recomputeHappiness();
    }
    // population growth
    // population growth — faster base growth, and taverns draw settlers in
    const cap = this.game.settlement.effects.popCap || 6;
    if (s.population < cap && food > 8 && s.happiness > 38) {
      const growthBoost = 1 + (this.game.settlement.effects.growth || 0);
      const rate = (1 / Math.max(6, 16 - (s.happiness - 40) * 0.16)) * growthBoost;
      this._growthT += dt * rate;
      if (this._growthT >= 1) {
        this._growthT = 0;
        s.population++;
        if (this.onGrowth) this.onGrowth();
      }
    } else {
      this._growthT = Math.min(0.5, this._growthT + dt * 0.05);
    }
    s.population = Math.min(s.population, cap);

    // rate window
    this._rateT += dt;
    if (this._rateT >= 2) {
      const mins = this._rateT / 60;
      this.goldRate = (this._goldIn - this._goldOut) / mins;
      this._goldIn = 0; this._goldOut = 0; this._rateT = 0;
      // decay gold rate smoothly
    }
  }

  recomputeHappiness() {
    const s = this.state;
    const effects = this.game.settlement.effects;
    let h = 53;
    h += effects.happiness || 0;
    h += this.eventMods.happiness || 0;
    const food = s.resources.food || 0;
    if (food > 30) h += 6;
    else if (food < 4) h -= 18;
    const cap = Math.max(1, effects.popCap || 6);
    if (s.population <= cap * 0.7) h += 4;
    if (s.population >= cap) h -= 5;
    if (this._starveT > 0) h -= 12;
    const army = this.game.army.total();
    if (army > 0) h += Math.min(5, army * 0.15);
    // region morale
    for (const [id, reg] of Object.entries(REGIONS)) {
      if (s.regions[id]?.owned && reg.mods.morale) h += reg.mods.morale;
    }
    // difficulty from too many soldiers eating
    h = clamp(h, 0, 100);
    s.happiness = Math.round(h * 10) / 10;
  }

  getFoodDays() {
    const army = this.game.army.total();
    const perSec = this.state.population * 0.095 + army * 0.15;
    if (perSec <= 0) return 999;
    return (this.state.resources.food || 0) / perSec / 10; // ~10 real seconds per hour at 1x
  }
}
