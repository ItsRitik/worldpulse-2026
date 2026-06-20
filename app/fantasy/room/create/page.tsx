'use client'

/**
 * Room Create — step 1 of 2
 * ══════════════════════════
 * matchId = numeric API-Football fixture ID.
 * Creates the fantasy_rooms row, then redirects to /fantasy/room/{id}.
 */

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import Link from 'next/link'
import clsx from 'clsx'
import useSWR from 'swr'
import type { AFWCFixture } from '@/lib/api/apifootball'
import { teamTla as tla } from '@/lib/api/tla'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface NormalisedMatch {
  id:        string
  homeTeam:  { name: string; tla: string; logo: string }
  awayTeam:  { name: string; tla: string; logo: string }
  kickoff:   string  // ISO
  group:     string
  isFriendly: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const res  = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json
}

function formatKickoff(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    + ' · '
    + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** Convert a real AFWCFixture → NormalisedMatch */
function adaptFixture(f: AFWCFixture, isFriendly = false): NormalisedMatch {
  const round = f.league.round
  const group = round.startsWith('Group Stage')
    ? `Group Stage · MD${round.split(' - ')[1] ?? '?'}`
    : isFriendly ? 'International Friendly'
    : round
  return {
    id:        String(f.fixture.id),
    homeTeam:  { name: f.teams.home.name, tla: tla(f.teams.home.name), logo: f.teams.home.logo },
    awayTeam:  { name: f.teams.away.name, tla: tla(f.teams.away.name), logo: f.teams.away.logo },
    kickoff:   f.fixture.date,
    group,
    isFriendly,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

// useSearchParams() requires a Suspense boundary at build time
export default function CreateRoomPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center pt-14">
        <div className="w-6 h-6 rounded-full border-2 border-pulse-400 border-t-transparent animate-spin" />
      </div>
    }>
      <CreateRoomPageInner />
    </Suspense>
  )
}

function CreateRoomPageInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const { user, loading } = useAuth()

  const matchId     = searchParams.get('match') ?? ''
  const isRealId    = /^\d+$/.test(matchId)  // numeric API-Football fixture ID

  const { data: matchApiData, isLoading: matchLoading } = useSWR<{
    fixture: AFWCFixture
  }>(
    isRealId && matchId ? `/api/wc/match/${matchId}` : null,
    fetcher,
    { revalidateOnFocus: false, errorRetryCount: 2 }
  )

  const match: NormalisedMatch | null = matchApiData?.fixture
    ? adaptFixture(matchApiData.fixture, matchApiData.fixture.league.id === 10)
    : null

  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/fantasy/login?next=/fantasy/room/create?match=${matchId}`)
    }
  }, [user, loading, matchId, router])

  if (loading || (isRealId && matchLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center pt-14">
        <div className="w-6 h-6 rounded-full border-2 border-pulse-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-14 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-3">⚽</div>
          <p className="text-sm text-gray-400 mb-4">Match not found. Go back and pick one.</p>
          <Link href="/fantasy" className="text-sm text-pulse-600 font-semibold">← Back to lobby</Link>
        </div>
      </div>
    )
  }

  async function handleCreate() {
    if (!user || !match) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/room/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_id:      match.id,
          match_label:   `${match.homeTeam.name} vs ${match.awayTeam.name}`,
          home_team_tla: match.homeTeam.tla,
          away_team_tla: match.awayTeam.tla,
          kickoff_at:    match.kickoff,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Failed to create room')
      router.push(`/fantasy/room/${json.roomId}`)
    } catch (e: any) {
      setError(e.message)
      setCreating(false)
    }
  }

  const lockTime     = new Date(match.kickoff)
  const kicksOffIn   = lockTime.getTime() - Date.now()
  const hoursUntil   = kicksOffIn / 3_600_000
  const isVeryClose  = hoursUntil <= 1 && hoursUntil > 0
  const alreadyStarted = kicksOffIn <= 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-14 pb-10">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-black/[0.07] dark:border-white/[0.07] px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href="/fantasy" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </Link>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">New contest room</div>
          {match.isFriendly && (
            <span className="text-[9px] font-bold tracking-widest uppercase text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
              Friendly
            </span>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">

        {/* Match card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] p-5">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">Match</div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-center flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={match.homeTeam.logo} alt="" width={40} height={40}
                className="w-10 h-10 object-contain mx-auto mb-1.5"
                onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
              <div className="text-sm font-black text-gray-800 dark:text-gray-200">{match.homeTeam.tla}</div>
              <div className="text-[11px] text-gray-400 leading-tight">{match.homeTeam.name}</div>
            </div>
            <div className="text-center px-4">
              <div className="text-lg font-black text-gray-300 dark:text-gray-600">VS</div>
              <div className="text-[10px] text-gray-400 mt-1">{match.group}</div>
            </div>
            <div className="text-center flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={match.awayTeam.logo} alt="" width={40} height={40}
                className="w-10 h-10 object-contain mx-auto mb-1.5"
                onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
              <div className="text-sm font-black text-gray-800 dark:text-gray-200">{match.awayTeam.tla}</div>
              <div className="text-[11px] text-gray-400 leading-tight">{match.awayTeam.name}</div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-black/[0.05] dark:border-white/[0.05] text-xs text-gray-500">
            <span>⏰ {formatKickoff(match.kickoff)}</span>
            <span>🔒 Picks lock at kick-off ({lockTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})</span>
          </div>
        </div>

        {/* Friendly note */}
        {match.isFriendly && (
          <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-xl px-4 py-3">
            <span className="text-lg flex-shrink-0">ℹ️</span>
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              This is a pre-WC warm-up friendly. Lineup data may not be available until closer to kickoff. Player scoring works the same as tournament matches.
            </p>
          </div>
        )}

        {/* Already started warning */}
        {alreadyStarted && (
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-xl px-4 py-3">
            <span className="text-lg flex-shrink-0">⚠️</span>
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              This match has already started. Picks will be locked immediately on room creation.
            </p>
          </div>
        )}

        {/* How it works */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] p-5">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">How it works</div>
          <div className="space-y-3">
            {[
              { step: '1', label: 'Create the room', desc: 'You get a share link and a join code' },
              { step: '2', label: 'Build your squad', desc: 'Pick 11 players (100 cr budget)' },
              { step: '3', label: 'Invite friends', desc: 'Up to 100 managers join with the link or code' },
              { step: '4', label: 'Match kicks off', desc: 'Points update live — highest score wins' },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-pulse-100 dark:bg-pulse-900/30 text-pulse-700 dark:text-pulse-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {s.step}
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">{s.label}</div>
                  <div className="text-[11px] text-gray-400">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Format chips */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Players', value: 'Up to 100' },
            { label: 'Budget', value: '100 cr' },
            { label: 'Squad',  value: '11 players' },
          ].map(f => (
            <div key={f.label} className="bg-white dark:bg-gray-900 rounded-xl border border-black/[0.07] dark:border-white/[0.07] py-3">
              <div className="text-base font-bold text-gray-900 dark:text-gray-100">{f.value}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{f.label}</div>
            </div>
          ))}
        </div>

        {isVeryClose && (
          <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/40 rounded-xl px-4 py-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <p className="text-xs text-green-700 dark:text-green-400 font-medium">
              Lineup just announced — picks lock in under 1 hour!
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={creating}
          className={clsx(
            'w-full flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-semibold transition-all',
            creating
              ? 'bg-pulse-400 text-white cursor-wait'
              : 'bg-pulse-600 hover:bg-pulse-700 text-white'
          )}
        >
          {creating ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white/50 border-t-white animate-spin" />
              Creating room…
            </>
          ) : (
            <>
              Create contest room
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
