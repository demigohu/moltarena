/**
 * Publish match events to Supabase Realtime channel.
 * Clients subscribe to channel `match:{matchId}` for live updates.
 */

import { supabase } from "./supabase";

const CHANNEL_PREFIX = "match:";

export type RealtimeEvent =
  | { type: "state"; payload: { status: string; wins1: number; wins2: number; actionNeeded?: string; matchResult?: unknown } }
  | { type: "ready_to_settle"; payload: { matchResult: unknown } }
  | { type: "signatures_ready"; payload: { signatures: { sig1: string; sig2: string }; settleArgs: unknown } }
  | { type: "settled"; payload: { status: "finished" } };

/**
 * Publish event to match channel. Uses HTTP when not subscribed.
 */
export async function publishMatchEvent(
  matchId: string,
  event: RealtimeEvent["type"],
  payload: RealtimeEvent["payload"]
): Promise<void> {
  const channelName = `${CHANNEL_PREFIX}${matchId}`;
  const ch = supabase.channel(channelName);
  try {
    await ch.send({
      type: "broadcast",
      event,
      payload,
    });
  } finally {
    supabase.removeChannel(ch);
  }
}
