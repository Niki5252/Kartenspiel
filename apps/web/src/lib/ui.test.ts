/**
 * Darstellung: eigener Timer, farbige Kartensymbole, Kombinationsauswahl.
 */
import { createMatch, createSeededRng, findCaptureOptions, parseCardId, projectMatchView, sortTable } from '@orlan/game';
import type { PlayerPublic, RoomView } from '@orlan/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardLabel, CardList } from '../components/CardLabel';
import { PlayingCard } from '../components/PlayingCard';
import { captureSelectionState, toggleCaptureCard } from './captureSelection';
import { timerDisplay, timerHue } from './timerDisplay';

const card = (id: string) => parseCardId(id)!;
const cards = (ids: string) => ids.split(' ').map(card);

function view(viewerSeat: number, mutate: (s: ReturnType<typeof createMatch>['state']) => void): RoomView {
  const { state } = createMatch({ playerCount: 2, firstDealerSeat: 0 }, { now: 0, rng: createSeededRng(1) });
  mutate(state);
  const players: PlayerPublic[] = ['Nikola', 'Ana'].map((name, seat) => ({
    id: `p${seat}`, name, team: null, ready: true, connected: true, everConnected: true, isHost: seat === 0, isBot: false, seat,
  }));
  return {
    code: 'ABC234', maxPlayers: 2, status: 'playing', hostId: 'p0', myPlayerId: `p${viewerSeat}`, players,
    seats: ['p0', 'p1'], countdownEndsAt: null, startBlockers: [], match: projectMatchView(state, viewerSeat),
    isDevRoom: false, serverNow: 0, notice: null,
  };
}

describe('Eigener Timer', () => {
  const turn = (s: ReturnType<typeof createMatch>['state']) => {
    s.round.phase = 'turn';
    s.round.currentSeat = 1;
    s.round.phaseStartedAt = 0;
    s.round.deadline = 30_000;
  };

  it('aktiver Spieler sieht "Dein Zug · 24 s", hervorgehoben', () => {
    const t = timerDisplay(view(1, turn), 6_000)!;
    expect(t).toMatchObject({ isMine: true, kind: 'turn', label: 'Dein Zug · 24 s', secondsLeft: 24, totalMs: 30_000 });
    expect(t.fraction).toBeCloseTo(0.8);
  });

  it('andere sehen, wie viel Zeit der aktive Spieler noch hat', () => {
    expect(timerDisplay(view(0, turn), 6_000)).toMatchObject({ isMine: false, label: 'Ana ist am Zug · 24 s' });
  });

  it('Kombinationsauswahl nutzt denselben 30-s-Zugtimer', () => {
    const t = timerDisplay(
      view(1, (s) => {
        turn(s);
        s.round.phase = 'choosingCapture';
        s.round.pending = { seat: 1, card: card('H2'), options: [['S9'], ['C6', 'D3']] };
      }),
      29_100,
    )!;
    expect(t).toMatchObject({ isMine: true, kind: 'turn', label: 'Dein Zug · 1 s', totalMs: 30_000 });
  });

  it('Schneiden: 15 s, eigene Beschriftung', () => {
    const t = timerDisplay(
      view(1, (s) => {
        s.round.phase = 'cutting';
        s.round.deadline = 15_000;
      }),
      3_000,
    )!;
    expect(t).toMatchObject({ isMine: true, kind: 'cut', label: 'Du schneidest · 12 s', totalMs: 15_000 });
  });

  it('Farbverlauf Grün -> Gelb -> Orange -> Rot', () => {
    expect(timerHue(1)).toBe(130);
    expect(timerHue(0.42)).toBeGreaterThan(50);
    expect(timerHue(0.42)).toBeLessThan(60);
    expect(timerHue(0.23)).toBeLessThan(35);
    expect(timerHue(0)).toBe(0);
    for (let f = 0; f < 1; f += 0.1) expect(timerHue(f)).toBeLessThanOrEqual(timerHue(f + 0.1));
  });
});

describe('Kartenfarben', () => {
  it('Herz und Karo rot, Kreuz und Pik schwarz – mit Symbol', () => {
    const html = (id: string) => renderToStaticMarkup(createElement(CardLabel, { card: card(id) }));
    expect(html('H9')).toContain('mini-card--red');
    expect(html('H9')).toContain('♥');
    expect(html('D10')).toContain('mini-card--red');
    expect(html('D10')).toContain('♦');
    expect(html('C9')).toContain('mini-card--black');
    expect(html('C9')).toContain('♣');
    expect(html('SK')).toContain('mini-card--black');
    expect(html('SK')).toContain('♠');
  });

  it('Kartenlisten und große Karten verwenden dieselben Farben', () => {
    const list = renderToStaticMarkup(createElement(CardList, { cards: cards('H9 C9') }));
    expect(list.indexOf('mini-card--red')).toBeLessThan(list.indexOf('mini-card--black'));
    expect(renderToStaticMarkup(createElement(PlayingCard, { card: card('D2') }))).toContain('card--red');
    expect(renderToStaticMarkup(createElement(PlayingCard, { card: card('S2') }))).toContain('card--black');
  });
});

describe('Kombinationsauswahl', () => {
  it('9♥ und 9♣ sind getrennt als einzelne konkrete Karten wählbar', () => {
    const table = sortTable(cards('H9 C9'));
    const played = card('D2');
    const options = findCaptureOptions(played, table);
    expect(options).toEqual([['C9'], ['H9']]);
    const heart = captureSelectionState(played, options, table, toggleCaptureCard(options, [], 'H9'));
    expect(heart.match).toEqual(['H9']);
    // Wechsel auf Kreuz ersetzt die Auswahl, statt beide zu wählen
    const switched = toggleCaptureCard(options, ['H9'], 'C9');
    expect(switched).toEqual(['C9']);
    expect(captureSelectionState(played, options, table, switched).match).toEqual(['C9']);
  });

  it('zeigt nur legale Karten; Summe und "Nehmen" erst bei gültiger Kombination', () => {
    // Beispiel: 2 gespielt -> 9, 6+3, 5+4 möglich; K ist nicht wählbar
    const table = sortTable(cards('S9 C6 D3 H5 S4 HK'));
    const played = card('C2');
    const options = findCaptureOptions(played, table);
    expect(options).toHaveLength(3);
    const empty = captureSelectionState(played, options, table, []);
    expect([...empty.legalIds].sort()).toEqual(['C6', 'D3', 'H5', 'S4', 'S9']);
    expect(empty.legalIds.has('HK')).toBe(false);
    expect(empty.match).toBeNull();
    expect(toggleCaptureCard(options, [], 'HK')).toEqual([]); // nicht legal -> keine Auswahl

    const partial = captureSelectionState(played, options, table, toggleCaptureCard(options, [], 'C6'));
    expect(partial.match).toBeNull();
    expect(partial.sum).toBe(8);
    expect([...partial.selectableIds].sort()).toEqual(['C6', 'D3']); // passt nur noch 3

    const full = captureSelectionState(played, options, table, toggleCaptureCard(options, ['C6'], 'D3'));
    expect(full.match).toEqual(['D3', 'C6']);
    expect(full.sum).toBe(11);

    // inkompatible Karte beginnt eine neue Auswahl
    expect(toggleCaptureCard(options, ['C6'], 'H5')).toEqual(['H5']);
    // abwählen
    expect(toggleCaptureCard(options, ['C6', 'D3'], 'D3')).toEqual(['C6']);
  });

  it('Dame/König: eine Karte antippen genügt, keine Summe', () => {
    const table = sortTable(cards('HQ SQ'));
    const options = findCaptureOptions(card('CQ'), table);
    const s = captureSelectionState(card('CQ'), options, table, ['SQ']);
    expect(s.match).toEqual(['SQ']);
    expect(s.isSum).toBe(false);
  });
});
