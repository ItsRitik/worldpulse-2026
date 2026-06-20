'use client'

/**
 * /fantasy/room/[roomId]/pick
 * ════════════════════════════
 * Pick builder scoped to a specific room.
 * - Loads the room to get match + validates user is a participant
 * - Loads existing picks (if editing before lock)
 * - On submit: upserts picks → redirects back to room page
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import type { LineupPlayer } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import type { PickRole, FantasyRoom } from '@/lib/supabase/types'
import Link from 'next/link'
import clsx from 'clsx'

type Pick = { player: LineupPlayer; role: PickRole }

const ROLE_LABEL: Record<PickRole, string> = { captain: 'C', vice_captain: 'V', player: '' }
const ROLE_MULT:  Record<PickRole, number>  = { captain: 2, vice_captain: 1.5, player: 1 }

// ── Player row ────────────────────────────────────────────────────────────────
function PlayerRow({ player, pick, onToggle, disabled }: {
  player:   LineupPlayer
  pick:     Pick | undefined
  onToggle: (p: LineupPlayer) => void
  disabled: boolean
}) {
  const selected = !!pick
  return (
    <button
      onClick={() => onToggle(player)}
      disabled={!selected && disabled}
      className={clsx(
        'w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left',
        selected
          ? 'bg-pulse-50 dark:bg-pulse-900/20 border-pulse-200 dark:border-pulse-700'
          : disabled
            ? 'bg-white dark:bg-gray-900 border-black/[0.05] dark:border-white/[0.05] opacity-40 cursor-not-allowed'
            : 'bg-white dark:bg-gray-900 border-black/[0.07] dark:border-white/[0.07] hover:border-pulse-300'
      )}
    >
      <div className={clsx(
        'relative w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 flex-shrink-0',
        selected
          ? 'bg-pulse-600 border-pulse-400 text-white'
          : 'bg-gray-100 dark:bg-gray-700 border-transparent text-gray-600 dark:text-gray-300'
      )}>
        {player.jersey_number ?? '?'}
        {player.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.photo} alt="" loading="lazy"
            className="absolute inset-0 w-full h-full rounded-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        )}
        {player.team_logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.team_logo} alt="" loading="lazy"
            className="absolute -bottom-0.5 -right-1 w-4 h-4 object-contain bg-white dark:bg-gray-900 rounded-full p-[1px] shadow-sm"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{player.name}</span>
          {pick && pick.role !== 'player' && (
            <span className={clsx(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              pick.role === 'captain'
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            )}>
              {pick.role === 'captain' ? 'C ×2' : 'VC ×1.5'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={clsx(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded',
            player.position === 'GK'  ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
            : player.position === 'DEF' ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
            : player.position === 'MID' ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
            : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          )}>{player.position}</span>
          <span className="text-[10px] text-gray-400">{player.team_tla}</span>
        </div>
      </div>
      <div className="text-sm font-bold text-gray-700 dark:text-gray-300 flex-shrink-0">
        {player.price}<span className="text-[10px] font-normal text-gray-400 ml-0.5">cr</span>
      </div>
      {selected && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-pulse-600 dark:text-pulse-400 flex-shrink-0">
          <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      )}
    </button>
  )
}

// ── Selected team strip ────────────────────────────────────────────────────────
function TeamStrip({ picks, onCycleRole }: { picks: Pick[]; onCycleRole: (p: LineupPlayer) => void }) {
  if (picks.length === 0) return null
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
      {picks.map(pick => (
        <button key={pick.player.id} onClick={() => onCycleRole(pick.player)}
          className="flex-shrink-0 flex flex-col items-center gap-0.5 relative w-14"
        >
          <div className={clsx(
            'relative w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold border-2',
            pick.role === 'captain'      ? 'bg-yellow-400 border-yellow-300 text-yellow-900'
            : pick.role === 'vice_captain' ? 'bg-blue-400 border-blue-300 text-blue-900'
            : 'bg-pulse-600 border-pulse-400 text-white'
          )}>
            {pick.role !== 'player' ? ROLE_LABEL[pick.role] : (pick.player.jersey_number ?? '?')}
            {pick.player.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pick.player.photo} alt="" loading="lazy"
                className="absolute inset-0 w-full h-full rounded-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            )}
            {pick.role !== 'player' && (
              <span className={clsx(
                'absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black shadow-sm',
                pick.role === 'captain' ? 'bg-yellow-400 text-yellow-900' : 'bg-blue-400 text-blue-900'
              )}>
                {ROLE_LABEL[pick.role]}
              </span>
            )}
          </div>
          <span className="text-[9px] text-gray-500 dark:text-gray-400 max-w-[52px] truncate text-center leading-tight">
            {pick.player.name.split(' ').pop()}
          </span>
          {pick.role !== 'player' && (
            <span className="text-[8px] font-bold text-pulse-600 dark:text-pulse-400">×{ROLE_MULT[pick.role]}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PickPage({ params }: { params: { roomId: string } }) {
  const { roomId }         = params
  const router             = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [room,       setRoom]       = useState<FantasyRoom | null>(null)
  const [roomError,  setRoomError]  = useState<string | null>(null)
  const [roomLoading,setRoomLoading]= useState(true)

  const [picks,      setPicks]      = useState<Pick[]>([])
  const [lineup,     setLineup]     = useState<LineupPlayer[]>([])
  const [matchTeams, setMatchTeams] = useState<{ home?: { tla: string; logo: string }; away?: { tla: string; logo: string } } | null>(null)
  const [lineupSource, setLineupSource] = useState<'lineup' | 'squad' | 'dummy'>('dummy')
  const [activePos,  setActivePos]  = useState<string>('ALL')
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)

  // Load room + player pool + existing picks (once per room — guarded so
  // re-renders while building a team never re-hit /api/wc/lineups)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const supabase = createClient()

    async function load() {
      // 1. Room
      const { data: r, error: rErr } = await (supabase as any)
        .from('fantasy_rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (rErr || !r) { setRoomError('Contest not found.'); setRoomLoading(false); return }

      // Entries close at kickoff
      if (r.status !== 'waiting' || new Date() >= new Date(r.kickoff_at)) {
        setRoomError('Entries are closed — the match has started.'); setRoomLoading(false); return
      }

      // Building a team is how you enter. Allow if already entered, you're the
      // host, or there's still room (capacity counts entries = members).
      const [{ data: membership }, { count: entries }] = await Promise.all([
        supabase.from('fantasy_room_members').select('user_id').eq('room_id', roomId).eq('user_id', user!.id).maybeSingle(),
        supabase.from('fantasy_room_members').select('*', { count: 'exact', head: true }).eq('room_id', roomId),
      ])
      const isHost = r.host_id === user!.id
      if (!membership && !isHost && (entries ?? 0) >= r.max_players) {
        setRoomError(`This contest is full (${r.max_players} managers).`); setRoomLoading(false); return
      }

      setRoom(r as FantasyRoom)

      // 2. Player pool — confirmed lineup or full squads from API-Football
      if (!/^\d+$/.test(r.match_id)) {
        setRoomError('This room points to a legacy test match — create a new room from a real fixture')
        setRoomLoading(false)
        return
      }
      let pool: LineupPlayer[] = []
      try {
        const res = await fetch(`/api/wc/lineups/${r.match_id}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
        pool = json.players as LineupPlayer[]
        setLineupSource(json.source === 'lineup' ? 'lineup' : 'squad')
        if (json.home && json.away) setMatchTeams({ home: json.home, away: json.away })
      } catch (e: any) {
        setRoomError(e.message ?? 'Could not load players for this match')
        setRoomLoading(false)
        return
      }
      setLineup(pool)

      // 3. Existing picks for this user+room (editing flow)
      const { data: existingPicks } = await supabase
        .from('fantasy_picks')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', user!.id)

      if (existingPicks && existingPicks.length > 0) {
        const restored: Pick[] = []
        for (const ep of existingPicks) {
          const lp = pool.find(l => l.api_player_id === ep.api_player_id || l.id === ep.api_player_id)
          if (lp) restored.push({ player: lp, role: ep.role as PickRole })
        }
        if (restored.length > 0) setPicks(restored)
      }

      if (!cancelled) setRoomLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [user?.id, roomId])  // user.id is stable; avoids reload on every render

  // Header info — TLAs come from the room row
  const match = room
    ? {
        homeTeam: { tla: room.home_team_tla },
        awayTeam: { tla: room.away_team_tla },
      }
    : undefined

  const budget    = 100
  const spent     = picks.reduce((s, p) => s + p.player.price, 0)
  const remaining = +(budget - spent).toFixed(1)
  const captains  = picks.filter(p => p.role === 'captain').length
  const vcs       = picks.filter(p => p.role === 'vice_captain').length

  // ── Per-position counts ────────────────────────────────────────────────────
  const gkCount  = picks.filter(p => p.player.position === 'GK').length
  const defCount = picks.filter(p => p.player.position === 'DEF').length
  const midCount = picks.filter(p => p.player.position === 'MID').length
  const fwdCount = picks.filter(p => p.player.position === 'FWD').length

  // ── Formation rules ────────────────────────────────────────────────────────
  // GK: exactly 1 | DEF: 3–5 | MID: 3–5 | FWD: 1–3 | Total: 11
  const RULES = {
    GK:  { min: 1, max: 1 },
    DEF: { min: 3, max: 5 },
    MID: { min: 3, max: 5 },
    FWD: { min: 1, max: 3 },
  } as const
  type Pos = keyof typeof RULES

  function posCount(pos: Pos) {
    return picks.filter(p => p.player.position === pos).length
  }

  // Returns the first blocking error string, or null if valid
  function getValidationError(): string | null {
    if (picks.length < 11) return `Pick ${11 - picks.length} more player${11 - picks.length > 1 ? 's' : ''}`
    if (picks.length > 11) return 'Too many players selected'
    if (remaining < 0)     return `Over budget by ${Math.abs(remaining).toFixed(1)} cr`
    if (gkCount  !== 1)    return 'You need exactly 1 GK'
    if (defCount < 3)      return `Add ${3 - defCount} more DEF (min 3)`
    if (defCount > 5)      return 'Too many DEF — max 5'
    if (midCount < 3)      return `Add ${3 - midCount} more MID (min 3)`
    if (midCount > 5)      return 'Too many MID — max 5'
    if (fwdCount < 1)      return 'Add at least 1 FWD'
    if (fwdCount > 3)      return 'Too many FWD — max 3'
    if (captains !== 1)    return 'Tap a player to set Captain (×2 pts)'
    if (vcs !== 1)         return 'Tap a player to set Vice-Captain (×1.5 pts)'
    return null
  }

  const validationError = getValidationError()
  const validPick       = validationError === null

  // Whether adding another player of this position would exceed the max
  function posMaxReached(pos: Pos) {
    return posCount(pos) >= RULES[pos].max
  }

  const positions = ['ALL', 'GK', 'DEF', 'MID', 'FWD']
  const filtered  = activePos === 'ALL' ? lineup : lineup.filter(p => p.position === activePos)

  function togglePick(player: LineupPlayer) {
    const existing = picks.find(p => p.player.id === player.id)
    // Deselect
    if (existing) { setPicks(ps => ps.filter(p => p.player.id !== player.id)); return }
    // Hard limits
    if (picks.length >= 11) return
    if (picks.filter(p => p.player.team_tla === player.team_tla).length >= 7) return
    // Position max guard
    if (posMaxReached(player.position as Pos)) return
    setPicks(ps => [...ps, { player, role: 'player' }])
  }

  function cycleRole(player: LineupPlayer) {
    setPicks(ps => ps.map(p => {
      if (p.player.id !== player.id) return p
      if (p.role === 'player') {
        if (captains === 0) return { ...p, role: 'captain' as PickRole }
        if (vcs === 0)      return { ...p, role: 'vice_captain' as PickRole }
        return p
      }
      if (p.role === 'captain')      return { ...p, role: 'vice_captain' as PickRole }
      if (p.role === 'vice_captain') return { ...p, role: 'player' as PickRole }
      return p
    }))
  }

  async function handleSave() {
    if (!validPick || !user || !room) return
    setSaving(true)
    setSaveError(null)
    try {
      const rows = picks.map(p => ({
        api_player_id: p.player.api_player_id ?? p.player.id,
        player_name:   p.player.name,
        player_short:  p.player.name.split(' ').pop() ?? p.player.name,
        team_tla:      p.player.team_tla,
        position:      p.player.position,
        jersey_number: p.player.jersey_number,
        price:         p.player.price,
        role:          p.role,
      }))

      const res = await fetch(`/api/room/${roomId}/picks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks: rows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Could not save team')

      router.push(`/fantasy/room/${roomId}`)
    } catch (e: any) {
      setSaveError(e.message)
      setSaving(false)
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────────
  if (authLoading || roomLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center pt-14">
        <div className="w-6 h-6 rounded-full border-2 border-pulse-400 border-t-transparent animate-spin" />
      </div>
    )
  }
  if (!user) { router.replace(`/fantasy/login?next=/fantasy/room/${roomId}/pick`); return null }
  if (roomError) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-14 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🚫</div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{roomError}</p>
          <Link href={`/fantasy/room/${roomId}`} className="text-sm text-pulse-600 font-semibold">← Back to room</Link>
        </div>
      </div>
    )
  }
  if (!match || lineup.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-14 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">⏳</div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 font-medium">Player list not available yet</p>
          <p className="text-xs text-gray-400 mb-4">Squads usually appear closer to kickoff — check back soon.</p>
          <Link href={`/fantasy/room/${roomId}`} className="text-sm text-pulse-600 font-semibold">← Back to room</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-14 pb-32">
      {/* Sticky header */}
      <div className="sticky top-14 z-40 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-b border-black/[0.07] dark:border-white/[0.07] px-4 py-3">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href={`/fantasy/room/${roomId}`} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
              </Link>
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {matchTeams?.home?.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={matchTeams.home.logo} alt="" width={16} height={16} className="w-4 h-4 object-contain"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                  {match.homeTeam.tla} vs {match.awayTeam.tla}
                  {matchTeams?.away?.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={matchTeams.away.logo} alt="" width={16} height={16} className="w-4 h-4 object-contain"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">{picks.length}/11 players · {remaining}cr left</div>
              </div>
            </div>
            <div className={clsx(
              'text-sm font-bold px-3 py-1.5 rounded-full',
              remaining < 0  ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
              : remaining < 5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
              : 'bg-pulse-50 text-pulse-700 dark:bg-pulse-900/20 dark:text-pulse-300'
            )}>
              {remaining}cr
            </div>
          </div>

          {/* Validation pills — position counts + captain/budget */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {([
              // Position pills
              {
                label: `GK ${gkCount}/1`,
                ok: gkCount === 1,
                warn: gkCount > 1,
              },
              {
                label: `DEF ${defCount}`,
                ok: defCount >= 3 && defCount <= 5,
                warn: defCount > 5,
                sub: defCount < 3 ? ` (need ${3 - defCount} more)` : defCount > 5 ? ' (max 5)' : '',
              },
              {
                label: `MID ${midCount}`,
                ok: midCount >= 3 && midCount <= 5,
                warn: midCount > 5,
                sub: midCount < 3 ? ` (need ${3 - midCount} more)` : midCount > 5 ? ' (max 5)' : '',
              },
              {
                label: `FWD ${fwdCount}`,
                ok: fwdCount >= 1 && fwdCount <= 3,
                warn: fwdCount > 3,
                sub: fwdCount < 1 ? ' (need 1)' : fwdCount > 3 ? ' (max 3)' : '',
              },
              // Captain / VC / budget
              { label: captains === 1 ? '✓ C'  : 'C?',  ok: captains === 1, warn: false, sub: '' },
              { label: vcs === 1      ? '✓ VC' : 'VC?', ok: vcs === 1,      warn: false, sub: '' },
              {
                label: remaining >= 0 ? `${remaining}cr` : `−${Math.abs(remaining)}cr`,
                ok: remaining >= 0 && remaining <= budget,
                warn: remaining < 0,
                sub: '',
              },
            ] as { label: string; ok: boolean; warn: boolean; sub?: string }[]).map((h, i) => (
              <span key={i} className={clsx(
                'text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap',
                h.warn ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                : h.ok  ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
              )}>
                {h.label}{h.sub}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Provisional-squad notice — confirmed XI not announced yet */}
        {lineupSource === 'squad' && (
          <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-xl px-3 py-2.5">
            <span className="text-sm flex-shrink-0">ℹ️</span>
            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
              Showing full squads — the confirmed starting XI isn&apos;t out yet (usually ~1 h before kickoff).
              Players who don&apos;t feature in the match score 0 points.
            </p>
          </div>
        )}

        {/* Selected team strip */}
        {picks.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Your team — tap to cycle C / VC role
            </p>
            <TeamStrip picks={picks} onCycleRole={cycleRole} />
          </div>
        )}

        {/* Position filter */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
          {positions.map(pos => (
            <button
              key={pos}
              onClick={() => setActivePos(pos)}
              className={clsx(
                'flex-shrink-0 text-xs font-semibold px-3 h-8 rounded-full transition-colors',
                activePos === pos
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'bg-white dark:bg-gray-800 border border-black/[0.08] dark:border-white/[0.08] text-gray-500 dark:text-gray-400'
              )}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Player list */}
        <div className="space-y-2">
          {filtered.map(player => {
            const pick      = picks.find(p => p.player.id === player.id)
            const sameTeam  = picks.filter(p => p.player.team_tla === player.team_tla).length
            const posMaxed  = !pick && posMaxReached(player.position as Pos)
            const canPick   = !pick && picks.length < 11 && sameTeam < 7 && !posMaxed
            return (
              <PlayerRow
                key={player.id}
                player={player}
                pick={pick}
                onToggle={togglePick}
                disabled={!canPick && !pick}
              />
            )
          })}
        </div>
      </div>

      {/* Fixed bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-t border-black/[0.07] dark:border-white/[0.07] px-4 py-3 safe-bottom">
        <div className="max-w-lg mx-auto">
          {saveError && (
            <p className="text-xs text-red-500 text-center mb-2">{saveError}</p>
          )}
          <button
            onClick={handleSave}
            disabled={!validPick || saving}
            className={clsx(
              'w-full flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-semibold transition-all',
              validPick && !saving
                ? 'bg-pulse-600 hover:bg-pulse-700 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            )}
          >
            {saving ? (
              <><span className="w-4 h-4 rounded-full border-2 border-white/50 border-t-white animate-spin" /> Saving team…</>
            ) : (
              <>Save team & return to room <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></>
            )}
          </button>
          {validationError && picks.length > 0 && (
            <p className="text-[11px] text-center text-red-500 dark:text-red-400 font-medium mt-2">
              ⚠ {validationError}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
