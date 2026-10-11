/**
 * Speichert die Wiederverbindungs-Daten pro Browser-Tab (sessionStorage).
 * Dadurch ist jeder Tab / jedes Fenster ein eigener Spieler – ideal zum lokalen Testen.
 * Über den URL-Parameter `profile` können sich mehrere Spieler im selben Tab (z. B. Dev-Split-Screen) trennen.
 */
import type { SessionCredentials } from '@orlan/protocol';

const profile = new URLSearchParams(window.location.search).get('profile') ?? 'default';
const STORAGE_KEY = `orlan.session.${profile}`;

export function loadSession(): SessionCredentials | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionCredentials>;
    return parsed.roomCode && parsed.playerId && parsed.token ? (parsed as SessionCredentials) : null;
  } catch {
    return null;
  }
}

export function saveSession(creds: SessionCredentials): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // Ohne Storage funktioniert das Spiel weiter, nur ohne Reload-Wiederverbindung.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignorieren */
  }
}

export function currentProfile(): string {
  return profile;
}

// Dev-Split-Screen: Zugangsdaten können per URL übergeben werden (nur im Development-Build).
if (import.meta.env.DEV) {
  const url = new URL(window.location.href);
  const roomCode = url.searchParams.get('room');
  const playerId = url.searchParams.get('pid');
  const token = url.searchParams.get('token');
  if (roomCode && playerId && token) {
    saveSession({ roomCode, playerId, token });
    for (const key of ['room', 'pid', 'token']) url.searchParams.delete(key);
    window.history.replaceState(null, '', url.toString());
  }
}
