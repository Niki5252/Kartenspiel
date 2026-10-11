import { PLAYER_NAME_MAX_LENGTH } from '@orlan/protocol';
import { z } from 'zod';

/** Alle Client-Eingaben sind nicht vertrauenswürdig und werden hier geprüft. */
export const playerName = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Bitte einen Namen eingeben.').max(PLAYER_NAME_MAX_LENGTH, 'Name ist zu lang.'));

export const playerCount = z.union([z.literal(2), z.literal(3), z.literal(4)]);
export const team = z.union([z.literal(1), z.literal(2)]);
const cardId = z.string().min(2).max(3);

export const schemas = {
  create: z.object({ name: playerName, playerCount }),
  join: z.object({ code: z.string().min(1).max(12), name: playerName }),
  resume: z.object({ roomCode: z.string().min(1).max(12), playerId: z.string().min(1).max(64), token: z.string().min(1).max(128) }),
  setTeam: z.object({ team }),
  setReady: z.object({ ready: z.boolean() }),
  kick: z.object({ playerId: z.string().min(1).max(64) }),
  gameAction: z.discriminatedUnion('type', [
    z.object({ type: z.literal('cut'), index: z.number().int() }),
    z.object({ type: z.literal('chooseDealOrder'), order: z.enum(['playersFirst', 'tableFirst']) }),
    z.object({ type: z.literal('playCard'), cardId }),
    z.object({ type: z.literal('chooseCapture'), cardIds: z.array(cardId).max(52) }),
  ]),
  devCreate: z.object({ playerCount, botCount: z.number().int().min(0).max(3), autoReady: z.boolean() }),
  devSetBot: z.object({ playerId: z.string().min(1).max(64), isBot: z.boolean() }),
};

export function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  return result.data;
}

export class ValidationError extends Error {}
