// ============================================================
// IRONHOLD — Game data & tuning
// ============================================================

export const RESOURCES = {
  wood:    { name: 'Wood',    icon: 'i-wood',    base: 200, sell: 2.2,  buy: 3.4 },
  stone:   { name: 'Stone',   icon: 'i-stone',   base: 200, sell: 3.2,  buy: 4.8 },
  food:    { name: 'Food',    icon: 'i-food',    base: 200, sell: 2.0,  buy: 3.0 },
  iron:    { name: 'Iron',    icon: 'i-iron',    base: 160, sell: 7.0,  buy: 10.5 },
  goods:   { name: 'Goods',   icon: 'i-goods',   base: 140, sell: 18.0, buy: 27.0 },
  weapons: { name: 'Weapons', icon: 'i-weapons', base: 120, sell: 30.0, buy: 44.0 },
};
export const TRADE_RES = ['wood','stone','food','iron','goods','weapons'];

export const SEASONS = [
  { name: 'Spring', tint: 0x9fc46b, tree: 0x6f9c4a, sky: [0x8fb6cf, 0xd8d3a8], prod: { food: 1.2, wood: 1.0, stone: 1.0, iron: 1.0 }, fog: 0x9fb0a5 },
  { name: 'Summer', tint: 0x8fb85e, tree: 0x5f8f3f, sky: [0x7fb4d8, 0xe8d9a8], prod: { food: 1.05, wood: 1.18, stone: 1.1, iron: 1.0 }, fog: 0xa8b39a },
  { name: 'Autumn', tint: 0xbca55f, tree: 0xc08339, sky: [0x9fb2c4, 0xe3bc84], prod: { food: 1.18, wood: 1.12, stone: 1.0, iron: 1.0 }, fog: 0xb2a183 },
  { name: 'Winter', tint: 0xa9b4b8, tree: 0x9aac9e, sky: [0x859cb0, 0xc9d2d6], prod: { food: 0.68, wood: 0.86, stone: 0.92, iron: 0.9 }, fog: 0xb9c4c6 },
];

export const KEEP_LEVELS = [
  null,
  { name: 'Ruined Keep',    popCap: 5,  armyCap: 5,  influence: 1, cost: null },
  { name: 'Stone Keep',     popCap: 12, armyCap: 12, influence: 3, cost: { gold: 180, stone: 55 } },
  { name: 'Fortified Keep', popCap: 22, armyCap: 28, influence: 7, cost: { gold: 620, stone: 180, goods: 120 } },
  { name: 'Grand Castle',   popCap: 40, armyCap: 52, influence: 14, cost: { gold: 1600, stone: 520, goods: 380, iron: 140 } },
  { name: 'Warlord Citadel',popCap: 68, armyCap: 92, influence: 26, cost: { gold: 3800, stone: 1200, goods: 850, iron: 480, weapons: 130 } },
  { name: 'High Keep',      popCap: 110, armyCap: 160, influence: 38, cost: { gold: 7600, stone: 2400, goods: 1600, iron: 900, weapons: 260 } },
  { name: 'Royal Citadel',  popCap: 180, armyCap: 260, influence: 52, cost: { gold: 14000, stone: 4600, goods: 3000, iron: 1600, weapons: 480 } },
  { name: 'Dragon Keep',    popCap: 300, armyCap: 420, influence: 70, cost: { gold: 26000, stone: 8600, goods: 5400, iron: 2900, weapons: 900 } },
  { name: 'Sovereign Hold', popCap: 500, armyCap: 700, influence: 94, cost: { gold: 48000, stone: 15000, goods: 9600, iron: 5200, weapons: 1600 } },
  { name: 'Imperial Throne',popCap: 900, armyCap: 1200, influence: 130, cost: { gold: 90000, stone: 28000, goods: 18000, iron: 9800, weapons: 3000 } },
];

// ------------------------------------------------------------
// BUILDINGS
// cost: resources. workers: max workers. size: placement radius.
// prod: per worker per 4s tick. consume: per worker per tick.
// effect: passive bonuses applied elsewhere.
// ------------------------------------------------------------
export const BUILDINGS = {
  keep: {
    name: 'Keep', icon: '♜', cat: 'civic', size: 9, workers: 0, keep: true,
    desc: 'The seat of your power. Upgrade it to unlock new construction, raise population and army limits, and earn renown.',
    cost: null, unlock: 1,
  },
  woodcutter: {
    name: "Woodcutter's Camp", icon: '🪓', cat: 'gather', size: 4.2, workers: 3,
    desc: 'Fells timber from the surrounding woods. The backbone of early construction.',
    cost: { wood: 20, gold: 30 }, unlock: 1,
    prod: { wood: 3.0 }, near: { tree: 1.35 },
  },
  quarry: {
    name: 'Quarry', icon: '⛏', cat: 'gather', size: 4.6, workers: 3,
    desc: 'Cuts stone from the earth for walls, keeps, and fine buildings.',
    cost: { wood: 25, gold: 40 }, unlock: 1,
    prod: { stone: 2.6 }, near: { rock: 1.35 },
  },
  farm: {
    name: 'Farmstead', icon: '🌾', cat: 'gather', size: 5.2, workers: 3,
    desc: 'Fields of wheat feed your people. Output falls in winter.',
    cost: { wood: 20, gold: 25 }, unlock: 1,
    prod: { food: 4.6 },
  },
  fishery: {
    name: 'Fishery', icon: '🐟', cat: 'gather', size: 3.8, workers: 2,
    desc: 'Smokehouses and nets along the water. Produces food year-round, with a bonus near the river.',
    cost: { wood: 25, gold: 35 }, unlock: 1,
    prod: { food: 3.4 }, near: { water: 1.6 },
  },
  ironmine: {
    name: 'Iron Mine', icon: '⚒', cat: 'gather', size: 4.4, workers: 3,
    desc: 'Delves deep for iron ore. The root of every weapon and machine.',
    cost: { wood: 30, stone: 25, gold: 80 }, unlock: 2,
    prod: { iron: 1.7 }, near: { rock: 1.4 },
  },
  sawmill: {
    name: 'Sawmill', icon: '🪚', cat: 'craft', size: 4.6, workers: 3,
    desc: 'Turns rough timber into finished trade goods. A strong early money-maker.',
    cost: { wood: 45, gold: 80 }, unlock: 2,
    prod: { goods: 2.4 }, consume: { wood: 3.0 },
  },
  smithy: {
    name: 'Smithy', icon: '⚒️', cat: 'craft', size: 4.2, workers: 2,
    desc: 'Forge iron into weapons. Equip your host without paying market prices.',
    cost: { wood: 40, stone: 20, gold: 90 }, unlock: 2,
    prod: { weapons: 1.05 }, consume: { iron: 1.8, wood: 0.8 },
  },
  workshop: {
    name: 'Artisan Workshop', icon: '🛠', cat: 'craft', size: 4.6, workers: 3,
    desc: 'Fine crafts of wood and iron. The most valuable goods in the vale.',
    cost: { wood: 60, stone: 40, gold: 180 }, unlock: 3,
    prod: { goods: 3.8 }, consume: { wood: 2.0, iron: 0.9 },
  },
  brewery: {
    name: 'Brewery', icon: '🍺', cat: 'craft', size: 4.2, workers: 2,
    desc: 'Turns grain into ale. Sells well and keeps your people cheerful.',
    cost: { wood: 45, stone: 15, gold: 90 }, unlock: 2,
    prod: { gold: 8 }, consume: { food: 2.4 }, effect: { happiness: 3 },
  },
  house: {
    name: 'Cottage', icon: '🏠', cat: 'civic', size: 3.4, workers: 0,
    desc: 'Housing for four villagers. More people means more workers, taxes, and recruits.',
    cost: { wood: 28, gold: 35 }, unlock: 1, effect: { popCap: 4 },
  },
  longhouse: {
    name: 'Longhouse', icon: '🏡', cat: 'civic', size: 5.2, workers: 0,
    desc: 'A great timber hall for ten villagers. Upgrade it and whole families move in under one roof.',
    cost: { wood: 75, stone: 20, gold: 95 }, unlock: 2, effect: { popCap: 10 },
  },
  manor: {
    name: 'Manor', icon: '🏰', cat: 'civic', size: 6.6, workers: 0,
    desc: 'A stone-and-timber manor housing eighteen souls. The grandest home a lord can raise for his people.',
    cost: { wood: 140, stone: 85, gold: 260 }, unlock: 3, effect: { popCap: 18 },
  },
  well: {
    name: 'Village Well', icon: '⛲', cat: 'civic', size: 2.6, workers: 0,
    desc: 'Clean water at the heart of the settlement. Keeps villagers healthy and content.',
    cost: { stone: 18, wood: 8, gold: 24 }, unlock: 1, effect: { happiness: 5, growth: 0.2 },
  },
  garden: {
    name: 'Herb Garden', icon: '🌿', cat: 'civic', size: 3.0, workers: 1,
    desc: 'Physic gardens and beehives. Lifts happiness and brings in a little food and gold.',
    cost: { wood: 22, gold: 45 }, unlock: 2, prod: { food: 1.4, gold: 1.2 }, effect: { happiness: 4 },
  },
  market: {
    name: 'Market', icon: '🏪', cat: 'civic', size: 4.4, workers: 0,
    desc: 'Where your realm meets the world. Unlocks trading and earns a small toll income.',
    cost: { wood: 45, stone: 25, gold: 100 }, unlock: 1, effect: { market: 1, goldTick: 2.5 },
  },
  tavern: {
    name: 'Tavern', icon: '🍗', cat: 'civic', size: 4.0, workers: 1,
    desc: 'Ale, gossip, and song. Raises happiness, draws settlers, and speeds population growth.',
    cost: { wood: 45, gold: 70 }, unlock: 2, effect: { happiness: 8, growth: 0.55 },
  },
  storehouse: {
    name: 'Storehouse', icon: '🏚', cat: 'civic', size: 4.4, workers: 1,
    desc: 'Expands storage capacity by 160 for every resource. Workers reduce spoilage.',
    cost: { wood: 35, stone: 25, gold: 60 }, unlock: 1, effect: { storage: 160 },
  },
  barracks: {
    name: 'Barracks', icon: '⚔️', cat: 'military', size: 5.2, workers: 1,
    desc: 'Recruitment grounds and armory. Increases army capacity and unlocks training.',
    cost: { wood: 60, stone: 45, gold: 130 }, unlock: 2, effect: { armyCap: 8, recruit: 1 },
  },
  wall: {
    name: 'Palisade Wall', icon: '🧱', cat: 'military', size: 3.0, workers: 0, block: true,
    desc: 'A stout wall section. Walls raise your settlement defense and army morale when defending.',
    cost: { stone: 12, wood: 6, gold: 10 }, unlock: 1, effect: { defense: 4 }, snap: 4,
  },
  tower: {
    name: 'Watchtower', icon: '🗼', cat: 'military', size: 3.2, workers: 0,
    desc: 'A stone tower with a commanding view. Adds defense and a little renown.',
    cost: { stone: 35, wood: 20, gold: 55 }, unlock: 2, effect: { defense: 12, influence: 1 },
  },
  gate: {
    name: 'Gatehouse', icon: '🏯', cat: 'military', size: 4.2, workers: 0,
    desc: 'A fortified gate. Adds significant defense to your walls.',
    cost: { stone: 40, wood: 25, gold: 90 }, unlock: 3, effect: { defense: 18, influence: 1 },
  },
};

export const BUILD_CATS = [
  { id: 'gather', name: 'Gathering' },
  { id: 'craft', name: 'Workshops' },
  { id: 'civic', name: 'Settlement' },
  { id: 'military', name: 'Military' },
];

// ------------------------------------------------------------
// UNITS
// ------------------------------------------------------------
export const UNITS = {
  militia: {
    name: 'Militia', icon: 'M', desc: 'Farmhands with spears and nerve. Cheap, numerous, and braver behind walls.',
    cost: { gold: 35, food: 2 }, pop: 1,
    hp: 85, dmg: 9, range: 2.2, speed: 4.1, armor: 0.12, morale: 60,
  },
  spearman: {
    name: 'Spearman', icon: 'S', desc: 'Trained spearmen in a tight shieldwall. The backbone of a real battle line.',
    cost: { gold: 50, food: 2, wood: 6 }, pop: 1,
    hp: 115, dmg: 11, range: 2.9, speed: 3.9, armor: 0.24, morale: 70, antiCavalry: 1.5,
  },
  axeman: {
    name: 'Axeman', icon: 'A', desc: 'Heavy infantry with long axes. Slow, brutal, and excellent at breaking shields.',
    cost: { gold: 75, food: 3, iron: 4 }, pop: 1,
    hp: 140, dmg: 17, range: 2.3, speed: 4.2, armor: 0.2, morale: 76, cleave: 0.35, scale: 1.05,
  },
  archer: {
    name: 'Archer', icon: 'R', desc: 'Huntsmen who loose volleys from the second rank. Fragile in a melee.',
    cost: { gold: 55, food: 3, wood: 4 }, pop: 1,
    hp: 62, dmg: 13, range: 24, speed: 3.9, armor: 0.05, morale: 55, ranged: true, reload: 2.3,
  },
  arrowman: {
    name: 'Arrowman', icon: 'L', desc: 'Longbowmen who draw heavier bows. Slower to loose, but their shafts punch deep and outrange most archers.',
    cost: { gold: 72, food: 3, wood: 7 }, pop: 1,
    hp: 68, dmg: 17, range: 29, speed: 3.8, armor: 0.04, morale: 58, ranged: true, reload: 2.7, armorPierce: 0.18, scale: 0.98,
  },
  crossbow: {
    name: 'Crossbowman', icon: 'X', desc: 'Slow to reload, but their bolts punch through mail and crush armoured knights.',
    cost: { gold: 85, food: 3, wood: 8, iron: 2 }, pop: 1,
    hp: 74, dmg: 24, range: 27, speed: 3.4, armor: 0.08, morale: 58, ranged: true, reload: 3.2, armorPierce: 0.5, scale: 0.96,
  },
  knight: {
    name: 'Knight', icon: 'K', desc: 'Armored riders and household guards. Expensive, but they break battle lines.',
    cost: { gold: 110, food: 4, iron: 8 }, pop: 1,
    hp: 160, dmg: 17, range: 2.6, speed: 4.7, armor: 0.38, morale: 80,
  },
  cavalry: {
    name: 'Cavalry', icon: 'C', desc: 'Mounted lancers. Devastating on the charge, vulnerable when bogged down.',
    cost: { gold: 160, food: 5, iron: 14 }, pop: 1,
    hp: 235, dmg: 22, range: 2.8, speed: 6.1, armor: 0.36, morale: 86, charge: 1.9, scale: 1.1,
  },
  warElephant: {
    name: 'War Elephant', icon: 'E', desc: 'A tower of muscle and ivory. Tramples infantry and scatters a shieldwall on impact.',
    cost: { gold: 420, food: 12, iron: 18, goods: 10 }, pop: 4,
    hp: 980, dmg: 46, range: 3.4, speed: 3.2, armor: 0.48, morale: 96,
    cleave: 0.55, charge: 2.4, scale: 1.75, trample: true, special: 'elephant',
  },
  catapult: {
    name: 'Catapult', icon: 'T', desc: 'A great siege engine. Slow on the march, but its stones smash gates, walls and packed ranks.',
    cost: { gold: 360, wood: 70, stone: 55, iron: 24 }, pop: 4,
    hp: 340, dmg: 62, range: 68, speed: 1.35, armor: 0.34, morale: 72,
    ranged: true, reload: 7.0, siege: true, splash: 5.0, scale: 1.35, special: 'catapult',
  },
};

export const ENEMY_UNITS = {
  bandit: { hp: 78, dmg: 9, range: 2.1, speed: 3.8, armor: 0.06, morale: 50 },
  raider: { hp: 105, dmg: 13, range: 2.2, speed: 4.7, armor: 0.12, morale: 60 },
  spearman: { hp: 118, dmg: 12, range: 2.9, speed: 3.8, armor: 0.23, morale: 68, antiCavalry: 1.4 },
  axeman: { hp: 138, dmg: 16, range: 2.3, speed: 4.2, armor: 0.18, morale: 74, cleave: 0.3, scale: 1.04 },
  archer: { hp: 68, dmg: 14, range: 22, speed: 3.7, armor: 0.04, morale: 48, ranged: true, reload: 2.5 },
  arrowman: { hp: 74, dmg: 18, range: 28, speed: 3.6, armor: 0.05, morale: 54, ranged: true, reload: 3.0, armorPierce: 0.16, scale: 0.98 },
  crossbow: { hp: 72, dmg: 21, range: 26, speed: 3.4, armor: 0.05, morale: 55, ranged: true, reload: 3.4, armorPierce: 0.45, scale: 0.96 },
  brute: { hp: 260, dmg: 24, range: 2.6, speed: 3.6, armor: 0.34, morale: 82, scale: 1.42 },
  soldier: { hp: 145, dmg: 16, range: 2.2, speed: 4.0, armor: 0.28, morale: 72 },
  knight: { hp: 250, dmg: 24, range: 2.6, speed: 4.6, armor: 0.45, morale: 95 },
  cavalry: { hp: 225, dmg: 23, range: 2.8, speed: 6.0, armor: 0.34, morale: 84, charge: 1.6, scale: 1.08 },
  berserker: { hp: 170, dmg: 22, range: 2.2, speed: 5.3, armor: 0.12, morale: 88, scale: 1.16 },
  giant: { hp: 900, dmg: 45, range: 3.4, speed: 3.4, armor: 0.4, morale: 110, scale: 2.15 },
  warlord: { hp: 1500, dmg: 58, range: 3.6, speed: 3.7, armor: 0.5, morale: 125, scale: 2.35 },
  elephant: {
    hp: 920, dmg: 43, range: 3.4, speed: 3.0, armor: 0.44, morale: 94,
    cleave: 0.5, charge: 2.2, scale: 1.7, trample: true, special: 'elephant',
  },
  catapult: {
    hp: 300, dmg: 55, range: 66, speed: 1.3, armor: 0.3, morale: 68,
    ranged: true, reload: 7.6, siege: true, splash: 4.8, scale: 1.35, special: 'catapult',
  },
};

export const EQUIP_TIERS = [
  { name: 'Rusty Arms',     bonus: 0.00, cost: null },
  { name: 'Honed Steel',    bonus: 0.10, cost: { gold: 140, weapons: 8 } },
  { name: 'Tempered Blades',bonus: 0.20, cost: { gold: 380, weapons: 22 } },
  { name: 'Masterwork',     bonus: 0.32, cost: { gold: 850, weapons: 55 } },
  { name: 'Warlord Steel',  bonus: 0.46, cost: { gold: 1800, weapons: 120 } },
];

// ------------------------------------------------------------
// REGIONS — a continuous valley
// ------------------------------------------------------------
export const REGIONS = {
  vale: {
    name: 'The Ashen Vale', short: 'Vale', x: 0, z: 6, radius: 52, owned: true,
    bonusText: 'Heart of your realm - +15% all production',
    mods: { all: 1.15 }, camp: null,
  },
  greenfields: {
    name: 'Greenfields', short: 'Greenfields', x: 76, z: -16, radius: 42,
    bonusText: 'Fertile farmland - +35% food production',
    mods: { food: 1.35 }, camp: { x: 78, z: -18, name: 'Greenfields Bandits', leader: 'Chief Renn', strength: 20,
      comp: { bandit: 12, raider: 3, archer: 3, arrowman: 2, spearman: 3, brute: 1 }, loot: 320, influence: 12,
      flavor: 'A full warband squats in the old granary, fat on stolen harvests. Chief Renn has doubled his numbers and hung a bounty on your banner.' } },
  ironhills: {
    name: 'The Iron Hills', short: 'Iron Hills', x: -78, z: -30, radius: 44,
    bonusText: 'Rich seams - +40% stone and iron production',
    mods: { stone: 1.4, iron: 1.4 }, camp: { x: -80, z: -32, name: 'Ironfang Warband', leader: 'Grimm Ironfang', strength: 50,
      comp: { bandit: 10, raider: 8, archer: 7, spearman: 5, axeman: 5, soldier: 7, brute: 7, berserker: 2, giant: 2 }, loot: 1100, influence: 24,
      flavor: 'A host holds the passes. Their fires stain the hills red, and two giants haul timber for the war engines.' } },
  riverlands: {
    name: 'The Riverlands', short: 'Riverlands', x: 34, z: 84, radius: 44,
    bonusText: 'River trade - +22% market prices and +18% food',
    mods: { food: 1.18, trade: 1.22 }, camp: { x: 36, z: 86, name: 'The Red Tide', leader: 'Captain Vess', strength: 78,
      comp: { raider: 15, archer: 10, crossbow: 5, spearman: 8, axeman: 6, soldier: 18, brute: 9, berserker: 7, cavalry: 3, knight: 4, giant: 6 }, loot: 1900, influence: 40,
      flavor: 'River pirates turned a warlord\'s garrison. Six giants haul their rams, and Captain Vess has sworn to hang your lords from the bridge.' } },
  thornwood: {
    name: 'The Thornwood', short: 'Thornwood', x: 82, z: 64, radius: 40,
    bonusText: 'Old forest - +35% wood and +12% food',
    mods: { wood: 1.35, food: 1.12 }, camp: { x: 84, z: 66, name: 'The Thornbound', leader: 'The Briar Witch', strength: 64,
      comp: { bandit: 7, raider: 10, archer: 10, arrowman: 6, crossbow: 4, spearman: 6, axeman: 6, soldier: 10, brute: 7, berserker: 5, giant: 6 }, loot: 1500, influence: 32,
      flavor: 'The forest itself fights for her. Six giants move between the black thorns, and every path ends in arrows.' } },
  sunkenmarsh: {
    name: 'The Sunken Marsh', short: 'Sunken Marsh', x: -88, z: 66, radius: 42,
    bonusText: 'Peat and reeds - +25% food and +15% wood',
    mods: { food: 1.25, wood: 1.15 }, camp: { x: -90, z: 68, name: 'The Drowned Court', leader: 'Bog-King Mael', strength: 52,
      comp: { bandit: 5, raider: 7, archer: 11, crossbow: 6, spearman: 4, soldier: 7, brute: 5, berserker: 5, giant: 4 }, loot: 1250, influence: 26,
      flavor: 'A drowned king rules from a hall of reeds. His archers never miss, and his giants wade through the marsh without a sound.' } },
  stormcrag: {
    name: 'Stormcrag', short: 'Stormcrag', x: -72, z: -96, radius: 46,
    bonusText: 'Storm-forged rock - +45% stone and iron',
    mods: { stone: 1.45, iron: 1.45 }, camp: { x: -74, z: -98, name: 'The Storm Host', leader: 'Warlord Kael', strength: 90,
      comp: { soldier: 19, archer: 10, crossbow: 6, spearman: 8, axeman: 8, brute: 12, berserker: 10, cavalry: 6, knight: 10, elephant: 5, catapult: 4, giant: 16, warlord: 2 }, loot: 3000, influence: 60,
      flavor: 'Kael has gathered the strongest host in the north. Sixteen giants beat the war drums, and two warlords ride at his back.' } },
  blackspire: {
    name: 'Blackspire', short: 'Blackspire', x: -12, z: -108, radius: 52,
    bonusText: 'Seat of the rival lord - +20% all production, +3 army morale',
    mods: { all: 1.2, morale: 3 }, camp: { x: -14, z: -110, name: 'Blackspire Garrison', leader: 'Lord Vareth the Pale', strength: 140,
      comp: { soldier: 32, archer: 16, crossbow: 8, spearman: 12, axeman: 12, brute: 17, berserker: 16, cavalry: 10, knight: 16, elephant: 10, catapult: 6, giant: 24, warlord: 8 }, loot: 8000, influence: 140, final: true,
      flavor: 'The Pale Lord has drained this land for a decade. Twenty-four giants hold the gate, eight warlords wait behind it, and the Blackspire itself is hungry.' } },
};

export const TUTORIAL = [
  { id: 'keep',   title: 'Your Birthright',     text: 'Select your ruined Keep in the vale.', reward: { gold: 30 } },
  { id: 'lumber', title: 'Timber & Toil',       text: 'Build a Woodcutter\'s Camp from the Build menu (B).', reward: { gold: 30 } },
  { id: 'workers',title: 'Hands to Work',       text: 'Assign 2 villagers to the Woodcutter\'s Camp.', reward: { wood: 25 } },
  { id: 'farm',   title: 'Bread Before Battle', text: 'Build a Farmstead to feed your people.', reward: { gold: 40 } },
  { id: 'sell',   title: 'The Merchant\'s Art', text: 'Open the Market (M) and sell 20 Wood.', reward: { gold: 40 } },
  { id: 'house',  title: 'Room to Grow',        text: 'Build a Cottage to raise your population cap.', reward: { wood: 30 } },
  { id: 'stone',  title: 'The Bones of Stone',  text: 'Build a Quarry and gather 40 Stone.', reward: { gold: 60 } },
  { id: 'keep2',  title: 'A Lord Worth Following', text: 'Upgrade your Keep to Level 2.', reward: { gold: 80, stone: 20 } },
  { id: 'barracks', title: 'Sharpened Ambition', text: 'Build a Barracks and recruit a warband before marching.', reward: { gold: 80, food: 20 } },
  { id: 'battle', title: 'Greenfields Beckons',  text: 'March on the Greenfields bandits and win the battle.', reward: { gold: 120, influence: 10 } },
];

export const AMBITIONS = [
  { id: 'claim2',  title: 'A Realm of Two Banners', text: 'Control 2 regions.', reward: { gold: 300, influence: 12 } },
  { id: 'smithy',  title: 'Iron and Fire',          text: 'Build a Smithy and forge 30 Weapons.', reward: { gold: 260, influence: 10 } },
  { id: 'keep3',   title: 'The Stone Rises',        text: 'Upgrade your Keep to Level 3.', reward: { gold: 420, influence: 20 } },
  { id: 'army40',  title: 'A Host to Be Feared',    text: 'Field an army of 40 soldiers.', reward: { gold: 700, influence: 30 } },
  { id: 'claim3',  title: 'The River Bends',        text: 'Control 3 regions.', reward: { gold: 800, influence: 35 } },
  { id: 'claim4',  title: 'The Outer Valleys',      text: 'Control 4 regions.', reward: { gold: 1100, influence: 45 } },
  { id: 'army60',  title: 'The Iron Tide',          text: 'Field an army of 60 soldiers.', reward: { gold: 1400, influence: 55 } },
  { id: 'claim5',  title: 'The Valley United',      text: 'Control 5 regions.', reward: { gold: 1600, influence: 70 } },
  { id: 'victory', title: 'Warlord of the Vale',    text: 'Take Blackspire and break the Pale Lord.', reward: { gold: 3000, influence: 140 }, final: true },
];

export const EVENTS = [
  {
    id: 'caravan', kind: 'good', title: 'A Wealthy Caravan', icon: '🐫',
    text: 'A caravan master from the southern cities arrives at your gates, eager for quality goods. For a short while, your market will pay a handsome premium.',
    choices: [{ label: 'Welcome them', desc: '+50% sale prices for 90 seconds', effect: 'caravan' }],
    weight: 3, minDay: 2,
  },
  {
    id: 'bandits', kind: 'bad', title: 'Bandit Demand', icon: '🏴',
    text: 'A band of brigands has set up on the road. Their captain offers a simple choice: pay for safe passage, or bleed for it.',
    choices: [
      { label: 'Pay the toll', desc: 'Lose 80 gold', effect: 'payBandits' },
      { label: 'Defy them', desc: 'Fight a skirmish (+ loot, risk some troops)', effect: 'fightBandits' },
    ],
    weight: 2, minDay: 3,
  },
  {
    id: 'migrants', kind: 'good', title: 'Weary Travellers', icon: '🚶',
    text: 'A column of displaced farmers arrives, drawn by the smoke of your hearths. They ask only for food and a roof.',
    choices: [{ label: 'Take them in', desc: '+3 population (if housing allows), +5 happiness', effect: 'migrants' }],
    weight: 2, minDay: 2,
  },
  {
    id: 'harvest', kind: 'good', title: 'A Bountiful Harvest', icon: '🌾',
    text: 'The fields have yielded more than anyone dared hope. Your people are already planning a festival.',
    choices: [{ label: 'Let them feast', desc: '+15 happiness for 120 seconds', effect: 'festival' }],
    weight: 2, minDay: 4,
  },
  {
    id: 'vein', kind: 'good', title: 'A Rich Seam', icon: '⛏',
    text: 'Miners break into a glittering seam of ore beneath the hills. The valley seems to hold its breath.',
    choices: [{ label: 'Dig deep', desc: '+60 iron', effect: 'vein' }],
    weight: 2, minDay: 4,
  },
  {
    id: 'storm', kind: 'bad', title: 'The Long Rain', icon: '🌧',
    text: 'A grey wall of rain sweeps up the vale. Roads turn to muck and work slows to a crawl.',
    choices: [{ label: 'Endure', desc: 'Production −20% for 90 seconds', effect: 'storm' }],
    weight: 1, minDay: 5,
  },
  {
    id: 'taxman', kind: 'good', title: 'The King\'s Assessor', icon: '📜',
    text: 'An emissary from a distant crown offers a payment for your loyalty — and a subtle reminder that loyalty has a price.',
    choices: [
      { label: 'Accept the silver', desc: '+200 gold, −4 happiness', effect: 'taxman' },
      { label: 'Refuse with dignity', desc: '+8 influence, +3 happiness', effect: 'refuseTaxman' },
    ],
    weight: 1, minDay: 7,
  },
];

export const TIPS = [
  'Idle villagers pay taxes. Put them to work in workshops, or leave them to fill your coffers.',
  'Happiness multiplies every production building. A tavern often pays for itself in a single day.',
  'The market pays less when you flood it with one good. Spread your trade.',
  'Walls matter in defense — but soldiers win battles. You can fight personally when a real battle begins.',
  'Winter cuts food production. Store a surplus in autumn, or buy grain at the market.',
  'Archers are fragile. Put a line of militia in front of them and order the line to hold.',
  'Build near forests, rock, and water for a gathering bonus. The placement ring shows the bonus.',
  'You can order troops while fighting: Advance, Hold, Charge, Follow Me, and Rally.',
  'Upgrading your Keep unlocks new buildings and raises population and army limits.',
  'Renown is earned through growth and victory. It is the measure of a true warlord.',
];
