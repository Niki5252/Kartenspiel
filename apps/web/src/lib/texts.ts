/**
 * Spieltexte – rein, testbar.
 */
import type { Card } from '@orlan/game';
import type { RoomView } from '@orlan/protocol';
import { playerAtSeat, shortCard } from './display';

/** "A", "A und B", "A, B und C" */
export function joinGerman(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}

/** Meldung beim ersten Tisch-Aufdecken, wenn Buben ans Ende des Decks gelegt werden. */
export function jackNoticeText(jacks: readonly Card[], label: (c: Card) => string = shortCard): string {
  if (jacks.length === 0) return '';
  const one = jacks.length === 1;
  return `${joinGerman(jacks.map(label))} ${one ? 'wurde' : 'wurden'} aufgedeckt und ans Ende des Decks gelegt. Der Dealer erhält ${
    one ? 'diese Karte' : 'diese Karten'
  } am Schluss.`;
}

export type MatchEndKind = 'win' | 'lose' | 'neutral';

export interface MatchEndText {
  kind: MatchEndKind;
  text: string;
  /** Namen der Gewinner (1 bei 2/3 Spielern, 2 bei 4 Spielern). */
  winners: string[];
}

/**
 * Hauptmeldung am Matchende – abhängig davon, wer sie sieht. Nie "Team 1/2 gewinnt", immer echte Namen.
 * - Gewinner (2/3 Spieler): "Nikola gewinnt – herzlichen Glückwunsch!"
 * - Gewinner (4 Spieler):   "Nikola und Gabriel haben gewonnen!"
 * - Verlierer (2/3):        "Nikola gewinnt, du bist so schlecht XD!"
 * - Verlierer (4):          "Nikola und Gabriel haben gewonnen, ihr seid so schlecht XD!"
 */
export function matchEndText(view: RoomView): MatchEndText | null {
  const match = view.match;
  if (!match || match.status !== 'finished' || !match.winner) return null;
  const side = match.sides.find((s) => s.id === match.winner);
  if (!side) return null;
  const winners = side.seats.map((seat) => playerAtSeat(view, seat)?.name ?? `Sitz ${seat + 1}`);
  const names = joinGerman(winners);
  const team = winners.length > 1;
  const mySeat = match.mySeat;
  if (mySeat === null) {
    return { kind: 'neutral', winners, text: team ? `${names} haben gewonnen!` : `${names} gewinnt!` };
  }
  if (side.seats.includes(mySeat)) {
    return { kind: 'win', winners, text: team ? `${names} haben gewonnen!` : `${names} gewinnt – herzlichen Glückwunsch!` };
  }
  return {
    kind: 'lose',
    winners,
    text: team ? `${names} haben gewonnen, ihr seid so schlecht XD!` : `${names} gewinnt, du bist so schlecht XD!`,
  };
}

/** Spielernamen eines Teams/einer Seite (für Tabellenköpfe der Auswertung). */
export function sideMemberNames(view: RoomView, seats: readonly number[]): string[] {
  return seats.map((seat) => playerAtSeat(view, seat)?.name ?? `Sitz ${seat + 1}`);
}
