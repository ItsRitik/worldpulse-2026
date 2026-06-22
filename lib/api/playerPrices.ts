/**
 * playerPrices - resolve Dream11-style credit values for a set of players.
 * Reads cached prices from player_prices (24h fresh); for any miss, fetches the
 * player's club-season form from API-Football, computes a credit, and upserts
 * it. Bounded concurrency keeps us well under the per-minute API limit, and the
 * cache means each player is priced at most once a day.
 */

import { createClient } from '@supabase/supabase-js'
import { getPlayerSeason } from './apifootball'
import { creditFromSeason, basePrice, type Pos, type WCForm } from '@/lib/pricing'

const SEASON   = 2025          // most recent completed/current club season
const FRESH_MS = 6 * 3600 * 1000  // 6h - re-price during a tournament as WC form moves
const CHUNK    = 12            // concurrent /players calls per batch

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function pricePlayers(
  players: Array<{ id: number; position: Pos }>,
  wcForm: Record<number, WCForm> = {},
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (players.length === 0) return out

  const db  = admin()
  const ids = players.map(p => p.id)

  // 1. Cached prices
  let cached: Record<number, { price: number; fresh: boolean }> = {}
  try {
    const { data } = await db
      .from('player_prices').select('api_player_id, price, updated_at').in('api_player_id', ids)
    const now = Date.now()
    for (const r of data ?? []) {
      cached[r.api_player_id] = {
        price: Number(r.price),
        fresh: now - new Date(r.updated_at).getTime() < FRESH_MS,
      }
    }
  } catch {
    // table missing → everything falls back to base; never blocks team building
    for (const p of players) out.set(p.id, basePrice(p.position))
    return out
  }

  const missing: Array<{ id: number; position: Pos }> = []
  for (const p of players) {
    const c = cached[p.id]
    if (c?.fresh) out.set(p.id, c.price)
    else missing.push(p)
  }

  // 2. Compute the misses (bounded concurrency), upsert only successes
  const upserts: Array<{ api_player_id: number; price: number; updated_at: string }> = []
  for (let i = 0; i < missing.length; i += CHUNK) {
    const batch = missing.slice(i, i + CHUNK)
    const results = await Promise.all(batch.map(async p => {
      try {
        const stats = await getPlayerSeason(p.id, SEASON)
        return { id: p.id, price: creditFromSeason(stats, p.position, wcForm[p.id]), ok: true }
      } catch {
        // fall back to any stale cached price, else position base - don't cache it
        return { id: p.id, price: cached[p.id]?.price ?? basePrice(p.position), ok: false }
      }
    }))
    for (const r of results) {
      out.set(r.id, r.price)
      if (r.ok) upserts.push({ api_player_id: r.id, price: r.price, updated_at: new Date().toISOString() })
    }
  }

  if (upserts.length > 0) {
    try { await db.from('player_prices').upsert(upserts, { onConflict: 'api_player_id' }) } catch { /* ignore */ }
  }

  return out
}
