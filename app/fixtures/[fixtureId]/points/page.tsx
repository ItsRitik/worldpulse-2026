'use client'

/**
 * /fixtures/[fixtureId]/points - match-specific player points page
 * ══════════════════════════════════════════════════════════════════
 * 1. Every player in the match ranked by fantasy points, high → low
 * 2. Points log - when each scoring event was awarded (minute by minute)
 *
 * Linked from live match cards in the fantasy lobby and from 1v1 rooms.
 * Refreshes every 60 s while the match is live.
 */

import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import clsx from 'clsx'
import type { AFWCFixture } from '@/lib/api/apifootball'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json
}

const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE'])

type ScoringEvent = { type: string; minute: number; points: number; label: string }

type PointsPlayer = {
  api_player_id: number
  name:          string
  position:      string
  points:        number
  team_tla:      string
  team_logo:     string
  photo:         string
  events:        ScoringEvent[]
}

type PointsLogEntry = {
  id:            number
  api_player_id: number
  player_name:   string
  team_tla:      string
  minute:        number
  event_type:    string
  points:        number
  label:         string
}

interface PointsRes {
  matchStatus: string
  elapsed:     number | null
  score?:      string
  players:     PointsPlayer[]
  log?:        PointsLogEntry[] | null
}

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD' }

const EVENT_ICON: Record<string, string> = {
  goal: '⚽', assist: '🅰️', own_goal: '🥅', missed_penalty: '❌',
  yellow_card: '🟨', red_card: '🟥', sub_appearance: '🔁', starting_xi: '✅',
  shot_on_target: '🎯', passes_bonus: '🦶', chance_created: '🔑',
  tackle_won: '🛡', interception: '🛡', save: '🧤', penalty_save: '🧤',
  clean_sheet: '🚫', goals_conceded: '😖',
}

export default function MatchPointsPage() {
  const params    = useParams()
  const fixtureId = params.fixtureId as string

  const { data: points, isLoading } = useSWR<PointsRes>(
    fixtureId ? `/api/wc/player-points/${fixtureId}` : null,
    fetcher,
    {
      refreshInterval: (d) => d && LIVE_STATUSES.has(d.matchStatus) ? 60_000 : 0,
      revalidateOnFocus: true,
      errorRetryCount: 2,
    }
  )

  const { data: matchData } = useSWR<{ fixture: AFWCFixture }>(
    fixtureId ? `/api/wc/match/${fixtureId}` : null,
    fetcher,
    { revalidateOnFocus: false, errorRetryCount: 2 }
  )

  const fixture = matchData?.fixture
  const isLive  = points ? LIVE_STATUSES.has(points.matchStatus) : false
  const players = points?.players ?? []

  // ── Points log ─────────────────────────────────────────────────────────────
  // Preferred: the persisted append-only log (each entry keeps the minute it
  // was assigned, one delta per entry). Fallback: flatten computed events.
  type LogRow = { minute: number; type: string; points: number; label: string; player: { name: string; photo: string } }
  const playerById = new Map(players.map(p => [p.api_player_id, p]))
  const logRows: LogRow[] = points?.log && points.log.length > 0
    ? points.log.map(r => ({
        minute: r.minute,
        type:   r.event_type,
        points: r.points,
        label:  r.label,
        player: {
          name:  r.player_name,
          photo: playerById.get(r.api_player_id)?.photo
            ?? `https://media.api-sports.io/football/players/${r.api_player_id}.png`,
        },
      }))
    : players
        .flatMap(p => p.events.map(ev => ({
          minute: ev.minute, type: ev.type, points: ev.points, label: ev.label,
          player: { name: p.name, photo: p.photo },
        })))
        .sort((a, b) => b.minute - a.minute || b.points - a.points)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-10">
      <div className="max-w-screen-sm mx-auto">

        {/* Back nav */}
        <div className="sticky top-14 z-20 flex items-center gap-2 px-4 h-11 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-black/[0.06] dark:border-white/[0.06]">
          <Link
            href={`/fixtures/${fixtureId}`}
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Match
          </Link>
          <span className="text-gray-300 dark:text-gray-700 text-xs">·</span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Player points</span>
          {isLive && (
            <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {points?.elapsed ? `${points.elapsed}'` : 'LIVE'}
            </span>
          )}
        </div>

        {/* Match header */}
        {fixture && (
          <div className="bg-white dark:bg-gray-900 border-b border-black/[0.06] dark:border-white/[0.06] px-4 py-4">
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fixture.teams.home.logo} alt="" width={24} height={24}
                  className="w-6 h-6 object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fixture.teams.home.name}</span>
              </div>
              <span className={clsx(
                'text-lg font-black tabular-nums px-3 py-1 rounded-xl',
                isLive ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
              )}>
                {points?.score ?? `${fixture.goals.home ?? 0}-${fixture.goals.away ?? 0}`}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fixture.teams.away.name}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fixture.teams.away.logo} alt="" width={24} height={24}
                  className="w-6 h-6 object-contain"
                  onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
              </div>
            </div>
            {isLive && (
              <p className="text-center text-[10px] text-gray-400 mt-2">
                Points update every minute while the match is live
              </p>
            )}
          </div>
        )}

        {/* Loading */}
        {isLoading && !points && (
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-11 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.08 }} />
            ))}
          </div>
        )}

        {/* Pre-kickoff empty state */}
        {points && players.length === 0 && (
          <div className="py-16 text-center px-6">
            <p className="text-3xl mb-3">⚡</p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No player points yet</p>
            <p className="text-xs text-gray-400">Points appear once the match kicks off.</p>
          </div>
        )}

        {/* ── Section 1: Ranked player points ─────────────────────────────── */}
        {players.length > 0 && (
          <div className="bg-white dark:bg-gray-900 sm:rounded-2xl sm:mt-4 border-y sm:border border-black/[0.06] dark:border-white/[0.06] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-black/[0.05] dark:border-white/[0.05] bg-gray-50/60 dark:bg-gray-800/30">
              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Player points · high to low
              </span>
              <span className="ml-auto text-[10px] text-gray-400">{players.length} players</span>
            </div>
            {players.map((p, i) => (
              <div
                key={p.api_player_id}
                className={clsx(
                  'flex items-center gap-3 px-4 py-2.5 border-b border-black/[0.04] dark:border-white/[0.04] last:border-0',
                  i < 3 && 'bg-green-50/40 dark:bg-green-950/10'
                )}
              >
                <span className={clsx(
                  'w-5 text-center text-xs font-bold tabular-nums flex-shrink-0',
                  i === 0 ? 'text-amber-500' : i < 3 ? 'text-green-600 dark:text-green-400' : 'text-gray-300 dark:text-gray-600'
                )}>
                  {i + 1}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.photo} alt="" width={32} height={32} loading="lazy"
                  className="w-8 h-8 rounded-full object-cover bg-gray-100 dark:bg-gray-800 flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate block">{p.name}</span>
                  <span className="text-[10px] text-gray-400">{POS_LABEL[p.position] ?? p.position}</span>
                </div>
                <span className="flex items-center gap-1 flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.team_logo} alt="" width={14} height={14} loading="lazy"
                    className="w-3.5 h-3.5 object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <span className="text-[10px] text-gray-400 font-medium">{p.team_tla}</span>
                </span>
                <span className={clsx(
                  'w-12 text-right text-sm font-bold tabular-nums flex-shrink-0',
                  p.points > 0 ? 'text-gray-900 dark:text-gray-100' : p.points < 0 ? 'text-red-500' : 'text-gray-400'
                )}>
                  {p.points}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Section 2: Points log - one list, time-wise (latest first) ──── */}
        {logRows.length > 0 && (
          <div className="bg-white dark:bg-gray-900 sm:rounded-2xl mt-4 border-y sm:border border-black/[0.06] dark:border-white/[0.06] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-black/[0.05] dark:border-white/[0.05] bg-gray-50/60 dark:bg-gray-800/30">
              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Points log · latest first
              </span>
              {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
              <span className="ml-auto text-[10px] text-gray-400">{logRows.length} entries</span>
            </div>

            {logRows.map((r, i) => (
              <div key={i} className="flex items-center gap-2.5 px-4 py-2 border-b border-black/[0.04] dark:border-white/[0.04] last:border-0">
                <span className="text-sm w-5 text-center flex-shrink-0">{EVENT_ICON[r.type] ?? '•'}</span>
                <span className="text-[10px] text-gray-400 w-8 flex-shrink-0 tabular-nums font-medium">
                  {r.minute}&apos;
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.player.photo} alt="" width={20} height={20} loading="lazy"
                  className="w-5 h-5 rounded-full object-cover bg-gray-100 dark:bg-gray-800 flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{r.player.name}</span>
                <span className="text-[10px] text-gray-400 flex-1 truncate">{r.label}</span>
                <span className={clsx(
                  'text-xs font-bold tabular-nums flex-shrink-0',
                  r.points > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                )}>
                  {r.points > 0 ? '+' : ''}{r.points}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
