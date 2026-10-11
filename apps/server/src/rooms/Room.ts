/**
 * Ein Spielraum: Lobby, Bereit-System, Countdown, Match-Steuerung, Host-Rechte, Verbindungsstatus.
 * Unabhängig von Socket.IO – Zeit, Timer und Zufall werden injiziert (testbar).
 */
import {
  COUNTDOWN_SECONDS,
  type MatchAction,
  type MatchEvent,
  type MatchState,
  type PlayerCount,
  type PlayerId,
  type Rng,
  type TeamNumber,
  advanceTime,
  applyAction,
  assignSeats,
  autoActionFor,
  canJoinTeam,
  canSetReady,
  createMatch,
  projectMatchView,
  requiresTeams,
  startBlockers,
  type MatchTimings,
} from '@orlan/game';
import type { ClientGameAction, PlayerPublic, RoomStatus, RoomView } from '@orlan/protocol';

export class RoomError extends Error {}

export interface RoomClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RoomDeps {
  clock: RoomClock;
  rng: Rng;
  generatePlayerId(): string;
  generateToken(): string;
  /** Wird nach jeder Zustandsänderung aufgerufen (Server sendet dann allen ihre Sicht). */
  onChange(room: Room, events: MatchEvent[]): void;
  /** Wird aufgerufen, wenn ein Spieler den Raum verlassen muss (entfernt) oder der Raum geschlossen wird. */
  onPlayerRemoved(room: Room, playerId: PlayerId, reason: string): void;
  onClosed(room: Room, reason: string): void;
}

export interface RoomPlayer {
  id: PlayerId;
  name: string;
  token: string;
  team: TeamNumber | null;
  ready: boolean;
  isBot: boolean;
  /** Anzeigestatus; wird erst nach der Toleranzzeit auf false gesetzt. */
  connected: boolean;
  /** Tatsächlich offene Verbindung. */
  online: boolean;
}

export interface RoomOptions {
  code: string;
  maxPlayers: PlayerCount;
  isDev: boolean;
  timings?: Partial<MatchTimings>;
}

/** Nach so vielen ms ohne Verbindung wird "Verbindung verloren" angezeigt (kurzes App-Wechseln bleibt unsichtbar). */
export const CONNECTION_LOST_GRACE_MS = 5000;
const COUNTDOWN_MS = COUNTDOWN_SECONDS * 1000;
const BOT_DELAY_MS = 900;

export class Room {
  readonly code: string;
  readonly maxPlayers: PlayerCount;
  readonly isDev: boolean;
  readonly createdAt: number;
  hostId: PlayerId = '';
  players: RoomPlayer[] = [];
  status: RoomStatus = 'lobby';
  countdownEndsAt: number | null = null;
  seats: PlayerId[] | null = null;
  match: MatchState | null = null;
  notice: string | null = null;
  lastActivityAt: number;
  closed = false;

  private readonly timings: Partial<MatchTimings> | undefined;
  private phaseTimer: unknown = null;
  private botTimer: unknown = null;
  private readonly disconnectTimers = new Map<PlayerId, unknown>();

  constructor(private readonly deps: RoomDeps, options: RoomOptions) {
    this.code = options.code;
    this.maxPlayers = options.maxPlayers;
    this.isDev = options.isDev;
    this.timings = options.timings;
    this.createdAt = deps.clock.now();
    this.lastActivityAt = this.createdAt;
  }

  // -------------------------------------------------------------------------
  // Spieler & Lobby
  // -------------------------------------------------------------------------

  addPlayer(name: string, opts: { isBot?: boolean } = {}): RoomPlayer {
    this.assertOpen();
    if (this.status !== 'lobby' && this.status !== 'countdown') throw new RoomError('Das Match läuft bereits.');
    if (this.players.length >= this.maxPlayers) throw new RoomError('Der Raum ist voll.');
    const player: RoomPlayer = {
      id: this.deps.generatePlayerId(),
      name: this.uniqueName(name),
      token: this.deps.generateToken(),
      team: null,
      ready: false,
      isBot: opts.isBot ?? false,
      connected: opts.isBot ?? false,
      online: opts.isBot ?? false,
    };
    if (this.players.length === 0) this.hostId = player.id;
    this.players.push(player);
    this.changed();
    return player;
  }

  getPlayer(id: PlayerId): RoomPlayer | undefined {
    return this.players.find((p) => p.id === id);
  }

  authenticate(playerId: PlayerId, token: string): RoomPlayer | null {
    const p = this.getPlayer(playerId);
    return p && p.token === token ? p : null;
  }

  setTeam(playerId: PlayerId, team: TeamNumber): void {
    const p = this.requireLobbyPlayer(playerId);
    if (!requiresTeams(this.maxPlayers)) throw new RoomError('Teams gibt es nur bei 4 Spielern.');
    if (p.team === team) return;
    if (!canJoinTeam(this.players, playerId, team)) throw new RoomError(`Team ${team} ist bereits voll.`);
    p.team = team;
    p.ready = false;
    this.changed();
  }

  setReady(playerId: PlayerId, ready: boolean): void {
    const p = this.requireLobbyPlayer(playerId);
    if (ready && !canSetReady(this.maxPlayers, p)) throw new RoomError('Bitte zuerst ein Team wählen.');
    p.ready = ready;
    this.changed();
  }

  /** Spieler verlässt den Raum freiwillig. Verlässt der Host den Raum, wird der Raum geschlossen. */
  leave(playerId: PlayerId): void {
    if (!this.getPlayer(playerId)) return;
    if (playerId === this.hostId) {
      this.close('Der Host hat den Raum verlassen.');
      return;
    }
    this.removePlayer(playerId, 'Du hast den Raum verlassen.', `${this.getPlayer(playerId)?.name} hat den Raum verlassen.`);
  }

  kick(byId: PlayerId, targetId: PlayerId): void {
    this.requireHost(byId);
    if (targetId === this.hostId) throw new RoomError('Der Host kann sich nicht selbst entfernen.');
    const target = this.getPlayer(targetId);
    if (!target) throw new RoomError('Spieler nicht gefunden.');
    this.removePlayer(targetId, 'Du wurdest vom Host entfernt.', `${target.name} wurde vom Host entfernt.`);
  }

  abortMatch(byId: PlayerId): void {
    this.requireHost(byId);
    if (!this.match) throw new RoomError('Es läuft kein Match.');
    this.resetToLobby('Der Host hat das Match abgebrochen.');
    this.changed();
  }

  returnToLobby(byId: PlayerId): void {
    this.requireHost(byId);
    if (this.status !== 'finished') throw new RoomError('Das Match ist noch nicht beendet.');
    this.resetToLobby(null);
    this.changed();
  }

  setBot(playerId: PlayerId, isBot: boolean): void {
    if (!this.isDev) throw new RoomError('Nur im Development Mode.');
    const p = this.getPlayer(playerId);
    if (!p) throw new RoomError('Spieler nicht gefunden.');
    p.isBot = isBot;
    if (isBot) {
      p.connected = true;
      if (this.status === 'lobby' && canSetReady(this.maxPlayers, p)) p.ready = true;
    } else {
      p.connected = p.online;
    }
    this.changed();
  }

  // -------------------------------------------------------------------------
  // Verbindung
  // -------------------------------------------------------------------------

  markOnline(playerId: PlayerId): void {
    const p = this.getPlayer(playerId);
    if (!p) return;
    this.clearDisconnectTimer(playerId);
    p.online = true;
    p.connected = true;
    this.lastActivityAt = this.deps.clock.now();
    this.changed();
  }

  /** Das Match läuft weiter; erst nach der Toleranzzeit wird "Verbindung verloren" angezeigt. */
  markOffline(playerId: PlayerId): void {
    const p = this.getPlayer(playerId);
    if (!p) return;
    p.online = false;
    this.clearDisconnectTimer(playerId);
    this.disconnectTimers.set(
      playerId,
      this.deps.clock.setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        const current = this.getPlayer(playerId);
        if (current && !current.online && !current.isBot) {
          current.connected = false;
          this.changed();
        }
      }, CONNECTION_LOST_GRACE_MS),
    );
  }

  hasOnlineHumans(): boolean {
    return this.players.some((p) => p.online && !p.isBot);
  }

  // -------------------------------------------------------------------------
  // Spielaktionen
  // -------------------------------------------------------------------------

  gameAction(playerId: PlayerId, action: ClientGameAction): void {
    this.assertOpen();
    if (!this.match || !this.seats) throw new RoomError('Es läuft kein Match.');
    const seat = this.seats.indexOf(playerId);
    if (seat < 0) throw new RoomError('Du sitzt nicht am Tisch.');
    this.applyMatchAction({ ...action, seat } as MatchAction);
  }

  private applyMatchAction(action: MatchAction): void {
    if (!this.match) return;
    // Erst abgelaufene Deadlines verarbeiten, damit nach Ablauf kein Zug mehr akzeptiert wird.
    const ctx = { now: this.deps.clock.now(), rng: this.deps.rng };
    const advanced = advanceTime(this.match, ctx);
    this.match = advanced.state;
    const result = applyAction(this.match, action, ctx);
    if (!result.ok) {
      if (advanced.changed) this.changed(advanced.events);
      throw new RoomError(result.error);
    }
    this.match = result.state;
    this.lastActivityAt = ctx.now;
    this.changed([...advanced.events, ...result.events]);
  }

  // -------------------------------------------------------------------------
  // Sicht
  // -------------------------------------------------------------------------

  viewFor(playerId: PlayerId): RoomView {
    const seat = this.seats ? this.seats.indexOf(playerId) : -1;
    return {
      code: this.code,
      maxPlayers: this.maxPlayers,
      status: this.status,
      hostId: this.hostId,
      myPlayerId: playerId,
      players: this.players.map((p): PlayerPublic => ({
        id: p.id,
        name: p.name,
        team: p.team,
        ready: p.ready,
        connected: p.connected,
        isHost: p.id === this.hostId,
        isBot: p.isBot,
        seat: this.seats ? this.seats.indexOf(p.id) : null,
      })),
      seats: this.seats ? [...this.seats] : null,
      countdownEndsAt: this.countdownEndsAt,
      startBlockers: startBlockers(this.maxPlayers, this.players),
      match: this.match ? projectMatchView(this.match, seat >= 0 ? seat : null) : null,
      isDevRoom: this.isDev,
      serverNow: this.deps.clock.now(),
      notice: this.notice,
    };
  }

  close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.clearTimers();
    this.deps.onClosed(this, reason);
  }

  // -------------------------------------------------------------------------
  // Intern
  // -------------------------------------------------------------------------

  private removePlayer(playerId: PlayerId, reasonForPlayer: string, notice: string): void {
    this.players = this.players.filter((p) => p.id !== playerId);
    this.clearDisconnectTimer(playerId);
    // Ohne diesen Spieler kann ein laufendes Match nicht fortgesetzt werden.
    if (this.match) this.resetToLobby(`${notice} Das Match wurde beendet.`);
    else this.notice = notice;
    this.deps.onPlayerRemoved(this, playerId, reasonForPlayer);
    this.changed();
  }

  private resetToLobby(notice: string | null): void {
    this.match = null;
    this.seats = null;
    this.status = 'lobby';
    this.countdownEndsAt = null;
    this.notice = notice;
    for (const p of this.players) p.ready = p.isBot && canSetReady(this.maxPlayers, p);
  }

  private startMatch(): void {
    const now = this.deps.clock.now();
    this.seats = assignSeats(this.maxPlayers, this.players, this.hostId);
    const { state, events } = createMatch(
      { playerCount: this.maxPlayers, firstDealerSeat: this.seats.indexOf(this.hostId), timings: this.timings },
      { now, rng: this.deps.rng },
    );
    this.match = state;
    this.status = 'playing';
    this.countdownEndsAt = null;
    this.notice = null;
    this.changed(events);
  }

  /** Zentrale Stelle nach jeder Änderung: Countdown prüfen, Timer planen, Clients benachrichtigen. */
  private changed(events: MatchEvent[] = []): void {
    if (this.closed) return;
    this.updateCountdown();
    if (this.match?.status === 'finished') this.status = 'finished';
    this.schedulePhaseTimer();
    this.scheduleBots();
    this.deps.onChange(this, events);
  }

  private updateCountdown(): void {
    const canStart = startBlockers(this.maxPlayers, this.players).length === 0;
    if (this.status === 'lobby' && canStart) {
      this.status = 'countdown';
      this.countdownEndsAt = this.deps.clock.now() + COUNTDOWN_MS;
      this.notice = null;
    } else if (this.status === 'countdown' && !canStart) {
      // Jemand ist nicht mehr bereit oder hat den Raum verlassen -> sofort abbrechen.
      this.status = 'lobby';
      this.countdownEndsAt = null;
      this.notice = 'Countdown abgebrochen.';
    }
  }

  private schedulePhaseTimer(): void {
    if (this.phaseTimer !== null) this.deps.clock.clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    const due = this.status === 'countdown' ? this.countdownEndsAt : this.match?.status === 'running' ? this.match.round.deadline : null;
    if (due === null || due === undefined) return;
    const delay = Math.max(0, due - this.deps.clock.now());
    this.phaseTimer = this.deps.clock.setTimeout(() => this.onPhaseTimer(), delay);
  }

  private onPhaseTimer(): void {
    this.phaseTimer = null;
    if (this.closed) return;
    const now = this.deps.clock.now();
    if (this.status === 'countdown' && this.countdownEndsAt !== null && this.countdownEndsAt <= now) {
      this.startMatch();
      return;
    }
    if (this.match) {
      const result = advanceTime(this.match, { now, rng: this.deps.rng });
      this.match = result.state;
      this.changed(result.events);
    }
  }

  /** Dev-Testspieler (Bots) handeln automatisch mit kurzer Verzögerung. */
  private scheduleBots(): void {
    if (this.botTimer !== null) this.deps.clock.clearTimeout(this.botTimer);
    this.botTimer = null;
    if (!this.match || !this.seats || this.match.status !== 'running') return;
    const hasBotAction = this.seats.some((id, seat) => this.getPlayer(id)?.isBot && autoActionFor(this.match!, seat, this.deps.rng));
    if (!hasBotAction) return;
    this.botTimer = this.deps.clock.setTimeout(() => {
      this.botTimer = null;
      if (!this.match || !this.seats) return;
      for (const [seat, id] of this.seats.entries()) {
        if (!this.getPlayer(id)?.isBot) continue;
        const action = autoActionFor(this.match, seat, this.deps.rng);
        if (!action) continue;
        try {
          this.applyMatchAction(action);
        } catch {
          // Zustand hat sich inzwischen geändert – beim nächsten changed() wird neu geplant.
          this.scheduleBots();
        }
        return;
      }
    }, BOT_DELAY_MS);
  }

  private requireHost(playerId: PlayerId): void {
    this.assertOpen();
    if (playerId !== this.hostId) throw new RoomError('Nur der Host darf das.');
  }

  private requireLobbyPlayer(playerId: PlayerId): RoomPlayer {
    this.assertOpen();
    const p = this.getPlayer(playerId);
    if (!p) throw new RoomError('Spieler nicht gefunden.');
    if (this.status !== 'lobby' && this.status !== 'countdown') throw new RoomError('Das Match läuft bereits.');
    return p;
  }

  private assertOpen(): void {
    if (this.closed) throw new RoomError('Der Raum existiert nicht mehr.');
  }

  private uniqueName(raw: string): string {
    const base = raw.trim() || 'Spieler';
    let name = base;
    for (let i = 2; this.players.some((p) => p.name.toLowerCase() === name.toLowerCase()); i++) name = `${base} ${i}`;
    return name;
  }

  private clearDisconnectTimer(playerId: PlayerId): void {
    const t = this.disconnectTimers.get(playerId);
    if (t !== undefined) this.deps.clock.clearTimeout(t);
    this.disconnectTimers.delete(playerId);
  }

  private clearTimers(): void {
    if (this.phaseTimer !== null) this.deps.clock.clearTimeout(this.phaseTimer);
    if (this.botTimer !== null) this.deps.clock.clearTimeout(this.botTimer);
    for (const t of this.disconnectTimers.values()) this.deps.clock.clearTimeout(t);
    this.phaseTimer = null;
    this.botTimer = null;
    this.disconnectTimers.clear();
  }
}
