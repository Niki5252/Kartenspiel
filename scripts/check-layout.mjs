/**
 * Layout-Prüfung im echten Browser (optional, nicht Teil von `npm test`).
 *
 * Voraussetzung: `npm run dev` läuft und Playwright ist installiert:
 *   npm i -D playwright && npx playwright install chromium
 * Aufruf:  npm run check:layout        (Basis-URL über ORLAN_URL änderbar)
 *
 * Prüft auf mehreren Bildschirmgrößen und Spielsituationen (Dev-Vorschau /dev/ui):
 * - alle Tischkarten liegen vollständig innerhalb der Tischmitte
 * - keine Tischkarte wird vom eigenen Handbereich überdeckt
 * - kein horizontales Scrollen, eigener Timer sichtbar und unverdeckt
 * - gesammelte Haufen: 2 / 3 Spieler je eigener Haufen, 4 Spieler zwei Team-Haufen
 */
import { chromium } from 'playwright';

const BASE = process.env.ORLAN_URL ?? 'http://localhost:5173';
const VIEWPORTS = [[360, 640], [360, 740], [390, 844], [412, 915], [1280, 720], [1366, 657], [1440, 900], [690, 420] /* Dev-Splitscreen-Fenster */];
const SCENARIOS = ['myturn', 'fulltable', 'capture', 'otherturn', 'mycut'];
const PLAYERS = [2, 3, 4];
const EXPECTED_PILES = { 2: 2, 3: 3, 4: 2 };

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const failures = [];
let checks = 0;
for (const [W, H] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  for (const players of PLAYERS) {
    for (const scenario of SCENARIOS) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${BASE}/dev/ui?scenario=${scenario}&players=${players}`);
      await page.waitForSelector('.game .center__body');
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const center = document.querySelector('.center').getBoundingClientRect();
        const me = document.querySelector('.me')?.getBoundingClientRect();
        const cards = [...document.querySelectorAll('.table-cards .card')].map((c) => c.getBoundingClientRect());
        const clipped = cards.filter((b) => b.top < center.top - 0.5 || b.bottom > center.bottom + 0.5 || b.left < -0.5 || b.right > innerWidth + 0.5);
        const underHand = me ? cards.filter((b) => b.bottom > me.top + 0.5) : [];
        // Kein Inhalt der Tischmitte (Auswahl, Schneiden, Deck) darf in den eigenen Bereich ragen
        const spill = [...document.querySelectorAll('.center__body > *')]
          .filter((el) => getComputedStyle(el).display !== 'none')
          .filter((el) => el.getBoundingClientRect().bottom > center.bottom + 1).length;
        const timer = document.querySelector('.timer--mine');
        let timerClear = true;
        if (timer) {
          const t = timer.getBoundingClientRect();
          const hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
          timerClear = !!hit && timer.contains(hit) && t.top >= 0 && t.bottom <= innerHeight;
        }
        return {
          cards: cards.length, clipped: clipped.length, underHand: underHand.length, spill,
          overflowX: document.documentElement.scrollWidth > innerWidth + 1,
          piles: document.querySelectorAll('.pile').length, timerClear,
        };
      });
      checks++;
      const tag = `${W}x${H} ${players}p ${scenario}`;
      if (r.clipped) failures.push(`${tag}: ${r.clipped} Tischkarte(n) abgeschnitten`);
      if (r.underHand) failures.push(`${tag}: ${r.underHand} Tischkarte(n) vom Handbereich überdeckt`);
      if (r.overflowX) failures.push(`${tag}: horizontales Scrollen`);
      if (r.spill) failures.push(`${tag}: Inhalt der Tischmitte ragt in den Handbereich`);
      if (!r.timerClear) failures.push(`${tag}: eigener Timer verdeckt/außerhalb`);
      if (r.piles !== EXPECTED_PILES[players]) failures.push(`${tag}: ${r.piles} Haufen statt ${EXPECTED_PILES[players]}`);
      for (const e of errors) failures.push(`${tag}: JS-Fehler ${e}`);
      await page.close();
    }
  }
  await ctx.close();
}
await browser.close();
console.log(`${checks} Ansichten geprüft, ${failures.length} Probleme.`);
for (const f of failures) console.log(' ✗', f);
process.exit(failures.length ? 1 : 0);
