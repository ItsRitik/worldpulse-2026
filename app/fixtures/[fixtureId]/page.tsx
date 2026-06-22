'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { format } from 'date-fns'
import clsx from 'clsx'
import type { AFWCFixture, AFLineup, AFLineupPlayer, AFPrediction, AFEvent, AFStandingGroup } from '@/lib/api/apifootball'

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const res  = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json
}

interface MatchData {
  fixture:    AFWCFixture
  lineups:    AFLineup[]
  prediction: AFPrediction | null
  events:     AFEvent[]
}

const LIVE_STATUSES     = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE'])
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function statusLabel(short: string, elapsed: number | null) {
  if (short === 'HT')  return 'Half Time'
  if (LIVE_STATUSES.has(short)) return elapsed ? `${elapsed}'` : 'Live'
  if (short === 'FT')  return 'Full Time'
  if (short === 'AET') return 'After Extra Time'
  if (short === 'PEN') return 'Penalties'
  if (short === 'NS')  return 'Not Started'
  return short
}

function playerLastName(name: string) {
  const parts = name.split(' ')
  return parts.length > 1 ? parts.slice(1).join(' ') : name
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge (inline)
// ─────────────────────────────────────────────────────────────────────────────

function StatusChip({ short, elapsed }: { short: string; elapsed: number | null }) {
  const isLive     = LIVE_STATUSES.has(short)
  const isFinished = FINISHED_STATUSES.has(short)
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold',
      isLive     ? 'bg-green-500 text-white'
      : isFinished ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
      : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
    )}>
      {isLive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" />}
      {statusLabel(short, elapsed)}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Match header
// ─────────────────────────────────────────────────────────────────────────────

function MatchHeader({ data }: { data: MatchData }) {
  const { fixture, teams, goals, score, league } = data.fixture
  const isLive     = LIVE_STATUSES.has(fixture.status.short)
  const isFinished = FINISHED_STATUSES.has(fixture.status.short)
  const showScore  = isLive || isFinished

  // Goal scorers per team - own goals credit the OTHER team, like every scoreboard
  type Scorer = { name: string; minutes: string[]; og: boolean; pen: boolean }
  const scorers: { home: Scorer[]; away: Scorer[] } = { home: [], away: [] }
  if (showScore) {
    for (const e of data.events ?? []) {
      if (e.type !== 'Goal' || e.detail === 'Missed Penalty' || !e.player?.name) continue
      const isOG = e.detail === 'Own Goal'
      // API-Football already credits own-goal events to the benefiting team -
      // e.team IS the goal-scoring team in all cases, no flipping needed.
      const side = e.team.id === teams.home.id ? scorers.home : scorers.away
      const minute = `${e.time.elapsed}${e.time.extra ? `+${e.time.extra}` : ''}'`
      const existing = side.find(sc => sc.name === e.player.name && sc.og === isOG)
      if (existing) existing.minutes.push(minute)
      else side.push({ name: e.player.name, minutes: [minute], og: isOG, pen: e.detail === 'Penalty' })
    }
  }

  const ScorerList = ({ list }: { list: Scorer[] }) => (
    list.length === 0 ? null : (
      <div className="mt-1 space-y-0.5">
        {list.map((sc, i) => (
          <p key={i} className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">
            <span className="mr-0.5">⚽</span>
            {playerLastName(sc.name)} {sc.minutes.join(', ')}
            {sc.pen && <span className="text-amber-500 font-semibold"> (P)</span>}
            {sc.og && <span className="text-red-500 font-semibold"> (OG)</span>}
          </p>
        ))}
      </div>
    )
  )

  const homeWin = teams.home.winner === true
  const awayWin = teams.away.winner === true
  // `goals` is always the live running tally; score.fulltime is {home:null,away:null}
  // while the match is live (truthy object, so ?? never fires). Use goals directly.
  const ft = goals

  return (
    <div className={clsx(
      'px-4 py-6',
      isLive ? 'bg-green-50 dark:bg-green-950/20' : 'bg-white dark:bg-gray-900'
    )}>
      {/* Round */}
      <p className="text-center text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
        {league.round.startsWith('Group Stage')
          ? `Group Stage · Matchday ${league.round.split(' - ')[1]}`
          : league.round}
      </p>

      {/* Teams + Score */}
      <div className="flex items-center justify-between gap-3">
        {/* Home */}
        <Link
          href={`/fixtures/teams/${teams.home.id}`}
          className="flex-1 flex flex-col items-center gap-2 group"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={teams.home.logo} alt={teams.home.name}
            width={56} height={56}
            className="w-14 h-14 object-contain group-hover:scale-105 transition-transform"
            onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2' }}
          />
          <span className={clsx(
            'text-sm text-center leading-tight font-semibold',
            homeWin ? 'text-gray-900 dark:text-gray-100' : isFinished ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'
          )}>
            {teams.home.name}
          </span>
          <ScorerList list={scorers.home} />
        </Link>

        {/* Score / time */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          {showScore ? (
            <div className={clsx(
              'flex items-center gap-3 px-5 py-2 rounded-2xl text-3xl font-black tabular-nums',
              isLive ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            )}>
              <span>{ft.home ?? 0}</span>
              <span className="text-lg font-light opacity-40">-</span>
              <span>{ft.away ?? 0}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                {format(new Date(fixture.date), 'HH:mm')}
              </span>
              <span className="text-xs text-gray-400">
                {format(new Date(fixture.date), 'd MMM yyyy')}
              </span>
            </div>
          )}
          <StatusChip short={fixture.status.short} elapsed={fixture.status.elapsed} />
        </div>

        {/* Away */}
        <Link
          href={`/fixtures/teams/${teams.away.id}`}
          className="flex-1 flex flex-col items-center gap-2 group"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={teams.away.logo} alt={teams.away.name}
            width={56} height={56}
            className="w-14 h-14 object-contain group-hover:scale-105 transition-transform"
            onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2' }}
          />
          <span className={clsx(
            'text-sm text-center leading-tight font-semibold',
            awayWin ? 'text-gray-900 dark:text-gray-100' : isFinished ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'
          )}>
            {teams.away.name}
          </span>
          <ScorerList list={scorers.away} />
        </Link>
      </div>

      {/* Venue + Referee */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
        {fixture.venue.name && (
          <span className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {fixture.venue.name}{fixture.venue.city ? `, ${fixture.venue.city}` : ''}
          </span>
        )}
        {fixture.referee && (
          <span className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            {fixture.referee}
          </span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats tab - Win Probability bar (matches the screenshot design)
// ─────────────────────────────────────────────────────────────────────────────

function H2HSection({ h2h }: { h2h: AFPrediction['h2h'] }) {
  if (!h2h || h2h.length === 0) return null
  return (
    <div className="px-4 pb-5">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
        Head to Head · Last {Math.min(h2h.length, 5)}
      </p>
      <div className="space-y-2">
        {h2h.slice(0, 5).map((m, i) => {
          // H2H are historical finished matches - score.fulltime is reliable here
          const ftScore = m.score?.fulltime
          const ft      = (ftScore?.home != null || ftScore?.away != null) ? ftScore : m.goals
          const homeWin = m.teams.home.winner === true
          const awayWin = m.teams.away.winner === true
          return (
            <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-black/[0.04] dark:border-white/[0.04] last:border-0">
              <span className="text-gray-400 w-10 flex-shrink-0 text-[10px] tabular-nums">{m.fixture.date.slice(0, 4)}</span>
              <span className={clsx('flex-1 text-right truncate', homeWin ? 'font-bold text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400')}>
                {m.teams.home.name}
              </span>
              <span className="font-mono font-bold text-gray-700 dark:text-gray-300 flex-shrink-0 tabular-nums px-2">
                {ft.home ?? 0}-{ft.away ?? 0}
              </span>
              <span className={clsx('flex-1 truncate', awayWin ? 'font-bold text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400')}>
                {m.teams.away.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Group standings table (lazy - only fetches when Stats tab is open)
// ─────────────────────────────────────────────────────────────────────────────

function GroupTableSection({ data }: { data: MatchData }) {
  const { fixture } = data
  const isGroupStage = fixture.league.round.startsWith('Group Stage')

  const { data: sd } = useSWR<{ standings: AFStandingGroup[] }>(
    isGroupStage ? '/api/wc/standings' : null,
    fetcher,
    { dedupingInterval: 120_000 }
  )

  if (!isGroupStage || !sd?.standings) return null

  const homeId = fixture.teams.home.id
  const awayId = fixture.teams.away.id

  // Only the team's real group (A-L) - never the third-place ranking table
  const group = sd.standings.find(g =>
    /^Group [A-Z]$/.test(g.group) &&
    g.table.some(r => r.team.id === homeId || r.team.id === awayId)
  )
  if (!group) return null

  return (
    <div className="px-4 pt-2 pb-5">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
        {group.group}
      </p>
      <div className="overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.06]">
        {/* Header row */}
        <div className="grid grid-cols-[20px_1fr_28px_28px_28px_28px_32px] bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5">
          {['#', 'Team', 'P', 'W', 'D', 'L', 'Pts'].map((h, i) => (
            <span key={h} className={clsx('text-[10px] font-bold text-gray-400', i === 0 ? '' : i === 1 ? '' : 'text-center')}>{h}</span>
          ))}
        </div>
        {group.table.map(row => {
          const isTeam = row.team.id === homeId || row.team.id === awayId
          return (
            <div
              key={row.team.id}
              className={clsx(
                'grid grid-cols-[20px_1fr_28px_28px_28px_28px_32px] px-3 py-2 border-t border-black/[0.04] dark:border-white/[0.04]',
                isTeam ? 'bg-green-50/70 dark:bg-green-950/25' : ''
              )}
            >
              <span className={clsx('text-xs tabular-nums', isTeam ? 'font-bold text-green-700 dark:text-green-400' : 'text-gray-400')}>
                {row.rank}
              </span>
              <div className="flex items-center gap-1.5 min-w-0 pr-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.team.logo} alt="" width={14} height={14}
                  className="w-3.5 h-3.5 object-contain flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
                <span className={clsx('text-xs truncate', isTeam ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400')}>
                  {row.team.name}
                </span>
              </div>
              {[row.all.played, row.all.win, row.all.draw, row.all.lose].map((v, i) => (
                <span key={i} className="text-xs text-gray-500 dark:text-gray-400 text-center tabular-nums">{v}</span>
              ))}
              <span className={clsx('text-xs font-bold tabular-nums text-right', isTeam ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300')}>
                {row.points}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Match statistics - head-to-head bars (live & finished matches)
// Reads from data.fixture.statistics which API-Football includes in /fixtures?id=X
// ─────────────────────────────────────────────────────────────────────────────

/** Stats to show and in what order. Keys match API-Football "type" strings. */
const STAT_CONFIG: { key: string; label: string; icon: string; pct?: true }[] = [
  { key: 'Ball Possession',   label: 'Possession',      icon: '⚽', pct: true },
  { key: 'Shots on Goal',     label: 'Shots on Target', icon: '🎯' },
  { key: 'Total Shots',       label: 'Total Shots',     icon: '💥' },
  { key: 'Passes %',          label: 'Pass Accuracy',   icon: '🔄', pct: true },
  { key: 'Total passes',      label: 'Passes',          icon: '📐' },
  { key: 'Corner Kicks',      label: 'Corners',         icon: '🚩' },
  { key: 'Fouls',             label: 'Fouls',           icon: '⚠️' },
  { key: 'Goalkeeper Saves',  label: 'GK Saves',        icon: '🧤' },
  { key: 'Offsides',          label: 'Offsides',        icon: '🚫' },
  { key: 'Yellow Cards',      label: 'Yellow Cards',    icon: '🟨' },
  { key: 'Red Cards',         label: 'Red Cards',       icon: '🟥' },
]

function parseStatValue(v: number | string | null): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  // "60%" → 60
  return parseInt(String(v).replace('%', ''), 10) || 0
}

function MatchStatsSection({ fixture, homeName, awayName }: {
  fixture:  MatchData['fixture']
  homeName: string
  awayName: string
}) {
  const stats = fixture.statistics
  if (!stats || stats.length < 2) return null

  const homeId   = fixture.teams.home.id
  const homeStat = stats.find(s => s.team.id === homeId)
  const awayStat = stats.find(s => s.team.id !== homeId)
  if (!homeStat || !awayStat) return null

  // Build a quick lookup: type → value
  const homeMap = Object.fromEntries(homeStat.statistics.map(s => [s.type, s.value]))
  const awayMap = Object.fromEntries(awayStat.statistics.map(s => [s.type, s.value]))

  // Only render rows where at least one team has a non-null, non-zero value
  const rows = STAT_CONFIG.flatMap(cfg => {
    const hv = parseStatValue(homeMap[cfg.key])
    const av = parseStatValue(awayMap[cfg.key])
    if (hv === 0 && av === 0) return []
    return [{ ...cfg, hv, av }]
  })

  if (rows.length === 0) return null

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-1 pb-2 border-b border-black/[0.05] dark:border-white/[0.05]">
        <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{homeName}</span>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Match stats</span>
        <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate text-right">{awayName}</span>
      </div>

      <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
        {rows.map(({ key, label, icon, pct, hv, av }) => {
          const homeDisplay = pct ? `${hv}%` : String(hv)
          const awayDisplay = pct ? `${av}%` : String(av)
          const homeLeads   = hv > av
          const awayLeads   = av > hv

          return (
            <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2">
              <span className={clsx(
                'justify-self-start min-w-[40px] text-center text-sm font-bold tabular-nums px-2 py-0.5 rounded-lg',
                homeLeads
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'text-gray-500 dark:text-gray-400'
              )}>
                {homeDisplay}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 text-center">
                {label}
              </span>
              <span className={clsx(
                'justify-self-end min-w-[40px] text-center text-sm font-bold tabular-nums px-2 py-0.5 rounded-lg',
                awayLeads
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'text-gray-500 dark:text-gray-400'
              )}>
                {awayDisplay}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatsTab({ data }: { data: MatchData }) {
  const { prediction, fixture } = data
  const homeName = fixture.teams.home.name
  const awayName = fixture.teams.away.name
  const hasMatchStats = !!(fixture.statistics && fixture.statistics.length >= 2)

  return (
    <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">

      {/* ── Live/post-match stats - the "main thing in between" ── */}
      {hasMatchStats && (
        <MatchStatsSection fixture={fixture} homeName={homeName} awayName={awayName} />
      )}

      {/* ── Head-to-head history (real past results) ── */}
      {prediction?.h2h && prediction.h2h.length > 0 && (
        <H2HSection h2h={prediction.h2h} />
      )}

      {/* ── Empty state - nothing to show before kickoff ── */}
      {!hasMatchStats && (!prediction?.h2h || prediction.h2h.length === 0) && (
        <div className="py-10 text-center px-4">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Stats not available yet</p>
          <p className="text-xs text-gray-400 mt-1">Match stats appear once the game kicks off</p>
        </div>
      )}

      <GroupTableSection data={data} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Substitutes list - below the pitch, not on it
// ─────────────────────────────────────────────────────────────────────────────

function SubRow({ p, onMin, forName, badges }: {
  p: AFLineupPlayer
  onMin:   number | null
  forName: string | null
  badges?: TokenBadges
}) {
  return (
    <div className={clsx('flex items-center gap-2 py-1.5', onMin == null && 'opacity-60')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://media.api-sports.io/football/players/${p.player.id}.png`}
        alt="" width={24} height={24} loading="lazy"
        className="w-6 h-6 rounded-full object-cover bg-gray-100 dark:bg-gray-800 flex-shrink-0"
        onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
      />
      <span className="text-[10px] text-gray-400 w-5 tabular-nums flex-shrink-0">{p.player.number ?? '-'}</span>
      <div className="min-w-0 flex-1">
        <span className="text-xs text-gray-700 dark:text-gray-300 truncate block">{p.player.name}</span>
        {forName && (
          <span className="text-[9px] text-gray-400 truncate block">for {forName}</span>
        )}
      </div>

      {/* Match events after coming on - goals, cards, subbed off again */}
      {badges && (
        <span className="flex items-center gap-1 flex-shrink-0">
          {(badges.goals > 0 || badges.ownGoals > 0) && (
            <span className="flex items-center text-[10px]">
              ⚽
              {badges.goals + badges.ownGoals > 1 && (
                <span className="text-[8px] font-black text-gray-700 dark:text-gray-300">×{badges.goals + badges.ownGoals}</span>
              )}
              {badges.ownGoals > 0 && badges.goals === 0 && (
                <span className="text-[7px] font-black text-red-600">OG</span>
              )}
            </span>
          )}
          {(badges.yellow || badges.red) && (
            <span className={clsx(
              'w-2 h-3 rounded-[2px] border border-black/10 dark:border-white/20',
              badges.red ? 'bg-red-500' : 'bg-yellow-400'
            )} />
          )}
          {badges.offMin != null && (
            <span className="flex items-center text-[10px] font-bold text-red-500 tabular-nums">
              ↓{badges.offMin}&apos;
            </span>
          )}
        </span>
      )}

      {onMin != null ? (
        <span className="flex items-center gap-0.5 text-[10px] font-bold text-green-600 dark:text-green-400 tabular-nums flex-shrink-0">
          <span>↑</span>{onMin}&apos;
        </span>
      ) : (
        <span className="text-[9px] text-gray-400 flex-shrink-0">{p.player.pos ?? ''}</span>
      )}
    </div>
  )
}

function SubsList({ home, away, events, badges }: { home: AFLineup; away: AFLineup; events: AFEvent[]; badges: Map<number, TokenBadges> }) {
  if ((home.substitutes?.length ?? 0) === 0 && (away.substitutes?.length ?? 0) === 0) return null

  // Substitution timeline: playerId → { minute on, who they replaced }
  const subbedOn = new Map<number, { min: number; forName: string }>()
  for (const e of events) {
    if (e.type === 'subst' && e.assist?.id) {
      subbedOn.set(e.assist.id, { min: e.time.elapsed, forName: e.player.name })
    }
  }

  // Players who came on first (by minute), then the unused bench
  const ordered = (team: AFLineup) =>
    [...team.substitutes].sort((a, b) => {
      const am = subbedOn.get(a.player.id)?.min ?? Infinity
      const bm = subbedOn.get(b.player.id)?.min ?? Infinity
      return am - bm
    })

  const anySubsMade = subbedOn.size > 0

  return (
    <div className="mx-4 mb-4 bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] overflow-hidden">
      <div className="flex items-center px-4 py-2.5 border-b border-black/[0.05] dark:border-white/[0.05] bg-gray-50/60 dark:bg-gray-800/30">
        <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Substitutes</span>
        {anySubsMade && (
          <span className="ml-auto text-[9px] text-gray-400">↑ entered · ordered by time</span>
        )}
      </div>
      <div className="grid grid-cols-2 divide-x divide-black/[0.05] dark:divide-white/[0.05]">
        {[home, away].map(team => (
          <div key={team.team.id} className="px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={team.team.logo} alt="" width={14} height={14}
                className="w-3.5 h-3.5 object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 truncate">{team.team.name}</span>
            </div>
            {ordered(team).map(p => (
              <SubRow
                key={p.player.id}
                p={p}
                onMin={subbedOn.get(p.player.id)?.min ?? null}
                forName={subbedOn.get(p.player.id)?.forName ?? null}
                badges={badges.get(p.player.id)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lineups tab - formation pitch + bench
// ─────────────────────────────────────────────────────────────────────────────

/** Per-player match events shown as badges on the pitch token */
type TokenBadges = {
  goals:    number
  ownGoals: number
  yellow:   boolean
  red:      boolean
  offMin:   number | null   // minute substituted off
}

function PlayerToken({
  player, badges,
}: { player: AFLineupPlayer['player']; badges?: TokenBadges }) {
  const [imgErr, setImgErr] = useState(false)

  // Photo URL is always predictable from player ID - don't rely on the field being returned
  const photoUrl = `https://media.api-sports.io/football/players/${player.id}.png`

  return (
    <div className="flex flex-col items-center gap-0.5 w-14">
      <div className="relative">
        <div className="w-11 h-11 rounded-full flex-shrink-0 overflow-hidden border-2 flex items-center justify-center font-bold text-xs bg-white/20 border-white/30 text-white">
          {!imgErr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={player.name}
              width={44}
              height={44}
              className="w-full h-full object-cover"
              onError={() => setImgErr(true)}
            />
          ) : (
            <span className="text-xs">{player.number ?? '?'}</span>
          )}
        </div>

        {/* ── Event badges ── */}
        {badges && (badges.goals > 0 || badges.ownGoals > 0) && (
          <span className="absolute -bottom-0.5 -left-1.5 flex items-center bg-white rounded-full px-0.5 h-4 shadow-sm">
            <span className="text-[9px] leading-none">⚽</span>
            {badges.goals + badges.ownGoals > 1 && (
              <span className="text-[8px] font-black text-gray-800 pr-0.5">×{badges.goals + badges.ownGoals}</span>
            )}
            {badges.ownGoals > 0 && badges.goals === 0 && (
              <span className="text-[7px] font-black text-red-600 pr-0.5">OG</span>
            )}
          </span>
        )}
        {badges && (badges.yellow || badges.red) && (
          <span className={clsx(
            'absolute -top-0.5 -left-1 w-2.5 h-3.5 rounded-[2px] border border-white/60 shadow-sm',
            badges.red ? 'bg-red-500' : 'bg-yellow-400'
          )} />
        )}
        {badges?.offMin != null && (
          <span className="absolute -top-1 -right-1.5 flex items-center gap-px bg-white rounded-full px-1 h-4 shadow-sm">
            <span className="text-[9px] font-black text-red-500 leading-none">↓</span>
            <span className="text-[8px] font-bold text-gray-700 tabular-nums leading-none">{badges.offMin}&apos;</span>
          </span>
        )}
      </div>

      <span className="text-center leading-tight font-medium drop-shadow-sm max-w-full truncate text-[10px] text-white">
        {playerLastName(player.name)}
      </span>
    </div>
  )
}

function FormationGrid({ lineup, flip, badges }: { lineup: AFLineup; flip: boolean; badges: Map<number, TokenBadges> }) {
  // Group startXI by grid row
  const rows: Record<number, AFLineupPlayer[]> = {}
  for (const p of lineup.startXI) {
    const row = parseInt((p.player.grid ?? '1:1').split(':')[0], 10) || 1
    if (!rows[row]) rows[row] = []
    rows[row].push(p)
  }

  // Sort within each row by column
  const sortedRows = Object.entries(rows)
    .map(([r, players]) => ({
      row: Number(r),
      players: [...players].sort((a, b) => {
        const ca = parseInt((a.player.grid ?? '1:1').split(':')[1] ?? '1', 10)
        const cb = parseInt((b.player.grid ?? '1:1').split(':')[1] ?? '1', 10)
        return ca - cb
      }),
    }))
    .sort((a, b) => flip ? b.row - a.row : a.row - b.row)

  return (
    <div className="py-2 flex flex-col gap-4">
      {sortedRows.map(({ row, players }) => (
        <div key={row} className="flex justify-evenly items-start w-full">
          {players.map(p => <PlayerToken key={p.player.id} player={p.player} badges={badges.get(p.player.id)} />)}
        </div>
      ))}
    </div>
  )
}

function TeamLineup({ lineup, isHome, badges }: { lineup: AFLineup; isHome: boolean; badges: Map<number, TokenBadges> }) {
  const header = (
    <Link
      href={`/fixtures/teams/${lineup.team.id}`}
      className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 transition-colors rounded-lg"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={lineup.team.logo} alt="" width={24} height={24} className="w-6 h-6 object-contain flex-shrink-0"
        onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
      <span className="text-sm font-bold text-white leading-tight">{lineup.team.name}</span>
      <span className="ml-auto text-xs text-white/60 bg-white/10 px-2 py-0.5 rounded-full flex-shrink-0">
        {lineup.formation}
      </span>
    </Link>
  )

  // Name sits at the team's own end of the pitch: away on top, home at the bottom
  return (
    <div className="flex-1">
      {!isHome && header}
      <FormationGrid lineup={lineup} flip={isHome} badges={badges} />
      {isHome && header}
    </div>
  )
}

function LineupsTab({ data }: { data: MatchData }) {
  const { lineups, fixture, events } = data

  // Per-player event badges (goals, cards, subbed-off) for the pitch tokens
  const badges = new Map<number, TokenBadges>()
  const badge = (id: number): TokenBadges => {
    if (!badges.has(id)) badges.set(id, { goals: 0, ownGoals: 0, yellow: false, red: false, offMin: null })
    return badges.get(id)!
  }
  for (const e of events ?? []) {
    if (!e.player?.id) continue
    if (e.type === 'Goal' && e.detail !== 'Missed Penalty') {
      if (e.detail === 'Own Goal') badge(e.player.id).ownGoals++
      else                         badge(e.player.id).goals++
    } else if (e.type === 'Card') {
      if (e.detail === 'Yellow Card') badge(e.player.id).yellow = true
      else                            badge(e.player.id).red = true
    } else if (e.type === 'subst') {
      badge(e.player.id).offMin = e.time.elapsed
    }
  }
  const isFinished = FINISHED_STATUSES.has(fixture.fixture.status.short)
  const isLive     = LIVE_STATUSES.has(fixture.fixture.status.short)
  const hasLineups = lineups.length >= 2 && (lineups[0]?.startXI?.length ?? 0) > 0

  if (!hasLineups) {
    return (
      <div>
        <div className="py-8 text-center px-6">
          <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            {isFinished ? 'Lineup data unavailable' : isLive ? 'Lineup not yet available' : 'Lineups not announced yet'}
          </p>
          <p className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
            {isLive || isFinished
              ? 'Lineup details could not be retrieved - match events are shown above'
              : 'Teams usually announce their starting XI around 1 hour before kickoff'}
          </p>
        </div>
      </div>
    )
  }

  const home = lineups.find(l => l.team.id === data.fixture.teams.home.id) ?? lineups[0]
  const away = lineups.find(l => l.team.id === data.fixture.teams.away.id) ?? lineups[1]

  return (
    <div>
      {/* Pitch card */}
      <div
        className="relative mx-4 my-4 rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #2d6a4f 0%, #1b4332 100%)' }}
      >
        {/* Pitch markings - penalty boxes only; halfway line is in-flow below */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/4 right-1/4 bottom-0 h-12 border-t border-x border-white/20 rounded-t-sm" />
          <div className="absolute left-1/4 right-1/4 top-0 h-12 border-b border-x border-white/20 rounded-b-sm" />
        </div>

        {/* Teams + formations */}
        <div className="relative z-10 flex flex-col px-2 py-3">
          {/* Away - attacking downward */}
          <div className="pb-3">
            <TeamLineup lineup={away} isHome={false} badges={badges} />
          </div>

          {/* Halfway line + centre circle - always exactly between the teams */}
          <div className="relative h-12 my-1 flex-shrink-0 pointer-events-none">
            <div className="absolute left-2 right-2 top-1/2 h-px bg-white/25" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/25" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/40" />
          </div>

          {/* Home - attacking upward */}
          <div className="pt-3">
            <TeamLineup lineup={home} isHome={true} badges={badges} />
          </div>
        </div>

      </div>

      {/* Substitutes - list below the pitch, ordered by entry time */}
      <SubsList home={home} away={away} events={events ?? []} badges={badges} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// News tab - filters /api/news by both team name keywords
// ─────────────────────────────────────────────────────────────────────────────

interface NewsItem {
  id:          string
  title:       string
  link:        string
  description: string
  source:      string
  icon:        string
  pubDate:     string
  isHot:       boolean
  category?:   string
}

function NewsTab({ homeName, awayName }: { homeName: string; awayName: string }) {
  const { data, isLoading } = useSWR<{ items: NewsItem[] }>(
    '/api/news',
    fetcher,
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )

  // Keywords: the full team name as a phrase, plus distinctive single words.
  // Generic geo words ("republic", "south", "united"…) are excluded so
  // "Czech Republic" doesn't match every article containing "republic".
  const GENERIC = new Set([
    'republic', 'united', 'south', 'north', 'new', 'the', 'and', 'of',
    'states', 'islands', 'island', 'arab', 'emirates', 'saint', 'côte',
  ])
  const phrases = [homeName.toLowerCase(), awayName.toLowerCase()]
  const words = [...homeName.split(/[\s&]+/), ...awayName.split(/[\s&]+/)]
    .map(w => w.toLowerCase())
    .filter(w => w.length > 3 && !GENERIC.has(w))

  const articles = (data?.items ?? []).filter(item => {
    const text = (item.title + ' ' + item.description).toLowerCase()
    if (phrases.some(ph => text.includes(ph))) return true
    return words.some(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text))
  })

  if (isLoading) {
    return (
      <div className="space-y-3 px-4 py-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="py-16 text-center px-6">
        <p className="text-3xl mb-3">📰</p>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">No articles found</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          No recent news about {homeName} or {awayName}
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
      {articles.map(item => {
        const ageMin = Math.floor((Date.now() - new Date(item.pubDate).getTime()) / 60_000)
        const ageStr = ageMin < 60
          ? `${ageMin}m ago`
          : ageMin < 1440
          ? `${Math.floor(ageMin / 60)}h ago`
          : `${Math.floor(ageMin / 1440)}d ago`

        return (
          <a
            key={item.id}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors active:bg-gray-100 dark:active:bg-gray-800"
          >
            <div className="flex-1 min-w-0">
              {/* Source + time row */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base leading-none">{item.icon}</span>
                <span className="text-[10px] font-semibold text-gray-400 truncate">{item.source}</span>
                <span className="text-[10px] text-gray-300 dark:text-gray-600 flex-shrink-0">·</span>
                <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">{ageStr}</span>
                {item.isHot && (
                  <span className="text-[9px] bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">
                    LIVE
                  </span>
                )}
              </div>
              {/* Headline */}
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug line-clamp-2">
                {item.title}
              </p>
              {/* Snippet */}
              {item.description && (
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>
            {/* External link icon */}
            <div className="flex-shrink-0 mt-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-300 dark:text-gray-600">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </div>
          </a>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page skeleton
// ─────────────────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-screen-md mx-auto">
        <div className="h-14 bg-white dark:bg-gray-900 border-b border-black/[0.06] dark:border-white/[0.06]" />
        <div className="p-4 space-y-4">
          <div className="h-40 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
          <div className="h-12 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
          <div className="h-64 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'lineups' | 'stats' | 'news'

export default function MatchDetailPage() {
  const params     = useParams()
  const router     = useRouter()
  const fixtureId  = params.fixtureId as string
  const [tab, setTab] = useState<Tab>('lineups')

  const { data, error, isLoading } = useSWR<MatchData>(
    fixtureId ? `/api/wc/match/${fixtureId}` : null,
    fetcher,
    {
      refreshInterval: (d) => {
        if (!d) return 0
        return LIVE_STATUSES.has(d.fixture.fixture.status.short) ? 15_000 : 0
      },
      revalidateOnFocus: true,
      errorRetryCount:   3,
    }
  )

  // Auto-switch to Stats when match is live but lineups aren't available
  useEffect(() => {
    if (!data) return
    const live = LIVE_STATUSES.has(data.fixture.fixture.status.short)
    const hasL = data.lineups.length >= 2 && (data.lineups[0]?.startXI?.length ?? 0) > 0
    if (live && !hasL && tab === 'lineups') setTab('stats')
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <PageSkeleton />

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Could not load match</p>
          <p className="text-xs text-gray-400 mb-4">{error?.message ?? 'Unknown error'}</p>
          <button
            onClick={() => router.back()}
            className="text-xs text-green-700 dark:text-green-400 underline"
          >
            ← Back to fixtures
          </button>
        </div>
      </div>
    )
  }

  const hasLineups  = data.lineups.length >= 2 && (data.lineups[0]?.startXI?.length ?? 0) > 0
  const isLiveMatch = LIVE_STATUSES.has(data.fixture.fixture.status.short)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-screen-md mx-auto">

        {/* Back nav */}
        <div className="sticky top-0 z-20 flex items-center gap-2 px-4 h-12 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-black/[0.06] dark:border-white/[0.06]">
          <Link
            href="/fixtures"
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Fixtures
          </Link>
          <span className="text-gray-300 dark:text-gray-700 text-xs">·</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {data.fixture.teams.home.name} vs {data.fixture.teams.away.name}
          </span>
        </div>

        {/* Match header */}
        <MatchHeader data={data} />

        {/* Player points link */}
        {(isLiveMatch || FINISHED_STATUSES.has(data.fixture.fixture.status.short)) && (
          <Link
            href={`/fixtures/${fixtureId}/points`}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-50 dark:bg-green-900/20 border-b border-green-100 dark:border-green-900/40 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          >
            {isLiveMatch && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />}
            <span className="text-xs font-semibold text-green-700 dark:text-green-400">
              Fantasy player points &amp; log
            </span>
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
              View all
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </span>
          </Link>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-gray-900">
          {(['lineups', 'stats', 'news'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'flex-1 py-3 text-sm font-medium transition-colors border-b-2 active:bg-gray-50 dark:active:bg-gray-800/40',
                tab === t
                  ? 'border-green-500 text-green-700 dark:text-green-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400'
              )}
            >
              {t === 'lineups' ? (
                <span className="flex items-center justify-center gap-1.5">
                  Line-ups
                  {!hasLineups && (
                    <span className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">TBA</span>
                  )}
                </span>
              ) : t === 'stats' ? 'Stats' : 'News'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-white dark:bg-gray-900 sm:rounded-b-2xl overflow-hidden min-h-[50vh]">
          {tab === 'lineups' ? (
            <LineupsTab data={data} />
          ) : tab === 'stats' ? (
            <StatsTab data={data} />
          ) : (
            <NewsTab
              homeName={data.fixture.teams.home.name}
              awayName={data.fixture.teams.away.name}
            />
          )}
        </div>

      </div>
    </div>
  )
}
