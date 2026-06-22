'use client'

/**
 * /fantasy/room/[roomId] - contest room hub (multi-team, up to 100 managers)
 * ═══════════════════════════════════════════════════════════════════════════
 * One host, many guests. Join via the share link or the room code.
 *
 *   waiting  → managers join + pick; everyone sees the participant list
 *   locked   → kicked off, picks frozen, scoring about to start
 *   live      → live leaderboard; tap any manager to view their team
 *   finished → final leaderboard + winner
 *
 * Realtime: fantasy_live_state (match score) + fantasy_rooms (status) via
 * useLiveRoom, plus fantasy_room_members (leaderboard) subscribed here.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { useLiveRoom } from '@/lib/hooks/useLiveRoom'
import { createClient } from '@/lib/supabase/client'
import type { FantasyRoom, FantasyPick, FantasyRoomMember, Position } from '@/lib/supabase/types'
import Link from 'next/link'
import clsx from 'clsx'
import useSWR from 'swr'

const swrFetcher = async (url: string) => {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json
}

const playerPhotoUrl = (id: number) => `https://media.api-sports.io/football/players/${id}.png`
const POS_ORDER: Position[] = ['FWD', 'MID', 'DEF', 'GK']

// ─────────────────────────────────────────────────────────────────────────────
// Pitch + player chip (team sheet)
// ─────────────────────────────────────────────────────────────────────────────

function PitchLines() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 360 480"
      preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="344" height="464" fill="none" stroke="white" strokeWidth="1.2" strokeOpacity="0.18" rx="2"/>
      <line x1="8" y1="240" x2="352" y2="240" stroke="white" strokeWidth="1.2" strokeOpacity="0.18"/>
      <circle cx="180" cy="240" r="44" fill="none" stroke="white" strokeWidth="1.2" strokeOpacity="0.18"/>
      <circle cx="180" cy="240" r="3" fill="white" fillOpacity="0.2"/>
      <rect x="90" y="8" width="180" height="82" fill="none" stroke="white" strokeWidth="1.2" strokeOpacity="0.18"/>
      <rect x="90" y="390" width="180" height="82" fill="none" stroke="white" strokeWidth="1.2" strokeOpacity="0.18"/>
    </svg>
  )
}

const JERSEY_COLOR: Record<Position, { bg: string; ring: string }> = {
  GK:  { bg: '#f59e0b', ring: '#fbbf24' },
  DEF: { bg: '#10b981', ring: '#34d399' },
  MID: { bg: '#3b82f6', ring: '#60a5fa' },
  FWD: { bg: '#ef4444', ring: '#f87171' },
}

function PlayerChip({ pick, showPoints }: { pick: FantasyPick; showPoints: boolean }) {
  const isCap = pick.role === 'captain'
  const isVC  = pick.role === 'vice_captain'
  const { bg, ring } = JERSEY_COLOR[pick.position]
  const pts = pick.total_points

  return (
    <div className="flex flex-col items-center gap-0.5" style={{ width: 56 }}>
      <div className="relative">
        <div
          className="relative w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md border-2 overflow-hidden"
          style={{ background: bg, borderColor: (isCap || isVC) ? ring : 'rgba(255,255,255,0.3)' }}
        >
          {pick.jersey_number ?? pick.player_short.slice(0, 2).toUpperCase()}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={playerPhotoUrl(pick.api_player_id)} alt="" loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
        {(isCap || isVC) && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-black flex items-center justify-center border border-white shadow-sm"
            style={{ background: isCap ? '#facc15' : '#60a5fa', color: isCap ? '#713f12' : '#1e3a5f' }}>
            {isCap ? 'C' : 'V'}
          </span>
        )}
        {showPoints && pts !== null && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 rounded-full text-[8px] font-bold text-white border border-white/60 whitespace-nowrap"
            style={{ background: pts > 0 ? '#16a34a' : '#6b7280' }}>
            {pts > 0 ? '+' : ''}{pts}
          </span>
        )}
      </div>
      <span className="text-[9px] font-semibold text-white/90 max-w-[52px] truncate text-center leading-tight drop-shadow-sm">
        {pick.player_short}
      </span>
      {!showPoints && <span className="text-[8px] text-white/50">{pick.price}cr</span>}
    </div>
  )
}

function TeamSheetModal({
  roomId, targetUserId, label, canSee, showPoints, onClose,
}: {
  roomId: string; targetUserId: string; label: string
  canSee: boolean; showPoints: boolean; onClose: () => void
}) {
  const [picks, setPicks] = useState<FantasyPick[]>([])
  const [loading, setLoading] = useState(true)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) onClose()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  useEffect(() => {
    if (!canSee) { setLoading(false); return }
    const supabase = createClient()
    const load = () => {
      supabase.from('fantasy_picks').select('*').eq('room_id', roomId).eq('user_id', targetUserId)
        .then(({ data }) => { setPicks((data ?? []) as FantasyPick[]); setLoading(false) })
    }
    load()
    const t = showPoints ? setInterval(load, 60_000) : null
    return () => { if (t) clearInterval(t) }
  }, [roomId, targetUserId, canSee, showPoints])

  const rows = POS_ORDER.map(pos => ({ pos, picks: picks.filter(p => p.position === pos) })).filter(r => r.picks.length > 0)
  const captain = picks.find(p => p.role === 'captain')
  const vc      = picks.find(p => p.role === 'vice_captain')
  const totalPts = picks.reduce((s, p) => s + (p.total_points ?? 0), 0)
  const totalCr  = picks.reduce((s, p) => s + p.price, 0)

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
      <div ref={sheetRef} className="w-full rounded-t-3xl overflow-hidden flex flex-col" style={{ maxHeight: '92dvh' }}>
        <div className="bg-gray-900 px-4 pt-3 pb-3 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white truncate max-w-[220px]">{label}</h2>
              {!loading && picks.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-0.5">{picks.length}/11 players · {totalCr.toFixed(0)}cr</p>
              )}
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20 bg-[#1a6b2e]">
              <div className="w-6 h-6 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            </div>
          ) : !canSee ? (
            <div className="flex flex-col items-center justify-center py-20 bg-[#1a6b2e] text-center px-8">
              <span className="text-4xl mb-3">🔒</span>
              <p className="text-sm font-semibold text-white mb-1">Hidden until kick-off</p>
              <p className="text-xs text-white/60">Other teams are revealed once the match starts.</p>
            </div>
          ) : picks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-[#1a6b2e] text-center px-8">
              <span className="text-4xl mb-3">⚽</span>
              <p className="text-sm text-white/70">No team submitted.</p>
            </div>
          ) : (
            <div className="relative" style={{ minHeight: 360, background: 'repeating-linear-gradient(180deg,#1a6b2e 0px,#1a6b2e 34px,#1d7a33 34px,#1d7a33 68px)' }}>
              <PitchLines />
              <div className="relative z-10 flex flex-col justify-around py-5 px-2 gap-3" style={{ minHeight: 360 }}>
                {rows.map(({ pos, picks: rp }) => (
                  <div key={pos} className="flex flex-col items-center gap-1">
                    <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">{pos}</span>
                    <div className="flex items-end justify-center gap-1.5 flex-wrap">
                      {rp.map(p => <PlayerChip key={p.id} pick={p} showPoints={showPoints} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {picks.length > 0 && (
            <div className="bg-gray-900 px-4 py-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-yellow-400 text-yellow-900 text-[8px] font-black flex items-center justify-center">C</span>
                    <span className="text-xs font-semibold text-white truncate max-w-[70px]">{captain?.player_short ?? '-'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-blue-400 text-blue-900 text-[8px] font-black flex items-center justify-center">V</span>
                    <span className="text-xs font-semibold text-white truncate max-w-[70px]">{vc?.player_short ?? '-'}</span>
                  </div>
                </div>
                {showPoints
                  ? <div className="text-right"><div className="text-base font-bold text-white tabular-nums">{totalPts.toFixed(1)}</div><div className="text-[9px] text-gray-500 -mt-0.5">pts</div></div>
                  : <div className="text-right"><div className="text-sm font-bold text-white">{totalCr.toFixed(0)}cr</div><div className="text-[9px] text-gray-500 -mt-0.5">of 100</div></div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatMin(min: number | null) {
  if (min === null) return ''
  return min >= 90 ? '90+′' : `${min}′`
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }: { status: FantasyRoom['status'] }) {
  const cfg = {
    waiting:   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    locked:    'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    live:      'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    finished:  'bg-gray-100 dark:bg-gray-800 text-gray-500',
    cancelled: 'bg-gray-100 dark:bg-gray-800 text-gray-400',
  }
  return <span className={clsx('text-[10px] font-bold px-2 py-1 rounded-full uppercase', cfg[status])}>{status === 'live' ? '🔴 Live' : status}</span>
}

// Invite block - share link + room code
function InviteBox({ roomId, code, count, max }: { roomId: string; code: string; count: number; max: number }) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const link = typeof window !== 'undefined' ? `${window.location.origin}/fantasy/room/${roomId}` : ''
  const copy = (what: 'link' | 'code', value: string) => {
    navigator.clipboard.writeText(value)
    setCopied(what); setTimeout(() => setCopied(null), 1800)
  }
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Invite managers</span>
        <span className="text-[10px] text-gray-400 tabular-nums">{count}/{max} joined</span>
      </div>

      {/* Code */}
      <button onClick={() => copy('code', code)}
        className="w-full flex items-center justify-between bg-pulse-50 dark:bg-pulse-900/20 border border-pulse-100 dark:border-pulse-800/40 rounded-xl px-4 py-3 group">
        <div className="text-left">
          <div className="text-[10px] text-pulse-600/70 dark:text-pulse-400/70 uppercase tracking-wider">Room code</div>
          <div className="text-2xl font-black text-pulse-700 dark:text-pulse-300 tracking-[0.2em] tabular-nums">{code}</div>
        </div>
        <span className="text-[11px] font-semibold text-pulse-600 dark:text-pulse-400">{copied === 'code' ? 'Copied!' : 'Tap to copy'}</span>
      </button>

      {/* Link */}
      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
        <span className="text-[11px] text-gray-600 dark:text-gray-300 flex-1 truncate">{link}</span>
        <button onClick={() => copy('link', link)} className="text-pulse-600 dark:text-pulse-400 text-xs font-semibold flex-shrink-0">
          {copied === 'link' ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type MemberRow = FantasyRoomMember & { name: string; picks: number }

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const { roomId } = params
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const { room, liveState: live, loading: roomLoading, error: roomError } = useLiveRoom(roomId)

  // Team logos
  const { data: matchInfo } = useSWR(
    room && /^\d+$/.test(room.match_id) ? `/api/wc/match/${room.match_id}` : null,
    swrFetcher, { revalidateOnFocus: false, errorRetryCount: 1 },
  )
  const homeLogo: string | undefined = matchInfo?.fixture?.teams?.home?.logo
  const awayLogo: string | undefined = matchInfo?.fixture?.teams?.away?.logo

  // ── Members + their pick counts + display names ──
  const [members, setMembers] = useState<FantasyRoomMember[]>([])
  const [pickCounts, setPickCounts] = useState<Record<string, number>>({})
  const [names, setNames] = useState<Record<string, string>>({})

  const loadMembers = useCallback(async () => {
    const supabase = createClient()
    const [{ data: mem }, { data: picks }] = await Promise.all([
      supabase.from('fantasy_room_members').select('*').eq('room_id', roomId),
      supabase.from('fantasy_picks').select('user_id').eq('room_id', roomId),
    ])
    setMembers((mem ?? []) as FantasyRoomMember[])
    const counts: Record<string, number> = {}
    picks?.forEach((p: { user_id: string }) => { counts[p.user_id] = (counts[p.user_id] ?? 0) + 1 })
    setPickCounts(counts)

    const ids = (mem ?? []).map((m: FantasyRoomMember) => m.user_id)
    if (ids.length) {
      const res = await fetch(`/api/profile?ids=${ids.join(',')}`).then(r => r.json()).catch(() => null)
      const nameMap: Record<string, string> = {}
      for (const id of ids) nameMap[id] = res?.names?.[id]?.display_name ?? 'Manager'
      setNames(nameMap)
    }
  }, [roomId])

  useEffect(() => { loadMembers() }, [loadMembers])
  useEffect(() => { loadMembers() }, [room?.status, loadMembers])

  // Realtime: members (leaderboard) + picks (readiness)
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase.channel(`room-members-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fantasy_room_members', filter: `room_id=eq.${roomId}` }, () => loadMembers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fantasy_picks', filter: `room_id=eq.${roomId}` }, () => loadMembers())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [roomId, loadMembers])

  // Self-healing scoring trigger (cron-independent) once kicked off
  useEffect(() => {
    if (!room) return
    const kickedOff = Date.now() >= new Date(room.kickoff_at).getTime()
    if (!kickedOff || room.status === 'finished' || room.status === 'cancelled') return
    let stopped = false
    const sync = () => { if (!stopped) fetch(`/api/room/${roomId}/sync`, { method: 'POST' }).catch(() => {}) }
    sync()
    const t = setInterval(sync, 30_000)
    return () => { stopped = true; clearInterval(t) }
  }, [roomId, room?.status, room?.kickoff_at])

  const [teamModal, setTeamModal] = useState<{ userId: string; label: string } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  async function removeMember(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this contest?`)) return
    setRemoving(userId)
    try {
      const res = await fetch(`/api/room/${roomId}/members?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Could not remove')
      await loadMembers()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setRemoving(null)
    }
  }

  // ── Derived ──
  // A "member" = a manager who has entered (submitted a full team).
  const isMember  = !!user && members.some(m => m.user_id === user.id)
  const isHost    = !!user && !!room && room.host_id === user.id
  const isLive    = room?.status === 'live'
  const isOver    = room?.status === 'finished'
  const kickedOff = room ? Date.now() >= new Date(room.kickoff_at).getTime() : false
  const open      = room?.status === 'waiting' && !kickedOff
  const entries   = members.length
  const full      = !!room && entries >= room.max_players
  const canEdit   = isMember && open                       // edit my entry
  const canEnter  = !isMember && open && (isHost || !full) // build a team to enter
  const matchLabel = room?.match_label ?? 'Match'

  // Leaderboard ordering: by points when scoring has begun, else host-first then join order
  const board: MemberRow[] = members
    .map(m => ({ ...m, name: names[m.user_id] ?? 'Manager', picks: pickCounts[m.user_id] ?? 0 }))
    .sort((a, b) => {
      if (isLive || isOver) return (b.total_points ?? 0) - (a.total_points ?? 0)
      if (a.is_host !== b.is_host) return a.is_host ? -1 : 1
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    })

  // ── Loading / error ──
  if (authLoading || roomLoading) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center pt-14"><div className="w-6 h-6 rounded-full border-2 border-pulse-400 border-t-transparent animate-spin" /></div>
  }
  if (!user) { router.replace(`/fantasy/login?next=/fantasy/room/${roomId}`); return null }
  if (roomError || !room) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-14 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">🔍</div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Room not found</h2>
          <p className="text-sm text-gray-400 mb-4">This link may have expired.</p>
          <Link href="/fantasy" className="text-sm text-pulse-600 font-semibold">← Back to lobby</Link>
        </div>
      </div>
    )
  }

  const canSee = (uid: string) => uid === user.id || isLive || isOver
  const openTeam = (uid: string, label: string) => setTeamModal({ userId: uid, label })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-14 pb-24">
      {teamModal && (
        <TeamSheetModal
          roomId={roomId}
          targetUserId={teamModal.userId}
          label={teamModal.label}
          canSee={canSee(teamModal.userId)}
          showPoints={isLive || isOver}
          onClose={() => setTeamModal(null)}
        />
      )}

      {/* Header */}
      <div className="sticky top-14 z-30 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-b border-black/[0.07] dark:border-white/[0.07] px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href="/fantasy" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{matchLabel}</div>
            <div className="text-[11px] text-gray-400">{members.length} manager{members.length === 1 ? '' : 's'} · contest room</div>
          </div>
          <StatusBadge status={room.status} />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Match score / teams */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] p-4">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              {homeLogo ? <img src={homeLogo} alt="" className="w-9 h-9 object-contain mx-auto" onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                        : <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 mx-auto" />}
              <div className="text-xs font-bold text-gray-800 dark:text-gray-200 mt-1">{room.home_team_tla}</div>
            </div>
            <div className="text-center px-4">
              {(isLive || isOver) && live ? (
                <>
                  <div className="text-2xl font-black text-gray-900 dark:text-gray-100 tabular-nums">{live.home_score} - {live.away_score}</div>
                  <div className={clsx('text-[10px] font-semibold mt-0.5', isLive ? 'text-red-500' : 'text-gray-400')}>
                    {isOver ? 'FT' : live.match_status === 'HT' ? 'HT' : formatMin(live.match_minute)}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs font-bold text-gray-300 dark:text-gray-600">VS</div>
                  <div className="text-[10px] text-gray-400 mt-1">{formatDate(room.kickoff_at)}</div>
                </>
              )}
            </div>
            <div className="text-center flex-1">
              {awayLogo ? <img src={awayLogo} alt="" className="w-9 h-9 object-contain mx-auto" onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                        : <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 mx-auto" />}
              <div className="text-xs font-bold text-gray-800 dark:text-gray-200 mt-1">{room.away_team_tla}</div>
            </div>
          </div>
        </div>

        {/* Enter by building a team (host or open seat) */}
        {canEnter && (
          <Link href={`/fantasy/room/${roomId}/pick`}
            className="w-full h-12 rounded-xl bg-pulse-600 hover:bg-pulse-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
            Build your team to enter
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
        )}
        {/* Host hasn't entered yet - gentle nudge */}
        {isHost && !isMember && open && (
          <p className="text-center text-[11px] text-amber-600 dark:text-amber-400">
            You created this contest - build your team to enter it too.
          </p>
        )}
        {/* Can't enter: full, or already started */}
        {!isMember && open && full && (
          <div className="rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-3 text-center text-xs text-gray-500">
            This contest is full ({room.max_players} managers).
          </div>
        )}
        {!isMember && !open && (
          <div className="rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-3 text-center text-xs text-gray-500">
            Entries are closed - you can watch the leaderboard but can&apos;t enter.
          </div>
        )}

        {/* Edit my entry (pre-kickoff) */}
        {canEdit && (
          <Link href={`/fantasy/room/${roomId}/pick`}
            className="w-full h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-colors bg-white dark:bg-gray-900 border border-pulse-200 dark:border-pulse-800 text-pulse-700 dark:text-pulse-300">
            Edit your team
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
        )}

        {/* Invite - host or anyone who's entered, pre-kickoff */}
        {(isHost || isMember) && open && (
          <InviteBox roomId={roomId} code={room.room_code} count={members.length} max={room.max_players} />
        )}

        {/* Kicked off, scoring not in yet */}
        {room.status === 'locked' && (
          <div className="rounded-2xl border border-pulse-200 dark:border-pulse-800/50 bg-pulse-50 dark:bg-pulse-900/20 py-5 px-4 text-center">
            <div className="w-5 h-5 rounded-full border-2 border-pulse-400 border-t-transparent animate-spin mx-auto mb-2" />
            <p className="text-sm font-semibold text-pulse-700 dark:text-pulse-300">Match has kicked off</p>
            <p className="text-xs text-pulse-600/70 dark:text-pulse-400/70 mt-0.5">Picks are locked. The leaderboard goes live within a minute.</p>
          </div>
        )}

        {/* ── Leaderboard / participants ── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/[0.05] dark:border-white/[0.05] bg-gray-50/60 dark:bg-gray-800/30">
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {isLive || isOver ? 'Leaderboard' : 'Managers entered'}
            </span>
            <span className="text-[10px] text-gray-400 tabular-nums">{entries} / {room.max_players}</span>
          </div>

          <div className="max-h-[60vh] overflow-y-auto divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {board.map((m, i) => {
              const isMe = m.user_id === user.id
              const showRank = isLive || isOver
              const viewable = canSee(m.user_id)
              const canRemove = isHost && open && !m.is_host   // host kicks others pre-kickoff
              return (
                <div key={m.user_id}
                  className={clsx('flex items-center gap-3 transition-colors',
                    isMe ? 'bg-pulse-50/60 dark:bg-pulse-900/15' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40')}>
                  <button
                    onClick={() => viewable && openTeam(m.user_id, isMe ? `${m.name} (you)` : m.name)}
                    disabled={!viewable}
                    className={clsx('flex-1 min-w-0 flex items-center gap-3 pl-4 py-3 text-left', !viewable && 'cursor-default')}
                  >
                    <span className={clsx('w-6 text-center text-sm font-bold tabular-nums flex-shrink-0',
                      showRank && i === 0 ? 'text-amber-500' : showRank && i < 3 ? 'text-pulse-600 dark:text-pulse-400' : 'text-gray-300 dark:text-gray-600')}>
                      {showRank ? i + 1 : ''}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-pulse-100 dark:bg-pulse-900/30 flex items-center justify-center text-sm flex-shrink-0">
                      {m.is_host ? '👑' : '👤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{m.name}</span>
                        {isMe && <span className="text-[9px] font-bold text-pulse-600 dark:text-pulse-400">YOU</span>}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {m.is_host ? 'Host · ' : ''}
                        {showRank ? (viewable ? 'Tap to view team' : 'Team revealed at kick-off') : (isMe ? 'Tap to view your team' : 'Entered · team hidden until kick-off')}
                      </div>
                    </div>
                    {showRank && (
                      <span className="text-base font-black text-gray-900 dark:text-gray-100 tabular-nums flex-shrink-0">
                        {(m.total_points ?? 0).toFixed(1)}
                      </span>
                    )}
                  </button>
                  {canRemove && (
                    <button
                      onClick={() => removeMember(m.user_id, m.name)}
                      disabled={removing === m.user_id}
                      title="Remove from contest"
                      className="mr-3 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0 disabled:opacity-50"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  )}
                </div>
              )
            })}
            {board.length === 0 && (
              <div className="py-10 text-center text-xs text-gray-400">
                {isOver ? 'No one entered this contest.' : 'No teams entered yet - be the first.'}
              </div>
            )}
          </div>
        </div>

        {/* Winner banner */}
        {isOver && room.winner_id && (
          <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 p-4 text-center">
            <p className="text-[11px] font-bold text-amber-900/70 uppercase tracking-wider">Winner</p>
            <p className="text-lg font-black text-amber-950">
              {room.winner_id === user.id ? '🏆 You won!' : `🏆 ${names[room.winner_id] ?? 'Manager'}`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
