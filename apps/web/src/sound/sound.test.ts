import { DEFAULT_TIMINGS, type MatchEvent, parseCardId } from '@orlan/game';
import { describe, expect, it, vi } from 'vitest';
import { type SoundContext, soundsForEvents } from './eventSounds';
import { SoundPlayer } from './soundPlayer';
import { SOUND_MUTED_KEY, createSoundSettings } from './soundSettings';
import { SOUND_NAMES, SYNTHS } from './sounds';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
}

describe('Sound AN / STUMM', () => {
  it('ist standardmäßig an und merkt sich STUMM lokal', () => {
    const storage = memoryStorage();
    const settings = createSoundSettings(storage);
    expect(settings.isMuted()).toBe(false);
    settings.toggle();
    expect(settings.isMuted()).toBe(true);
    expect(storage.data[SOUND_MUTED_KEY]).toBe('true');
    // neue Sitzung im selben Browser liest die Einstellung
    expect(createSoundSettings(storage).isMuted()).toBe(true);
    settings.setMuted(false);
    expect(createSoundSettings(storage).isMuted()).toBe(false);
  });

  it('benachrichtigt Abonnenten nur bei echter Änderung', () => {
    const settings = createSoundSettings(memoryStorage());
    const listener = vi.fn();
    const unsubscribe = settings.subscribe(listener);
    settings.setMuted(true);
    settings.setMuted(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    settings.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('funktioniert auch ohne oder mit defektem Storage', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const settings = createSoundSettings(broken);
    expect(settings.isMuted()).toBe(false);
    expect(() => settings.toggle()).not.toThrow();
    expect(settings.isMuted()).toBe(true);
    expect(createSoundSettings(null).isMuted()).toBe(false);
  });

  it('STUMM spielt nichts, AN spielt mit Verzögerung; Fehler blockieren nie', () => {
    const settings = createSoundSettings(memoryStorage());
    const backend = { play: vi.fn() };
    const player = new SoundPlayer(settings, backend);
    player.play('play', 120);
    expect(backend.play).toHaveBeenCalledWith('play', 120);
    settings.setMuted(true);
    player.playAll([{ name: 'shuffle' }, { name: 'capture', delayMs: 50 }]);
    expect(backend.play).toHaveBeenCalledTimes(1);
    settings.setMuted(false);
    const failing = new SoundPlayer(settings, { play: () => { throw new Error('kein Audio'); } });
    expect(() => failing.play('matchWon')).not.toThrow();
  });

  it('jeder Sound hat einen Platzhalter', () => {
    for (const name of SOUND_NAMES) expect(typeof SYNTHS[name]).toBe('function');
  });
});

describe('Ereignis -> Sound', () => {
  const ctx: SoundContext = { playerCount: 3, timings: DEFAULT_TIMINGS, mySide: 'seat0' };
  const card = parseCardId('H2')!;
  const nine = parseCardId('S9')!;
  const names = (events: MatchEvent[], c = ctx) => soundsForEvents(events, c).map((s) => s.name);

  it('Mischen, Schneiden, Austeilen (ein Ton pro 4er-Paket)', () => {
    expect(names([{ type: 'roundStarted', roundNumber: 2, dealerSeat: 1 }])).toEqual(['shuffle']);
    expect(names([{ type: 'deckCut', seat: 1, cut: { index: 10, revealedCard: card, auto: false } }])).toEqual(['cut']);
    expect(names([{ type: 'cardsDealt', initial: true, movedJacks: [] }])).toEqual(['deal', 'deal', 'deal', 'deal']);
    expect(names([{ type: 'cardsDealt', initial: false, movedJacks: [] }])).toEqual(['deal', 'deal', 'deal']);
  });

  it('Karte spielen und aufnehmen – Aufnahme-Ton erst beim Zusammenziehen', () => {
    const played = soundsForEvents([{ type: 'cardPlayed', move: { seat: 0, card, captured: [nine], byTimeout: false, viaChoice: false } }], ctx);
    expect(played.map((s) => s.name)).toEqual(['play', 'capture']);
    expect(played[1]!.delayMs!).toBeGreaterThan(played[0]!.delayMs!);
    expect(played[1]!.delayMs!).toBeLessThan(DEFAULT_TIMINGS.moveAnimationMs);
    expect(names([{ type: 'cardPlayed', move: { seat: 0, card, captured: [], byTimeout: true, viaChoice: false } }])).toEqual(['play']);
    // nach Kombinationsauswahl: "Spielen"-Ton kam schon beim Ausspielen
    expect(names([{ type: 'captureChoiceRequired', seat: 0 }])).toEqual(['play']);
    expect(names([{ type: 'cardPlayed', move: { seat: 0, card, captured: [nine], byTimeout: false, viaChoice: true } }])).toEqual(['capture']);
  });

  it('Rundenauswertung für alle, "Match gewonnen" nur für die Siegerseite', () => {
    const events: MatchEvent[] = [
      { type: 'roundEnded', result: {} as never },
      { type: 'matchFinished', winner: 'seat0' },
    ];
    expect(names(events)).toEqual(['roundSummary', 'matchWon']);
    expect(names(events, { ...ctx, mySide: 'seat1' })).toEqual(['roundSummary']);
    expect(names(events, { ...ctx, mySide: null })).toEqual(['roundSummary']);
  });
});
