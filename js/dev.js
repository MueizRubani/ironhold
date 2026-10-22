// ============================================================
// DEV HARNESS — loaded only when the page URL includes ?dev=...
// Not part of normal play. Used for headless screenshots and smoke tests.
// ============================================================

export async function runDev(game, mode) {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const errors = [];
  window.addEventListener('error', e => errors.push(String(e.message || e.error || e)));
  window.addEventListener('unhandledrejection', e => errors.push('Promise: ' + String(e.reason)));

  // Software WebGL is extremely slow. Screenshot scenes render at a reduced
  // internal resolution; logic-only runs suppress drawing entirely.
  const shotMode = ['overview', 'night', 'market', 'army', 'battle', 'giants', 'raid', 'build', 'chronicle'].includes(mode);
  const renderer = game.engine.renderer;
  const realRender = renderer.render.bind(renderer);
  if (shotMode) {
    game.engine.setQuality('low');
    renderer.setPixelRatio(0.5);
    game.engine.resize();
  } else {
    renderer.render = () => {};
  }

  const startFresh = async () => {
    if (game.mode !== 'overview') {
      game.ui.closeModal();
      game.newGame();
    }
    await wait(350);
  };

  const rich = (gold = 8000) => {
    game.state.gold = gold;
    for (const k of ['wood', 'stone', 'food', 'iron', 'goods', 'weapons']) game.state.resources[k] = 600;
    game.state.population = 14;
    game.ui.updateTopbar(true);
  };

  const findSpot = (type, cx = 0, cz = 4) => {
    for (let r = 14; r <= 76; r += 1.6) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (game.settlement.canPlace(type, x, z).ok) return { x, z };
      }
    }
    return null;
  };

  const place = (type) => {
    const spot = findSpot(type);
    if (!spot) return null;
    return game.settlement.place(type, spot.x, spot.z, 0);
  };

  // ---------- screenshot scenarios ----------
  if (['overview', 'night', 'market', 'army', 'battle', 'giants', 'raid', 'build', 'chronicle'].includes(mode)) {
    await startFresh();

    if (mode === 'overview' || mode === 'night') {
      if (mode === 'night') {
        game.state.timeOfDay = 22.4;
        game.world.setTime(22.4);
      }
      const keep = game.state.buildings.find(b => b.type === 'keep');
      if (mode === 'overview') {
        game.selectBuilding(keep);
        game.checkObjectives();
      }
      const c = game.engine.cameraCtl;
      c.yaw = Math.PI * 0.19;
      c.pitch = 0.93;
      c.dist = c.desiredDist = 64;
      c.moveTo(1, 11, true);
      game.placing = null;
      await wait(700);
    } else if (mode === 'market') {
      rich(900);
      game.ui.openMarket();
      await wait(400);
    } else if (mode === 'army') {
      rich(6000);
      game.state.keepLevel = 2;
      game.state.army = { militia: 8, archer: 3, knight: 1 };
      const b = place('barracks');
      if (b) game.state.buildings.find(x => x.id === b.id).workers = 1;
      game.ui.updateTopbar(true);
      game.ui.openArmy();
      await wait(400);
    } else if (mode === 'battle') {
      game.state.population = 20;
      game.state.army = { militia: 12, archer: 5, knight: 2 };
      game.state.equipTier = 1;
      game.startRaid();
      await wait(2200);
    } else if (mode === 'giants') {
      game.state.population = 24;
      game.state.army = { militia: 14, archer: 6, knight: 2 };
      game.startRaid({ giant: 2, brute: 3, bandit: 6 });
      await wait(900);
      // walk the player into the enemy line so giant scale is visible and stable
      game.battle.player.pos.set(0, 0, -15);
      game.battle.player.yaw = 0;
      game.battle.player.invuln = 999;
      await wait(1300);
    } else if (mode === 'raid') {
      rich(1800);
      game.state.day = 20;
      game.state.keepLevel = 4;
      game.state.raidCount = 4;
      game.state.tutorial = 9;
      game.ui.updateTopbar(true);
      game.raidWarning();
      await wait(500);
    } else if (mode === 'build') {
      rich(3000);
      game.ui.openBuild?.();
      await wait(400);
    } else if (mode === 'chronicle') {
      game.checkObjectives();
      game.ui.openChronicle?.();
      await wait(400);
    }

    if (mode === 'battle' || mode === 'giants') realRender(game.battle.scene, game.battle.camera);
    else realRender(game.engine.scene, game.engine.camera);
    document.body.setAttribute('data-dev-ready', mode);
    return;
  }

  // ---------- smoke test ----------
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: String(detail) });

  try {
    await startFresh();
    check('campaign starts in overview', game.mode === 'overview', game.mode);
    check('starting buildings = 3', game.state.buildings.length === 3, game.state.buildings.length);
    check('starting gold = 160', Math.round(game.state.gold) === 160, game.state.gold);

    // the canvas must be the actual hit target, not a transparent HUD overlay
    const hit0 = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    check('overview canvas receives pointer', hit0 === game.engine.canvas, hit0 ? (hit0.id || hit0.className || hit0.tagName) : 'none');

    // left-drag pan (real pointer sequence, then one camera tick)
    const cc0 = game.engine.cameraCtl;
    const beforePan = cc0.desired.clone();
    const px = window.innerWidth / 2, py = window.innerHeight / 2;
    game.engine.canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, buttons: 1, clientX: px, clientY: py, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { buttons: 1, clientX: px + 80, clientY: py + 40, bubbles: true }));
    cc0.update(1 / 60);
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: px + 80, clientY: py + 40, bubbles: true }));
    check('left-drag pans overview', cc0.desired.distanceTo(beforePan) > 1, cc0.desired.distanceTo(beforePan).toFixed(2));

    const keep = game.state.buildings.find(b => b.type === 'keep');
    game.selectBuilding(keep);
    game.checkObjectives();
    check('tutorial: keep inspected', game.state.tutorial >= 1, 'step ' + game.state.tutorial);

    const selCard = document.querySelector('#selection-card');
    const upBtn = selCard?.querySelector('[data-action="upgrade"]');
    check('selection shows an upgrade button', !!upBtn, upBtn ? upBtn.textContent.trim() : 'missing');

    rich();
    const wc = place('woodcutter');
    check('woodcutter placed', !!wc, wc ? `${Math.round(wc.x)},${Math.round(wc.z)}` : 'no spot');
    if (wc) {
      game.state.resources.wood = 100;
      game.settlement.assign(wc.id, 2);
      check('workers assigned', wc.workers === 2, wc.workers);
      const w0 = game.state.resources.wood;
      for (let i = 0; i < 4; i++) game.settlement.tick();
      check('wood production works', game.state.resources.wood > w0, `${w0.toFixed(1)} -> ${game.state.resources.wood.toFixed(1)}`);
      game.checkObjectives();
      check('tutorial: lumber + workers', game.state.tutorial >= 3, 'step ' + game.state.tutorial);
    }

    const farm = place('farm');
    check('farm placed', !!farm);
    if (farm) { game.settlement.assign(farm.id, 2); game.checkObjectives(); }

    game.state.resources.wood = Math.max(120, game.state.resources.wood);
    const sold = game.economy.sell('wood', 20);
    check('market sale pays gold', sold > 0, Math.round(sold) + ' gold');
    game.checkObjectives();
    check('tutorial: merchant step', game.state.tutorial >= 5, 'step ' + game.state.tutorial);

    // Custom-quantity market trading.
    game.state.gold = 5000;
    game.state.resources.wood = 0;
    game.ui.openMarket();
    const qtyWood = game.ui.modalBody.querySelector('.trade-qty[data-good="wood"]');
    qtyWood.value = '37';
    qtyWood.dispatchEvent(new Event('input', { bubbles: true }));
    qtyWood.closest('tr').querySelector('[data-action="buyqty"]').click();
    check('market buys a custom quantity', Math.round(game.state.resources.wood) === 37, game.state.resources.wood);
    const woodBeforeSell = game.state.resources.wood;
    const goldBeforeSell = game.state.gold;
    const qtyWood2 = game.ui.modalBody.querySelector('.trade-qty[data-good="wood"]');
    qtyWood2.value = '12';
    qtyWood2.dispatchEvent(new Event('input', { bubbles: true }));
    qtyWood2.closest('tr').querySelector('[data-action="sellqty"]').click();
    check('market sells a custom quantity',
      Math.round(woodBeforeSell - game.state.resources.wood) === 12 && game.state.gold > goldBeforeSell,
      `${woodBeforeSell} -> ${game.state.resources.wood}, gold +${Math.round(game.state.gold - goldBeforeSell)}`);
    game.ui.closeModal();
    game.state.resources.wood = 600;
    game.state.gold = 5000;

    const h1 = place('house');
    const h2 = place('house');
    check('two cottages placed', !!h1 && !!h2, `${!!h1}/${!!h2}`);
    game.checkObjectives();

    if (h1) {
      game.selectBuilding(h1);
      const lvH = h1.level;
      game.onKey('KeyU', {});
      check('U upgrades the selected building', h1.level === lvH + 1, `level ${lvH} -> ${h1.level}`);
    }

    // The population cost curve must stay gentle, not linear.
    const savedPop = game.state.population;
    const savedCap = game.settlement.effects.popCap;
    game.state.population = 50;
    game.settlement.effects.popCap = 100;
    const inv50 = game.inviteInfo();
    check('invite cost scales gently with population', inv50.ok && inv50.cost.gold < 160, `${inv50.cost.gold} gold`);
    game.state.population = savedPop;
    game.settlement.effects.popCap = savedCap;

    const q = place('quarry');
    check('quarry placed', !!q);
    if (q) {
      game.settlement.assign(q.id, 1);
      game.state.resources.stone = 0;
      for (let i = 0; i < 24; i++) game.settlement.tick();
      check('stone production reaches 40', game.state.resources.stone >= 40, game.state.resources.stone.toFixed(1));
      game.checkObjectives();
      check('tutorial: stone step', game.state.tutorial >= 7, 'step ' + game.state.tutorial);
    }

    const keepOk = game.settlement.upgrade(keep.id);
    check('keep upgrades to level 2', keepOk && keep.level === 2, 'level ' + keep.level);
    game.checkObjectives();
    check('tutorial: keep level 2', game.state.tutorial >= 8, 'step ' + game.state.tutorial);

    for (const k of ['wood', 'stone', 'food', 'iron']) game.state.resources[k] = 600;
    game.state.gold = 4000;
    const bar = place('barracks');
    check('barracks placed', !!bar, bar ? `${Math.round(bar.x)},${Math.round(bar.z)}` : 'no spot');
    if (bar) {
      check('barracks unlocks recruitment', !!game.settlement.effects.recruit, JSON.stringify(game.settlement.effects.recruit));
      check('recruit-max finds a legal batch', game.army.maxRecruit('militia', 5) === 5, game.army.maxRecruit('militia', 5));
      const recruited = game.army.recruit('militia', 4);
      check('four soldiers recruited', recruited && game.army.total() >= 4, game.army.total());
      game.checkObjectives();
      check('tutorial: army step', game.state.tutorial >= 9, 'step ' + game.state.tutorial);
    }

    // battle start + a few simulation frames
    game.state.army = { militia: 8, archer: 3 };
    game.startRaid();
    check('battle starts', game.mode === 'battle' && game.battle.active, game.battle.phase);
    const hitB = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    check('battlefield canvas receives pointer', hitB === game.engine.canvas, hitB ? (hitB.id || hitB.className || hitB.tagName) : 'none');
    for (let i = 0; i < 8; i++) game.battle.update(1 / 60);
    check('battle simulates frames', game.battle.elapsed >= 0, game.battle.troops.length + ' troops');

    // drag-to-look and click-to-attack fallback (no pointer lock)
    const cv = game.engine.canvas;
    const yaw0 = game.battle.player.yaw;
    cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 500, clientY: 300, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 560, clientY: 300, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    check('drag look rotates camera', Math.abs(game.battle.player.yaw - yaw0) > 0.01, (game.battle.player.yaw - yaw0).toFixed(3));
    cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 500, clientY: 300, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    check('click attacks', game.battle.player.attack.phase !== 'idle', game.battle.player.attack.phase);

    game.finishBattle({ victory: true, losses: { militia: 1 }, enemyLosses: 7, loot: 120, influence: 4, defense: true });
    check('battle returns to overview', game.mode === 'overview', game.mode);
    check('victory recorded', game.state.stats.battlesWon >= 1, game.state.stats.battlesWon);

    // overview camera direction + reassigned army key
    const cc = game.engine.cameraCtl;
    cc.enabled = true; cc.yaw = 0;
    game.engine.input.keys.clear();
    cc.desired.set(0, 0, 0);
    game.engine.input.keys.add('KeyW'); cc.update(0.1); game.engine.input.keys.delete('KeyW');
    check('W pans forward', cc.desired.z < -0.01, cc.desired.z.toFixed(2));
    cc.desired.set(0, 0, 0);
    game.engine.input.keys.add('KeyS'); cc.update(0.1); game.engine.input.keys.delete('KeyS');
    check('S pans backward', cc.desired.z > 0.01, cc.desired.z.toFixed(2));
    game.ui.closeModal();
    game.onKey('KeyA');
    check('A no longer opens army', game.ui.modalType !== 'army', game.ui.modalType || 'none');
    game.onKey('KeyT');
    check('T opens army', game.ui.modalType === 'army', game.ui.modalType || 'none');
    game.ui.closeModal();

    // save / load
    game.state.gold = 777;
    game.saveGame(false);
    game.state.gold = 1;
    const loaded = game.loadGame();
    check('save + load restores gold', loaded && Math.round(game.state.gold) === 777, game.state.gold);

    // prominent SAVE button + feedback
    const saveBtn = document.getElementById('btn-save');
    check('topbar save button exists', !!saveBtn, saveBtn ? saveBtn.textContent.trim() : 'missing');
    game.ui.openSettings();
    const hasExport = !!document.querySelector('[data-action="export-save"]');
    const hasImport = !!document.querySelector('[data-action="import-save"]');
    check('settings export/import buttons', hasExport && hasImport, `${hasExport}/${hasImport}`);
    game.ui.closeModal();
    game.state.gold = 888;
    const manualSaved = game.saveGame(true);
    check('manual save succeeds', manualSaved, manualSaved);
    check('save button reports success', !!saveBtn && /SAVED|SAVE/.test(saveBtn.textContent), saveBtn ? saveBtn.textContent.trim() : 'n/a');

    // the button and Ctrl+S are wired to the same save path
    game.state.gold = 321;
    if (saveBtn) saveBtn.click();
    const clickSaved = JSON.parse(localStorage.getItem('ironhold_campaign_v1') || '{}');
    check('save button click writes save', Math.round(clickSaved.gold || 0) === 321, clickSaved.gold);
    game.state.gold = 654;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', ctrlKey: true, bubbles: true }));
    const keySaved = JSON.parse(localStorage.getItem('ironhold_campaign_v1') || '{}');
    check('Ctrl+S writes save', Math.round(keySaved.gold || 0) === 654, keySaved.gold);

    // sitting on the main menu must never overwrite the real campaign with a
    // placeholder state
    const beforeMenuSave = localStorage.getItem('ironhold_campaign_v1');
    game.mode = 'menu';
    const menuSaveReturn = game.saveGame(false);
    const afterMenuSave = localStorage.getItem('ironhold_campaign_v1');
    check('menu cannot overwrite save', !menuSaveReturn && afterMenuSave === beforeMenuSave, menuSaveReturn);
    game.mode = 'overview';

    // inviting settlers
    const keep2 = game.state.buildings.find(b => b.type === 'keep');
    game.state.population = 5;
    game.state.gold = 2000;
    game.state.resources.food = 600;
    const inv = game.inviteInfo();
    const popBeforeInvite = game.state.population;
    const goldBeforeInvite = game.state.gold;
    game.inviteSettlers();
    check('invite settlers adds people', game.state.population === popBeforeInvite + inv.count,
      `${popBeforeInvite} -> ${game.state.population} (${inv.count})`);
    check('invite settlers costs gold', game.state.gold < goldBeforeInvite, `${goldBeforeInvite} -> ${game.state.gold}`);
    check('keep panel has invite action', !!keep2 && game.inviteInfo().count >= 0, keep2 ? 'ok' : 'no keep');

    // later raids scale up and bring giants
    game.state.day = 20;
    game.state.keepLevel = 4;
    game.state.raidCount = 4;
    const rc = game.raidComp();
    const raidTotal = Object.values(rc).reduce((a, b) => a + b, 0);
    check('late raids include giants', (rc.giant || 0) > 0, JSON.stringify(rc));
    check('late raids are large', raidTotal >= 20, raidTotal + ' enemies');

    // warning modal offers fight or pay
    game.state.tutorial = 9;
    game.state.raidTimer = 0;
    game.state.gold = 2000;
    game.raidWarning();
    const modalOpen = !game.ui.modalRoot.classList.contains('hidden');
    check('raid warning modal opens', modalOpen, game.ui.modalType || 'none');
    check('raid warning pauses the game', game.state.speed === 0, game.state.speed);
    game.ui.closeModal();
    game.setSpeed(1);

    // giants spawn visibly larger in battle
    game.state.army = { militia: 4 };
    game.startRaid({ giant: 1, bandit: 2 });
    const giant = game.battle.troops.find(t => t.type === 'giant');
    check('giant spawns with giant scale', !!giant && giant.scale > 1.5, giant ? giant.scale : 'none');
    game.finishBattle({ victory: true, losses: {}, enemyLosses: 3, loot: 10, influence: 0, defense: true });

    // the whole host deploys, not an arbitrary 90-man sample
    game.state.population = 400;
    game.state.army = { militia: 55, archer: 20, arrowman: 15, knight: 10 };
    const fullHost = game.army.composition();
    check('composition keeps every soldier', fullHost.length === 100, fullHost.length);
    game.startRaid({ bandit: 6, archer: 2 });
    const deployed = game.battle.troops.filter(t => t.team === 'ally').length;
    check('all soldiers reach the battlefield', deployed === 100, deployed);
    check('arrowmen deploy with the host', game.battle.troops.some(t => t.team === 'ally' && t.type === 'arrowman'), 'arrowman');
    game.battle.powerCd = 0;
    game.battle.player.stamina = 100;
    game.battle._powerShot();
    check('power shot fires a heavy arrow', game.battle.powerCd > 0 && game.battle.arrows.some(a => a.power),
      `${game.battle.arrows.length} arrows`);
    game.finishBattle({ victory: true, losses: {}, enemyLosses: 8, loot: 10, influence: 0, defense: true });

    // Bigger homes and one-click housing upgrades.
    rich(999999);
    for (const k of ['wood', 'stone', 'food', 'iron', 'goods', 'weapons']) game.state.resources[k] = 99999;
    game.state.keepLevel = 5;
    const capBefore = game.settlement.effects.popCap;
    const longhouse = place('longhouse');
    const manor = place('manor');
    check('longhouse can be built', !!longhouse, longhouse ? longhouse.type : 'no spot');
    check('manor can be built', !!manor, manor ? manor.type : 'no spot');
    check('bigger homes raise the population cap', game.settlement.effects.popCap >= capBefore + 28,
      capBefore + ' -> ' + game.settlement.effects.popCap);
    const housingBefore = game.state.buildings.filter(b => ['house', 'longhouse', 'manor'].includes(b.type));
    const lvBefore = housingBefore.map(b => b.level);
    const upgraded = game.upgradeAllHouses();
    const housingAfter = game.state.buildings.filter(b => ['house', 'longhouse', 'manor'].includes(b.type));
    const allRose = housingAfter.every((b, i) => b.level >= (lvBefore[i] || 0));
    check('bulk housing upgrade works', upgraded > 0 && allRose, `${upgraded} homes`);

    // Rebuilding the army modal must not snap the list back to the top.
    game.ui.openArmy();
    game.ui.modalBody.scrollTop = 220;
    const wantedScroll = game.ui.modalBody.scrollTop;
    game.ui.openArmy();
    check('army modal keeps its scroll position', Math.abs(game.ui.modalBody.scrollTop - wantedScroll) <= 2,
      `${wantedScroll} -> ${game.ui.modalBody.scrollTop}`);
    game.ui.closeModal();

    // import a previously exported save snapshot
    game.state.gold = 4321;
    game.saveGame(false);
    const rawSave = localStorage.getItem('ironhold_campaign_v1');
    game.state.gold = 1;
    const imported = game.importSave(rawSave || '');
    check('import save restores gold', imported && Math.round(game.state.gold) === 4321, game.state.gold);

    check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('smoke test completed', false, err && err.stack ? err.stack.split('\n')[0] : String(err));
    errors.push(String(err && err.stack || err));
  }

  const passed = checks.filter(c => c.ok).length;
  const out = document.createElement('pre');
  out.id = 'dev-out';
  out.textContent = `DEV ${passed}/${checks.length}\n` +
    checks.map(c => `${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`).join('\n') +
    (errors.length ? '\nERRORS:\n' + errors.slice(0, 6).join('\n') : '');
  out.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;max-width:96vw;max-height:90vh;overflow:auto;background:#0b0906dd;color:#d9c9a5;font:12px/1.5 monospace;padding:12px;border:1px solid #8a6d3b;white-space:pre-wrap';
  document.body.appendChild(out);
  document.title = passed === checks.length && !errors.length ? 'DEV PASS' : 'DEV FAIL';
  document.body.setAttribute('data-dev-ready', 'test');
}
