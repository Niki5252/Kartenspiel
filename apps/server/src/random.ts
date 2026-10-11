import { randomBytes, randomInt } from 'node:crypto';
import type { Rng } from '@orlan/game';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@orlan/protocol';

/** Kryptografisch sichere Zufallsquelle für Mischen, Schneide- und Timeout-Automatik. */
export const cryptoRng: Rng = {
  int: (maxExclusive) => randomInt(maxExclusive),
};

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

export function generatePlayerId(): string {
  return randomBytes(8).toString('hex');
}

/** Geheimes Token zur Wiederverbindung – wird nie an andere Spieler gesendet. */
export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}
