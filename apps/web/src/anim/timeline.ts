/**
 * Animations-Zeitpläne – reine Funktionen ohne DOM.
 *
 * Grundprinzip: Der Server bestimmt Phase, phaseStartedAt und Dauer. Der Client zeigt den Moment
 * `serverNow - phaseStartedAt` dieser Phase. Alle Clients sehen so dieselbe Animation; nach einem
 * Reconnect startet die Darstellung an der richtigen Stelle bzw. zeigt direkt den Endzustand.
 * Nichts hier verändert oder beeinflusst den Spielzustand.
 */
import { type Card, type PlayerCount, type SeatIndex, dealingOrder, sortTable } from '@orlan/game';
import type { RoomView } from '@orlan/protocol';

// ---------------------------------------------------------------------------
// Zeitachsen
// ---------------------------------------------------------------------------

export interface MoveTimeline {
  /** gespielte Karte erreicht die Mitte */
  flyInEnd: number;
  /** aufzunehmende Karten sind hervorgehoben/angehoben */
  liftEnd: number;
  /** alle Karten sind in der Mitte zusammengezogen */
  gatherEnd: number;
  /** Karten sind beim Spieler/Team angekommen (= Ende der Phase) */
  total: number;
}

export function moveTimeline(totalMs: number): MoveTimeline {
  return { flyInEnd: Math.round(totalMs * 0.35), liftEnd: Math.round(totalMs * 0.58), gatherEnd: Math.round(totalMs * 0.77), total: totalMs };
}

export const CHIP_FLIGHT_MS = 600;
export const PACKET_FLIGHT_MS = 420;

/** Schnitt-Animation (Phase cutReveal): anheben -> Karte zeigen -> unterlegen. Anteile der Phasendauer. */
export function cutTimeline(totalMs: number) {
  return { liftEnd: Math.round(totalMs * 0.25), revealAt: Math.round(totalMs * 0.3), tuckStart: Math.round(totalMs * 0.62), total: totalMs };
}

/** Anzahl der 4er-Pakete eines Austeilvorgangs (beim ersten Austeilen zusätzlich der Tisch). */
export function dealPacketCount(playerCount: PlayerCount, initial: boolean): number {
  return playerCount + (initial ? 1 : 0);
}

export interface PacketTiming {
  startMs: number;
  durationMs: number;
}

/** Kompakter Zeitplan: alle Pakete landen innerhalb der Austeilphase, nacheinander. */
export function dealPacketSchedule(count: number, dealMs: number): PacketTiming[] {
  const durationMs = Math.min(PACKET_FLIGHT_MS, dealMs);
  const lastStart = Math.max(0, dealMs - durationMs - 120);
  const stagger = count > 1 ? Math.min(320, lastStart / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => ({ startMs: Math.round(i * stagger), durationMs }));
}

export type DealTarget = { kind: 'seat'; seat: SeatIndex } | { kind: 'table' };

export interface DealPacket extends PacketTiming {
  target: DealTarget;
  arriveMs: number;
}

/** Pakete in echter Austeilreihenfolge: rechts vom Dealer beginnend, Tisch je nach Wahl zuerst/zuletzt. */
export function dealPackets(view: RoomView): DealPacket[] {
  const match = view.match;
  if (!match) return [];
  const r = match.round;
  const initial = r.dealsDone === 1;
  const targets: DealTarget[] = dealingOrder(r.dealerSeat, match.playerCount).map((seat) => ({ kind: 'seat', seat }));
  if (initial) {
    if (r.dealOrder === 'tableFirst') targets.unshift({ kind: 'table' });
    else targets.push({ kind: 'table' });
  }
  const schedule = dealPacketSchedule(targets.length, match.timings.dealMs);
  return targets.map((target, i) => {
    const t = schedule[i]!;
    return { target, ...t, arriveMs: t.startMs + t.durationMs };
  });
}

// ---------------------------------------------------------------------------
// Flüge (Overlay-Animationen zwischen DOM-Ankern)
// ---------------------------------------------------------------------------

export interface Waypoint {
  /** ms relativ zu phaseStartedAt */
  at: number;
  /** data-anchor des Ziel-Elements */
  anchor: string;
  dy?: number;
  scale?: number;
  opacity?: number;
}

export interface Flight {
  key: string;
  kind: 'card' | 'packet' | 'chip';
  card?: Card;
  waypoints: Waypoint[];
}

export const anchors = {
  seat: (seat: SeatIndex) => `seat-${seat}`,
  chip: (seat: SeatIndex) => `chip-${seat}`,
  tableCard: (id: string) => `tcard-${id}`,
  deck: 'deck',
  slot: 'slot',
  table: 'table',
} as const;

export function previousDealerSeat(dealer: SeatIndex, playerCount: PlayerCount): SeatIndex {
  return (dealer - 1 + playerCount) % playerCount;
}

/** Alle Flüge der aktuellen Phase. Reine Funktion der Server-Sicht. */
export function planFlights(view: RoomView): Flight[] {
  const match = view.match;
  if (!match) return [];
  const r = match.round;
  const n = match.playerCount;
  const base = `${r.number}-${r.phase}-${r.phaseStartedAt}`;

  switch (r.phase) {
    case 'shuffling': {
      if (r.number <= 1) return [];
      // Dealer-Chip wandert sichtbar einen Sitz nach rechts.
      return [
        {
          key: `${base}-chip`,
          kind: 'chip',
          waypoints: [
            { at: 0, anchor: anchors.chip(previousDealerSeat(r.dealerSeat, n)), opacity: 1 },
            { at: CHIP_FLIGHT_MS, anchor: anchors.chip(r.dealerSeat), opacity: 1 },
          ],
        },
      ];
    }
    case 'dealing':
      return dealPackets(view).map((p, i) => ({
        key: `${base}-packet-${i}`,
        kind: 'packet',
        waypoints: [
          { at: p.startMs, anchor: anchors.deck, scale: 0.9, opacity: 1 },
          { at: p.arriveMs, anchor: p.target.kind === 'table' ? anchors.table : anchors.seat(p.target.seat), scale: 0.7, opacity: 0 },
        ],
      }));
    case 'choosingCapture': {
      const pending = r.pending;
      if (!pending) return [];
      const t = moveTimeline(match.timings.moveAnimationMs);
      return [
        {
          key: `${base}-pending`,
          kind: 'card',
          card: pending.card,
          waypoints: [
            { at: 0, anchor: anchors.seat(pending.seat), scale: 0.8, opacity: 0.6 },
            { at: t.flyInEnd, anchor: anchors.slot, scale: 1, opacity: 1 },
          ],
        },
      ];
    }
    case 'moveAnimation': {
      const move = r.lastMove;
      if (!move) return [];
      const t = moveTimeline(match.timings.moveAnimationMs);
      const start = move.viaChoice ? anchors.slot : anchors.seat(move.seat);
      const collector = anchors.seat(move.seat);
      if (move.captured.length === 0) {
        // Fall A: Karte fliegt in die Mitte und wird dann sortiert in den Tisch eingereiht.
        return [
          {
            key: `${base}-played`,
            kind: 'card',
            card: move.card,
            waypoints: [
              { at: 0, anchor: start, scale: move.viaChoice ? 1 : 0.8, opacity: move.viaChoice ? 1 : 0.6 },
              { at: t.flyInEnd, anchor: anchors.slot, scale: 1, opacity: 1 },
              { at: t.liftEnd, anchor: anchors.tableCard(move.card.id), scale: 1, opacity: 1 },
            ],
          },
        ];
      }
      // Fall B: gespielte Karte in die Mitte, Aufnahme hervorheben, zusammenziehen, zum Spieler/Team.
      const flights: Flight[] = [
        {
          key: `${base}-played`,
          kind: 'card',
          card: move.card,
          waypoints: [
            { at: 0, anchor: start, scale: move.viaChoice ? 1 : 0.8, opacity: move.viaChoice ? 1 : 0.6 },
            { at: t.flyInEnd, anchor: anchors.slot, scale: 1, opacity: 1 },
            { at: t.gatherEnd, anchor: anchors.slot, scale: 1, opacity: 1 },
            { at: t.total, anchor: collector, scale: 0.45, opacity: 0 },
          ],
        },
      ];
      move.captured.forEach((card, i) => {
        flights.push({
          key: `${base}-cap-${card.id}`,
          kind: 'card',
          card,
          waypoints: [
            { at: t.liftEnd, anchor: anchors.tableCard(card.id), dy: -10, scale: 1, opacity: 1 },
            { at: t.gatherEnd, anchor: anchors.slot, dy: -4 * (i + 1), scale: 1, opacity: 1 },
            { at: t.total, anchor: collector, scale: 0.45, opacity: 0 },
          ],
        });
      });
      return flights;
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Sichtbarkeit statischer Elemente während einer Animation
// ---------------------------------------------------------------------------

export interface PhaseVisibility {
  /** Tischkarten, wie sie gerade gezeigt werden (inkl. noch nicht eingesammelter Aufnahmekarten). */
  table: Card[];
  /** Karten-ID -> ms, ab wann die Karte am Tisch sichtbar ist. */
  tableAppearAt: Record<string, number>;
  /** Karten-ID -> ms, ab wann die Karte am Tisch ausgeblendet wird (Flug übernimmt). */
  tableHideAt: Record<string, number>;
  /** Karten-IDs, die gerade hervorgehoben/angehoben werden (Aufnahme). */
  lifted: string[];
  /** Sitz -> ms, ab wann dessen (neue) Handkarten sichtbar sind. */
  handAppearAt: Record<number, number>;
  /** ms, ab wann der Dealer-Chip am neuen Platz sichtbar ist. */
  chipAppearAt: number;
  /** ms, ab wann die Karte in der Mitte (Auswahlphase) statisch sichtbar ist. */
  slotAppearAt: number;
}

export function phaseVisibility(view: RoomView): PhaseVisibility {
  const empty: PhaseVisibility = { table: [], tableAppearAt: {}, tableHideAt: {}, lifted: [], handAppearAt: {}, chipAppearAt: 0, slotAppearAt: 0 };
  const match = view.match;
  if (!match) return empty;
  const r = match.round;
  const vis: PhaseVisibility = { ...empty, table: r.table };
  const t = moveTimeline(match.timings.moveAnimationMs);

  if (r.phase === 'shuffling' && r.number > 1) vis.chipAppearAt = CHIP_FLIGHT_MS;

  if (r.phase === 'dealing') {
    for (const p of dealPackets(view)) {
      if (p.target.kind === 'table') for (const c of r.table) vis.tableAppearAt[c.id] = p.arriveMs;
      else vis.handAppearAt[p.target.seat] = p.arriveMs;
    }
  }

  if (r.phase === 'choosingCapture') vis.slotAppearAt = t.flyInEnd;

  if (r.phase === 'moveAnimation' && r.lastMove) {
    const move = r.lastMove;
    if (move.captured.length === 0) {
      vis.tableAppearAt[move.card.id] = t.liftEnd;
    } else {
      // Aufnahmekarten bleiben bis zum Zusammenziehen an ihrem Platz sichtbar und werden angehoben.
      vis.table = sortTable([...r.table, ...move.captured]);
      vis.lifted = move.captured.map((c) => c.id);
      for (const c of move.captured) vis.tableHideAt[c.id] = t.liftEnd;
    }
  }
  return vis;
}

/** Alle Zeitpunkte, an denen sich die statische Darstellung ändert (für gezielte Re-Renders). */
export function visibilityMilestones(vis: PhaseVisibility): number[] {
  const all = [
    ...Object.values(vis.tableAppearAt),
    ...Object.values(vis.tableHideAt),
    ...Object.values(vis.handAppearAt),
    vis.chipAppearAt,
    vis.slotAppearAt,
  ].filter((m) => m > 0);
  return [...new Set(all)].sort((a, b) => a - b);
}

/** Letzter Zeitpunkt aller Flüge – muss innerhalb der Serverphase liegen. */
export function flightsEnd(flights: readonly Flight[]): number {
  return Math.max(0, ...flights.flatMap((f) => f.waypoints.map((w) => w.at)));
}

/**
 * Flüge, die zum Zeitpunkt `elapsed` noch laufen. Nach einem Reconnect oder auf einem langsamen Gerät
 * werden bereits beendete Flüge übersprungen – es gilt sofort der echte Serverzustand.
 */
export function activeFlights(flights: readonly Flight[], elapsed: number): Flight[] {
  return flights.filter((f) => flightsEnd([f]) > elapsed);
}
