'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import clsx from 'clsx'
import useSWR from 'swr'
import { format, isToday, isTomorrow } from 'date-fns'
import type { FantasyRoom } from '@/lib/supabase/types'
import { teamTla } from '@/lib/api/tla'
import { LiveTopPoints } from '@/components/shared/LiveTopPoints'
import { localDateKey, todayKey } from '@/lib/time'
import type { AFWCFixture } from '@/lib/api/apifootball'

// ── Helpers ────────────────────────────────────────────────────────────────────
function roomStatusCfg(status: FantasyRoom['status']) {
  return {
    waiting:   { label: 'Waiting',    cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
    locked:    { label: 'Locked 🔒',  cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
    live:      { label: '🔴 Live',    cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
    finished:  { label: 'Finished',   cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500' },
    cancelled: { label: 'Cancelled',  cls: 'bg-gray-100 dark:bg-gray-800 text-gray-400' },
  }[status]
}

// ── Join a contest by code ───────────────────────────────────────────────────
function JoinByCode({ onJoined }: { onJoined: () => void }) {
  const router = useRouter()
  const [code, setCode]   = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function join() {
    if (busy || code.trim().length < 4) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/room/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Could not join')
      onJoined()
      router.push(`/fantasy/room/${json.roomId}`)
    } catch (e: any) {
      setError(e.message); setBusy(false)
    }
  }

  return (
    <div className="mb-5 bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-pulse-600 dark:text-pulse-400">
          <path d="M15 7h3a5 5 0 0 1 0 10h-3M9 17H6a5 5 0 0 1 0-10h3M8 12h8"/>
        </svg>
        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">Join a contest with a code</span>
      </div>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') join() }}
          maxLength={8}
          placeholder="Enter code"
          className="flex-1 h-10 px-3 rounded-xl border border-black/[0.1] dark:border-white/[0.1] bg-gray-50 dark:bg-gray-800 text-sm font-bold tracking-[0.15em] tabular-nums text-gray-900 dark:text-gray-100 placeholder:text-gray-400 placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-pulse-400"
        />
        <button onClick={join} disabled={busy || code.trim().length < 4}
          className={clsx('px-5 h-10 rounded-xl text-sm font-semibold transition-colors flex-shrink-0',
            busy || code.trim().length < 4 ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed' : 'bg-pulse-600 hover:bg-pulse-700 text-white')}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}

// ── My Room card ───────────────────────────────────────────────────────────────
function MyRoomCard({
  room, userId, pickCounts,
}: {
  room: FantasyRoom
  userId: string
  pickCounts: Record<string, number>
}) {
  const isHost       = room.host_id === userId
  const myPicks      = pickCounts[userId] ?? 0
  const myDone       = myPicks >= 11

  const matchLabel   = room.match_label ?? 'Match'
  const cfg          = roomStatusCfg(room.status)

  // Derive a short "what to do" hint
  let hint = ''
  if (room.status === 'waiting') {
    hint = myDone ? 'Team ready - invite more managers' : 'Build your team →'
  } else if (room.status === 'locked') hint = 'Picks locked · match starting soon'
  else if (room.status === 'live')     hint = 'Leaderboard is live →'
  else if (room.status === 'finished') {
    hint = room.winner_id === userId ? '🏆 You won!' : 'See final standings →'
  }

  return (
    <Link
      href={`/fantasy/room/${room.id}`}
      className={clsx(
        'block bg-white dark:bg-gray-900 rounded-2xl border transition-all hover:shadow-md',
        room.status === 'live'
          ? 'border-red-200 dark:border-red-800/50 shadow-sm'
          : 'border-black/[0.07] dark:border-white/[0.07]'
      )}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {matchLabel}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {isHost ? '👑 Host' : '👤 Joined'} · {new Date(room.kickoff_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <span className={clsx('text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0', cfg.cls)}>
            {cfg.label}
          </span>
        </div>

        {/* Your status */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Your team</span>
          <span className={clsx('text-xs font-medium', myDone ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400')}>
            {myDone ? 'Ready ✓' : myPicks > 0 ? `${myPicks}/11 picked` : 'Not built yet'}
          </span>
        </div>

        {/* Hint / CTA */}
        <div className={clsx(
          'flex items-center justify-between rounded-xl px-3 py-2',
          room.status === 'live'     ? 'bg-red-50 dark:bg-red-900/20'
          : room.status === 'finished' ? 'bg-gray-50 dark:bg-gray-800'
          : 'bg-pulse-50 dark:bg-pulse-900/20'
        )}>
          <span className={clsx(
            'text-xs font-medium',
            room.status === 'live'     ? 'text-red-600 dark:text-red-400'
            : room.status === 'finished' ? 'text-gray-500'
            : 'text-pulse-700 dark:text-pulse-300'
          )}>
            {hint}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className="text-gray-400 flex-shrink-0">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
      </div>
    </Link>
  )
}

// ── Inline room row shown inside a match card ──────────────────────────────────
function InlineRoomRow({ room, userId }: { room: FantasyRoom; userId: string }) {
  const isHost     = room.host_id === userId
  const guestIn    = !!room.guest_id
  const statusCfg  = {
    waiting:   { dot: 'bg-amber-400', text: 'Waiting' },
    locked:    { dot: 'bg-orange-400', text: 'Locked 🔒' },
    live:      { dot: 'bg-red-500 live-dot', text: '🔴 Live' },
    finished:  { dot: 'bg-gray-400', text: 'Finished' },
    cancelled: { dot: 'bg-gray-300', text: 'Cancelled' },
  }[room.status]

  return (
    <Link
      href={`/fantasy/room/${room.id}`}
      className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-pulse-50 dark:hover:bg-pulse-900/20 rounded-xl px-3 py-2.5 transition-colors group"
    >
      {/* Role badge */}
      <span className="text-base flex-shrink-0">{isHost ? '👑' : '👤'}</span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
            {isHost ? 'Your room' : 'Joined room'}
          </span>
          <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', statusCfg.dot)} />
          <span className="text-[10px] text-gray-500 dark:text-gray-400">{statusCfg.text}</span>
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5">
          {guestIn ? 'Managers joined' : 'Share the link or code to fill it'}
        </div>
      </div>

      {/* Arrow */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        className="text-gray-300 dark:text-gray-600 group-hover:text-pulse-500 transition-colors flex-shrink-0">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Real fixture cards - WC + Friendly matches from API
// ─────────────────────────────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const r = await fetch(url); const j = await r.json()
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`)
  return j
}

interface RealFixturesRes { fixtures: AFWCFixture[]; liveCount: number }

const LIVE_S = new Set(['1H','2H','HT','ET','BT','P','INT','LIVE'])
const FIN_S  = new Set(['FT','AET','PEN'])

function useRealMatches(enabled: boolean) {
  const { data: wc,      isLoading: wcL  } = useSWR<RealFixturesRes>(enabled ? '/api/wc/fixtures'  : null, fetcher, { refreshInterval: 30_000 })
  const { data: friends, isLoading: frL  } = useSWR<RealFixturesRes>(enabled ? '/api/wc/friendlies': null, fetcher, { refreshInterval: 60_000 })

  const today = todayKey()                                          // local
  const windowEnd = localDateKey(new Date(Date.now() + 2 * 86_400_000))

  // Include: live now + upcoming within 2 days, exclude already-finished
  function slice(list: AFWCFixture[] | undefined) {
    return (list ?? []).filter(f => {
      const s   = f.fixture.status.short
      const day = localDateKey(f.fixture.date)                      // local
      if (FIN_S.has(s)) return false
      if (LIVE_S.has(s)) return true
      return day >= today && day <= windowEnd
    })
  }

  return {
    wcMatches:       slice(wc?.fixtures),
    friendlyMatches: slice(friends?.fixtures),
    liveCount:       (wc?.liveCount ?? 0) + (friends?.liveCount ?? 0),
    isLoading:       wcL || frL,
  }
}


function RealFixtureCard({
  fixture: f, isFriendly, myRooms, userId,
}: {
  fixture: AFWCFixture
  isFriendly: boolean
  myRooms: FantasyRoom[]
  userId: string
}) {
  const isLive  = LIVE_S.has(f.fixture.status.short)
  const matchId = String(f.fixture.id)
  const matchRooms = myRooms.filter(r => r.match_id === matchId)

  const kickoff = new Date(f.fixture.date)
  const diffH   = (kickoff.getTime() - Date.now()) / 3_600_000
  // Rooms can only be created before kickoff - picks lock when the match starts,
  // so creating a room for a live match would be an immediate dead-end.
  const canCreate = f.fixture.status.short === 'NS' && diffH > 0

  // All labels use the viewer's local timezone (date-fns format/isToday are local)
  let timeStr = ''
  if (isLive) {
    const el = f.fixture.status.elapsed
    timeStr = f.fixture.status.short === 'HT' ? 'Half Time' : el ? `${el}'` : 'Live'
  } else if (diffH > 0 && diffH < 1) {
    timeStr = `Starts in ${Math.ceil(diffH * 60)} min`
  } else if (isToday(kickoff)) {
    timeStr = `Today ${format(kickoff, 'HH:mm')}`
  } else if (isTomorrow(kickoff)) {
    timeStr = `Tomorrow ${format(kickoff, 'HH:mm')}`
  } else {
    timeStr = format(kickoff, 'EEE d MMM, HH:mm')
  }

  return (
    <div className={clsx(
      'bg-white dark:bg-gray-900 rounded-2xl border transition-shadow',
      isLive ? 'border-red-200 dark:border-red-800/60 shadow-sm' : 'border-black/[0.07] dark:border-white/[0.07]'
    )}>
      <div className="p-4">
        {/* Badge row */}
        <div className="flex items-center justify-between mb-3">
          <span className={clsx(
            'text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full',
            isFriendly
              ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
          )}>
            {isFriendly ? 'Friendly' : 'WC 2026'}
          </span>
          {isLive ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />{timeStr}
            </span>
          ) : (
            <span className="text-[11px] text-gray-400">{timeStr}</span>
          )}
        </div>

        {/* Teams */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.teams.home.logo} alt="" width={28} height={28}
              className="w-7 h-7 object-contain mx-auto mb-1"
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{teamTla(f.teams.home.name)}</div>
            <div className="text-[10px] text-gray-400 leading-tight mt-0.5 truncate max-w-[70px] mx-auto">{f.teams.home.name}</div>
          </div>
          <div className="px-3 text-center flex-shrink-0">
            {isLive ? (
              <div className="text-lg font-black text-gray-800 dark:text-gray-200 tabular-nums">
                {f.goals.home ?? 0} - {f.goals.away ?? 0}
              </div>
            ) : (
              <div className="text-lg font-black text-gray-300 dark:text-gray-600">VS</div>
            )}
          </div>
          <div className="flex-1 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.teams.away.logo} alt="" width={28} height={28}
              className="w-7 h-7 object-contain mx-auto mb-1"
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{teamTla(f.teams.away.name)}</div>
            <div className="text-[10px] text-gray-400 leading-tight mt-0.5 truncate max-w-[70px] mx-auto">{f.teams.away.name}</div>
          </div>
        </div>

        {/* CTA */}
        {canCreate ? (
          <Link
            href={`/fantasy/room/create?match=${matchId}`}
            className="w-full flex items-center justify-center gap-1.5 bg-pulse-600 hover:bg-pulse-700 text-white text-xs font-semibold h-9 rounded-xl transition-colors"
          >
            Create contest room
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        ) : (
          <span className="w-full flex items-center justify-center text-xs text-gray-400 h-9">
            {isLive ? 'Match started - rooms closed' : 'Not available'}
          </span>
        )}

        {/* Live player points - top 3, updates every minute */}
        {isLive && <LiveTopPoints fixtureId={f.fixture.id} />}

        {/* Existing rooms for this match */}
        {matchRooms.length > 0 && (
          <div className="space-y-1.5 mt-3 pt-3 border-t border-black/[0.04] dark:border-white/[0.04]">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
              Your rooms
            </p>
            {matchRooms.map(r => (
              <InlineRoomRow key={r.id} room={r} userId={userId} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Authenticated lobby ────────────────────────────────────────────────────────
function AuthenticatedLobby({ userId }: { userId: string }) {
  const [tab,       setTab]       = useState<'rooms' | 'matches'>('rooms')
  const [myRooms,   setMyRooms]   = useState<FantasyRoom[]>([])
  const [pickCounts,setPickCounts]= useState<Record<string, number>>({})
  const [loading,   setLoading]   = useState(true)

  // Manager name - prompt once until set
  const [displayName, setDisplayName] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(j => setDisplayName(j?.profile?.display_name ?? null))
      .catch(() => setDisplayName(null))
  }, [])

  const loadRooms = useCallback(async () => {
    const supabase = createClient()

    // Rooms I host OR have entered (a contest I created but haven't entered
    // yet still shows here, so I can build my team / share the code).
    const [{ data: memberships }, { data: hosted }] = await Promise.all([
      supabase.from('fantasy_room_members').select('room_id').eq('user_id', userId),
      supabase.from('fantasy_rooms').select('id').eq('host_id', userId),
    ])

    const myRoomIds = Array.from(new Set([
      ...(memberships ?? []).map(m => m.room_id),
      ...((hosted ?? []) as { id: string }[]).map(h => h.id),
    ]))
    if (myRoomIds.length === 0) { setMyRooms([]); setLoading(false); return }

    const { data: rooms } = await (supabase as any)
      .from('fantasy_rooms')
      .select('*')
      .in('id', myRoomIds)
      .order('created_at', { ascending: false })

    if (!rooms || rooms.length === 0) { setMyRooms([]); setLoading(false); return }
    setMyRooms(rooms as FantasyRoom[])

    // My pick count per room (for readiness)
    const { data: picks } = await supabase
      .from('fantasy_picks')
      .select('room_id, user_id')
      .in('room_id', myRoomIds)

    const counts: Record<string, number> = {}
    picks?.forEach(p => { counts[p.user_id] = (counts[p.user_id] ?? 0) + 1 })
    setPickCounts(counts)
    setLoading(false)
  }, [userId])

  useEffect(() => { loadRooms() }, [loadRooms])

  // Auto-switch to Matches tab if no rooms yet
  useEffect(() => {
    if (!loading && myRooms.length === 0) setTab('matches')
  }, [loading, myRooms.length])

  const { wcMatches, friendlyMatches, isLoading: realLoading } = useRealMatches(tab === 'matches')

  // Rooms tab: active (waiting/locked/live) and completed separately
  const activeRooms   = myRooms.filter(r => r.status === 'waiting' || r.status === 'locked' || r.status === 'live')
  const finishedRooms = myRooms.filter(r => r.status === 'finished')

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Fantasy contests</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {displayName ? <>Manager <span className="font-semibold text-pulse-600 dark:text-pulse-400">{displayName}</span></> : 'Pick · Challenge · Score live'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/fantasy/scoring"
            className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-pulse-600 dark:hover:text-pulse-400 transition-colors font-medium"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 8h.01M12 12v4"/>
            </svg>
            Scoring
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl mb-5">
        {([
          { id: 'rooms',   label: 'My Rooms', count: myRooms.length },
          { id: 'matches', label: 'Matches',  count: null },
        ] as { id: 'rooms' | 'matches'; label: string; count: number | null }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-semibold transition-all',
              tab === t.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            )}
          >
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span className={clsx(
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center',
                tab === t.id
                  ? 'bg-pulse-100 dark:bg-pulse-900/40 text-pulse-700 dark:text-pulse-300'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── MY ROOMS TAB ─────────────────────────────────────────────── */}
      {tab === 'rooms' && (
        <div id="my-rooms">
          {/* Join with a code */}
          <JoinByCode onJoined={loadRooms} />

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-36 bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] animate-pulse" />
              ))}
            </div>
          ) : myRooms.length === 0 ? (
            <div className="text-center py-14">
              <div className="text-4xl mb-3">🏟</div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">No rooms yet</h3>
              <p className="text-xs text-gray-400 mb-4">Create a contest from a match, or join one with a code above.</p>
              <button
                onClick={() => setTab('matches')}
                className="inline-flex items-center gap-1.5 bg-pulse-600 hover:bg-pulse-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                Browse matches →
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Active - waiting / locked / live */}
              {activeRooms.length > 0 ? (
                <section>
                  <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    {activeRooms.some(r => r.status === 'live') && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 live-dot" />
                    )}
                    Active
                  </h2>
                  {activeRooms.map(room => (
                    <div key={room.id} className="mb-3">
                      <MyRoomCard room={room} userId={userId} pickCounts={pickCounts} />
                    </div>
                  ))}
                </section>
              ) : finishedRooms.length > 0 ? (
                // Have completed rooms but nothing active - nudge to create
                <div className="bg-pulse-50 dark:bg-pulse-900/20 rounded-2xl border border-pulse-100 dark:border-pulse-800/40 px-4 py-4 flex items-center gap-3">
                  <span className="text-2xl">⚽</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-pulse-700 dark:text-pulse-300">No active rooms</p>
                    <p className="text-[11px] text-pulse-600/70 dark:text-pulse-400/70 mt-0.5">Start a new contest from today's matches</p>
                  </div>
                  <button
                    onClick={() => setTab('matches')}
                    className="flex-shrink-0 bg-pulse-600 hover:bg-pulse-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
                  >
                    Browse →
                  </button>
                </div>
              ) : null}

              {/* Completed - results */}
              {finishedRooms.length > 0 && (
                <section>
                  <h2 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Completed</h2>
                  {finishedRooms.map(room => (
                    <div key={room.id} className="mb-3 opacity-75">
                      <MyRoomCard room={room} userId={userId} pickCounts={pickCounts} />
                    </div>
                  ))}
                </section>
              )}

              <button
                onClick={() => setTab('matches')}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                Create another room
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── MATCHES TAB ──────────────────────────────────────────────── */}
      {tab === 'matches' && (
        <div className="space-y-6">

          {/* ─ Real fixtures loading skeleton ─ */}
          {realLoading && wcMatches.length === 0 && friendlyMatches.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-36 bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] animate-pulse" />
              ))}
            </div>
          )}

          {/* ─ WC 2026 live matches (real) ─ */}
          {wcMatches.filter(f => LIVE_S.has(f.fixture.status.short)).length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                WC 2026 · Live now
              </h2>
              <div className="space-y-3">
                {wcMatches.filter(f => LIVE_S.has(f.fixture.status.short)).map(f => (
                  <RealFixtureCard key={f.fixture.id} fixture={f} isFriendly={false} myRooms={myRooms} userId={userId} />
                ))}
              </div>
            </section>
          )}

          {/* ─ Friendly live matches (real) ─ */}
          {friendlyMatches.filter(f => LIVE_S.has(f.fixture.status.short)).length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Friendlies · Live now
              </h2>
              <div className="space-y-3">
                {friendlyMatches.filter(f => LIVE_S.has(f.fixture.status.short)).map(f => (
                  <RealFixtureCard key={f.fixture.id} fixture={f} isFriendly myRooms={myRooms} userId={userId} />
                ))}
              </div>
            </section>
          )}

          {/* ─ WC upcoming (real) ─ */}
          {wcMatches.filter(f => f.fixture.status.short === 'NS').length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">⚽ WC 2026 · Upcoming</h2>
              <div className="space-y-3">
                {wcMatches.filter(f => f.fixture.status.short === 'NS').map(f => (
                  <RealFixtureCard key={f.fixture.id} fixture={f} isFriendly={false} myRooms={myRooms} userId={userId} />
                ))}
              </div>
            </section>
          )}

          {/* ─ Friendlies upcoming (real) ─ */}
          {friendlyMatches.filter(f => f.fixture.status.short === 'NS').length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">🤝 Friendlies · Upcoming</h2>
              <div className="space-y-3">
                {friendlyMatches.filter(f => f.fixture.status.short === 'NS').map(f => (
                  <RealFixtureCard key={f.fixture.id} fixture={f} isFriendly myRooms={myRooms} userId={userId} />
                ))}
              </div>
            </section>
          )}

          {/* ─ Truly empty ─ */}
          {!realLoading && wcMatches.length === 0 && friendlyMatches.length === 0 && (
            <div className="text-center py-14">
              <div className="text-4xl mb-3">📅</div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">No matches today or tomorrow</h3>
              <p className="text-xs text-gray-400">Check back closer to the next match day.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Guest landing ──────────────────────────────────────────────────────────────
function GuestLanding() {
  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="inline-flex items-center gap-2 bg-pulse-50 dark:bg-pulse-900/20 text-pulse-700 dark:text-pulse-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
        <span className="w-1.5 h-1.5 rounded-full bg-pulse-400 live-dot" />
        FIFA World Cup 2026 · Fantasy contests
      </div>
      <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 dark:text-gray-100 mb-4 tracking-tight leading-tight">
        Pick your 11.<br className="hidden sm:block" /> Challenge a friend.
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
        For every WC match, build an 11-player team from the lineup. Create a contest, share the link or code, and climb the live leaderboard.
      </p>
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[{ val: '11', sub: 'players' }, { val: '100', sub: 'credits' }, { val: '100', sub: 'max managers' }].map(s => (
          <div key={s.val} className="bg-white dark:bg-gray-900 border border-black/[0.07] dark:border-white/[0.07] rounded-xl p-3">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.val}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>
      <Link href="/fantasy/login"
        className="inline-flex items-center justify-center gap-2 bg-pulse-600 hover:bg-pulse-700 text-white text-sm font-semibold px-6 py-3 rounded-xl transition-colors">
        Sign in to play
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </Link>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function FantasyPage() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-pulse-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {user ? <AuthenticatedLobby userId={user.id} /> : <GuestLanding />}
    </div>
  )
}
