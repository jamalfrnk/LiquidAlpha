import { z } from 'zod';

/**
 * `markets` and `signals` are public; `user` is private and only
 * deliverable to a connection that authenticated at handshake time (see
 * server.ts) -- a client never supplies its own user id here, the server
 * derives it from the verified session, so there's no way to subscribe to
 * someone else's private channel by guessing an id.
 */
export const CHANNELS = ['markets', 'signals', 'user'] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * Inbound client message. `symbol` only applies to `markets` -- subscribing
 * without one means "all symbols". Neither `signals` nor `user` take a
 * symbol at all.
 */
export const ClientMessageSchema = z.object({
  type: z.enum(['subscribe', 'unsubscribe']),
  channel: z.enum(CHANNELS),
  symbol: z.string().trim().min(1).max(10).toUpperCase().optional(),
});
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface ServerEnvelope {
  event: string;
  channel: Channel;
  symbol?: string;
  seq: number;
  payload: unknown;
}
