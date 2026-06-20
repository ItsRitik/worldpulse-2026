'use client'

/**
 * /fantasy/room/[roomId]/team
 * ════════════════════════════
 * Football pitch view of a submitted team — Dream11 style.
 *
 * ?user=<userId>  — whose team to show (defaults to current user)
 *
 * Access rules:
 *  - Own team:      always visible (if picks exist)
 *  - Opponent team: only visible once room.status is 'live' or 'finished'
 */

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import type { FantasyPick, FantasyRoom, Position, PickRole } from '@/lib/supabase/types'
import Link from 'next/link'
import clsx from 'clsx'

// ── Types ──────────────────────────────────────────────────────────────────────
type PositionRow = { pos: Position; picks: FantasyPick[] }

// ── Helpers ────────────────────────────────────────────────────────────────────
const POS_ORDER: Position[] = ['FWD', 'MID', 'DEF', 'GK']   // pitch top → bottom

const POS_COLOR: Record<Position, string> = {
  GK:  'bg-amber-400 border-amber-300',
  DEF: 'bg-emerald-500 border-emerald-400',
  MID: 'bg-sky-500 border-sky-400',
  FWD: 'bg-rose-500 border-rose-400',
}

const POS_LABEL: Record<Position, string> = {
  GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD',
}

const ROLE_MULT: Record<PickRole, number> = {
  captain: 2, vice_captain: 1.5, player: 1,
}

// ── Player chip on the pitch ───────────────────────────────────────────────────
function PitchPlayer({ pick, showPoints }: { pick: FantasyPick; showPoints: boolean }) {
  const isCap  = pick.role === 'captain'
  const isVC   = pick.role === 'vice_captain'
  const pts    = pick.total_points

  return (
    <div className="flex flex-col items-center gap-1 select-none" style={{ width: 64 }}>
      {/* Jersey circle */}
      <div className="relative">
        <div className={clsx(
          'relative w-12 h-12 rounded-full border-2 flex items-center justify-center text-white font-bold text-sm shadow-lg overflow-hidden',
          POS_COLOR[pick.position],
          isCap  && 'ring-2 ring-yellow-300 ring-offset-1 ring-offset-transparent',
          isVC   && 'ring-2 ring-blue-300 ring-offset-1 ring-offset-transparent',
        )}>
          {pick.jersey_number ?? pick.player_short.slice(0, 2).toUpperCase()}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://media.api-sports.io/football/players/${pick.api_player_id}.png`} alt="" loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>

        {/* C / VC badge */}
        {(isCap || isVC) && (
          <span className={clsx(
            'absolute -top-1 -right-1 w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center border border-white shadow',
            isCap ? 'bg-yellow-400 text-yellow-900' : 'bg-blue-400 text-blue-900',
          )}>
            {isCap ? 'C' : 'V'}
          </span>
        )}

        {/* Points bubble (live/finished) */}
        {showPoints && pts !== null && (
          <span className={clsx(
            'absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0 rounded-full text-[9px] font-bold border border-white shadow whitespace-nowrap',
            pts > 0 ? 'bg-green-500 text-white' : 'bg-gray-500 text-white',
          )}>
            {pts > 0 ? '+' : ''}{pts}
          </span>
        )}
      </div>

      {/* Name */}
      <div className="text-center">
        <div className="text-[10px] font-semibold text-white leading-tight drop-shadow max-w-[60px] truncate">
          {pick.player_short}
        </div>
        {showPoints && pts === null && (
          <div className="text-[9px] text-white/60">{pick.price}cr</div>
        )}
        {!showPoints && (
          <div className="text-[9px] text-white/60">{pick.price}cr</div>
        )}
      </div>
    </div>
  )
}

// ── Position row on pitch ──────────────────────────────────────────────────────
function PitchRow({ pos, picks, showPoints }: PositionRow & { showPoints: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {/* Row label */}
      <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
        {POS_LABEL[pos]}
      </span>
      {/* Players spread horizontally */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {picks.map(p => (
          <PitchPlayer key={p.id} pick={p} showPoints={showPoints} />
        ))}
      </div>
    </div>
  )
}

// ── Pitch SVG lines overlay ────────────────────────────────────────────────────
function PitchLines() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 320 540"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer border */}
      <rect x="12" y="12" width="296" height="516" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.2" rx="2"/>
      {/* Half-way line */}
      <line x1="12" y1="270" x2="308" y2="270" stroke="white" strokeWidth="1.5" strokeOpacity="0.2"/>
      {/* Centre circle */}
      <circle cx="160" cy="270" r="42" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.2"/>
      <circle cx="160" cy="270" r="3"  fill="white" fillOpacity="0.2"/>
      {/* Top penalty box */}
      <rect x="72" y="12" width="176" height="90" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.2"/>
      {/* Top 6-yard box */}
      <rect x="112" y="12" width="96" height="38" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.2"/>
      {/* Top penalty spot */}
      <circle cx="160" cy="76" r="2.5" fill="white" fillOpacity="0.25"/>
      {/* Bottom penalty box */}
      <rect x="72" y="438" width="176" height="90" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.2"/>
      {/* Bottom 6-yard box */}
      <rect x="112" y="490" width="96" height="38" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.2"/>
      {/* Bottom penalty spot */}
      <circle cx="160" cy="464" r="2.5" fill="white" fillOpacity="0.25"/>
      {/* Corner arcs — top */}
      <path d="M12 30 Q20 12 30 12"  fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.2"/>
      <path d="M290 12 Q308 12 308 30" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.2"/>
      {/* Corner arcs — bottom */}
      <path d="M12 510 Q12 528 30 528" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.2"/>
      <path d="M308 510 Q308 528 290 528" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.2"/>
    </svg>
  )
}

// ── Summary bar at bottom ──────────────────────────────────────────────────────
function TeamSummary({ picks, showPoints }: { picks: FantasyPick[]; showPoints: boolean }) {
  const totalPts = picks.reduce((s, p) => s + (p.total_points ?? 0), 0)
  const totalPrice = picks.reduce((s, p) => s + p.price, 0)
  const captain = picks.find(p => p.role === 'captain')
  const vc      = picks.find(p => p.role === 'vice_captain')

  return (
    <div className="bg-gray-900/90 backdrop-blur border-t border-white/10 px-4 py-3">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            {/* Captain */}
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-yellow-400 text-yellow-900 text-[9px] font-black flex items-center justify-center">C</span>
              <span className="text-white font-medium truncate max-w-[80px]">
                {captain?.player_short ?? '—'}
              </span>
            </div>
            {/* VC */}
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-400 text-blue-900 text-[9px] font-black flex items-center justify-center">V</span>
              <span className="text-white font-medium truncate max-w-[80px]">
                {vc?.player_short ?? '—'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {showPoints ? (
              <div className="text-right">
                <div className="text-lg font-bold text-white tabular-nums">{totalPts.toFixed(1)}</div>
                <div className="text-[10px] text-gray-400 -mt-0.5">total pts</div>
              </div>
            ) : (
              <div className="text-right">
                <div className="text-sm font-bold text-white">{totalPrice.toFixed(1)}cr</div>
                <div className="text-[10px] text-gray-400 -mt-0.5">used of 100</div>
              </div>
            )}
          </div>
        </div>

        {/* Position count pills */}
        <div className="flex gap-2 mt-2 flex-wrap">
          {(['GK', 'DEF', 'MID', 'FWD'] as Position[]).map(pos => {
            const count = picks.filter(p => p.position === pos).length
            if (count === 0) return null
            return (
              <span key={pos} className={clsx(
                'text-[10px] font-semibold px-2 py-0.5 rounded-full text-white',
                pos === 'GK'  && 'bg-amber-500/70',
                pos === 'DEF' && 'bg-emerald-500/70',
                pos === 'MID' && 'bg-sky-500/70',
                pos === 'FWD' && 'bg-rose-500/70',
              )}>
                {count} {pos}
              </span>
            )
          })}
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white">
            {picks.length} / 11
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TeamViewPage({ params }: { params: { roomId: string } }) {
  const { roomId }  = params
  const router      = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const targetUserId = searchParams.get('user') ?? null  // null = own team

  const [room,    setRoom]    = useState<FantasyRoom | null>(null)
  const [picks,   setPicks]   = useState<FantasyPick[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [ownerLabel, setOwnerLabel] = useState('')

  useEffect(() => {
    if (!user) return

    const uid = targetUserId ?? user.id

    async function load() {
      const supabase = createClient()

      // 1. Load room
      const { data: r, error: rErr } = await (supabase as any)
        .from('fantasy_rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (rErr || !r) { setError('Room not found'); setLoading(false); return }
      setRoom(r as FantasyRoom)

      const isMyTeam = uid === user!.id
      const isHost   = r.host_id === user!.id
      const isGuest  = r.guest_id === user!.id
      const isParticipant = isHost || isGuest

      if (!isParticipant) { setError('You are not in this room'); setLoading(false); return }

      // 2. Opponent team guard — only visible once match starts
      if (!isMyTeam) {
        const allowed = r.status === 'live' || r.status === 'finished'
        if (!allowed) {
          setError("Opponent's team is hidden until the match kicks off 🔒")
          setLoading(false)
          return
        }
        setOwnerLabel('Opponent\'s Team')
      } else {
        setOwnerLabel('Your Team')
      }

      // 3. Load picks
      const { data: pickData, error: pErr } = await supabase
        .from('fantasy_picks')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', uid)

      if (pErr) { setError(pErr.message); setLoading(false); return }
      if (!pickData || pickData.length === 0) {
        setError(isMyTeam ? 'You haven\'t submitted a team yet' : 'Opponent hasn\'t submitted a team yet')
        setLoading(false)
        return
      }

      setPicks(pickData as FantasyPick[])
      setLoading(false)
    }

    load()
  }, [user, roomId, targetUserId])

  // ── Loading / errors ──────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center pt-14">
        <div className="w-6 h-6 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) {
    router.replace(`/fantasy/login?next=/fantasy/room/${roomId}/team`)
    return null
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 pt-14 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <p className="text-sm text-gray-300 mb-5">{error}</p>
          <Link
            href={`/fantasy/room/${roomId}`}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            ← Back to room
          </Link>
        </div>
      </div>
    )
  }

  // ── Build rows ordered FWD → MID → DEF → GK (top to bottom on pitch) ─────
  const showPoints = room?.status === 'live' || room?.status === 'finished'

  const rows: PositionRow[] = POS_ORDER
    .map(pos => ({ pos, picks: picks.filter(p => p.position === pos) }))
    .filter(r => r.picks.length > 0)

  const isOpponent = targetUserId !== null && targetUserId !== user.id

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col pt-14">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border-b border-white/[0.07] px-4 py-3 flex-shrink-0">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href={`/fantasy/room/${roomId}`}
            className="text-gray-400 hover:text-gray-200 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">
              {ownerLabel}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5 truncate">
              {room?.match_label}
            </div>
          </div>

          {/* Status chip */}
          {showPoints && (
            <span className="flex items-center gap-1.5 bg-red-900/40 text-red-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-red-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 live-dot" />
              {room?.status === 'finished' ? 'FT' : 'Live'}
            </span>
          )}
        </div>
      </div>

      {/* ── Pitch ────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Grass gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, #1a6b2e 0%, #1d7a33 14.28%, #1a6b2e 14.28%, #1d7a33 28.57%, #1a6b2e 28.57%, #1d7a33 42.86%, #1a6b2e 42.86%, #1d7a33 57.14%, #1a6b2e 57.14%, #1d7a33 71.43%, #1a6b2e 71.43%, #1d7a33 85.71%, #1a6b2e 85.71%, #1d7a33 100%)',
          }}
        />

        {/* Pitch line markings */}
        <PitchLines />

        {/* Players — laid out in rows */}
        <div className="relative z-10 flex flex-col justify-around h-full py-6 px-3">
          {rows.map(row => (
            <PitchRow
              key={row.pos}
              pos={row.pos}
              picks={row.picks}
              showPoints={showPoints}
            />
          ))}
        </div>
      </div>

      {/* ── Summary bar ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0">
        <TeamSummary picks={picks} showPoints={showPoints} />
      </div>
    </div>
  )
}
