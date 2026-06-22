'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { THIRD_PLACE_GROUP, type AFWCFixture, type AFStandingGroup } from '@/lib/api/apifootball'
import { localDateKey, todayKey } from '@/lib/time'
import { LiveTopPoints } from '@/components/shared/LiveTopPoints'
import { format, isToday, isTomorrow, isYesterday } from 'date-fns'
import clsx from 'clsx'

// ─────────────────────────────────────────────────────────────────────────────
// Fetcher + hooks
// ─────────────────────────────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const res  = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json
}

interface FixturesResponse {
  fixtures:      AFWCFixture[]
  rounds:        string[]
  liveCount:     number
  finishedCount: number
  todayCount:    number
  total:         number
  timestamp:     string
}

interface StandingsResponse {
  standings: AFStandingGroup[]
}

function useWCFixtures() {
  const { data, error, isLoading, mutate } = useSWR<FixturesResponse>(
    '/api/wc/fixtures', fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true, errorRetryCount: 3 }
  )
  return { data, error, isLoading, refresh: mutate }
}

function useWCStandings() {
  const { data, isLoading } = useSWR<StandingsResponse>(
    '/api/wc/standings', fetcher,
    { refreshInterval: 120_000, errorRetryCount: 3 }
  )
  return { standings: data?.standings ?? [], isLoading }
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants + utils
// ─────────────────────────────────────────────────────────────────────────────

const LIVE_STATUSES     = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE'])
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])

function formatMatchTime(iso: string) {
  try { return format(new Date(iso), 'HH:mm') } catch { return '--:--' }
}

function formatDateHeading(dateKey: string) {
  const d = new Date(dateKey + 'T00:00:00')
  if (isToday(d))     return 'Today'
  if (isTomorrow(d))  return 'Tomorrow'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEEE, d MMMM')
}

function teamShort(name: string) {
  const map: Record<string, string> = {
    'United States': 'USA', 'United Arab Emirates': 'UAE',
    'Korea Republic': 'Korea', 'Saudi Arabia': 'KSA',
    'Costa Rica': 'C.Rica', 'New Zealand': 'NZ',
    'South Africa': 'S.Africa', 'Trinidad and Tobago': 'T&T',
    'Dominican Republic': 'D.Rep', 'Central African Republic': 'CAR',
    'Bosnia and Herzegovina': 'Bosnia',
  }
  return map[name] ?? (name.length > 14 ? name.slice(0, 13) + '…' : name)
}

function roundLabel(r: string) {
  const gs = r.match(/^Group Stage - (\d+)$/)
  return gs ? `Group Stage · MD${gs[1]}` : r
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status, elapsed }: { status: string; elapsed: number | null }) {
  if (LIVE_STATUSES.has(status)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500 text-white tabular-nums whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0" />
        {status === 'HT' ? 'HT' : elapsed ? `${elapsed}'` : 'LIVE'}
      </span>
    )
  }
  if (FINISHED_STATUSES.has(status)) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {status}
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 dark:bg-gray-800/60 text-gray-400 tabular-nums whitespace-nowrap">
      {status}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture card - taps through to match detail page
// ─────────────────────────────────────────────────────────────────────────────

function FixtureCard({ fixture: f }: { fixture: AFWCFixture }) {
  const { fixture, teams, goals, league, score } = f
  const isLive     = LIVE_STATUSES.has(fixture.status.short)
  const isFinished = FINISHED_STATUSES.has(fixture.status.short)
  const showScore  = isLive || isFinished
  const homeWin    = teams.home.winner === true
  const awayWin    = teams.away.winner === true
  // `goals` = live running tally (always current); score.fulltime is null until FT
  // score?.fulltime object itself is {home:null,away:null} for live matches - truthy, so ?? never fires
  // Fix: use goals directly - it equals fulltime once the match is over anyway
  const ft         = goals

  return (
    <Link
      href={`/fixtures/${fixture.id}`}
      className={clsx(
        'block px-4 py-3.5 border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 transition-colors active:bg-gray-50 dark:active:bg-gray-800/30',
        isLive && 'bg-green-50/40 dark:bg-green-950/15',
      )}
    >
      {/* Round label - every match */}
      <div className="mb-2 flex items-center justify-between">
        <span className={clsx(
          'text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full',
          league.round.startsWith('Group Stage')
            ? 'text-gray-400 bg-gray-50 dark:bg-gray-800/60'
            : 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
        )}>
          {roundLabel(league.round)}
        </span>
        <StatusBadge status={fixture.status.short} elapsed={fixture.status.elapsed} />
      </div>

      <div className="flex items-center gap-3">
        {/* Home */}
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className={clsx(
            'text-sm leading-tight text-right min-w-0',
            showScore && homeWin  ? 'font-bold text-gray-900 dark:text-gray-100'
            : showScore && awayWin ? 'text-gray-400 dark:text-gray-500'
            : 'font-medium text-gray-700 dark:text-gray-300'
          )}>
            {teamShort(teams.home.name)}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={teams.home.logo} alt="" width={32} height={32}
            className="w-8 h-8 object-contain flex-shrink-0" loading="lazy"
            onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
        </div>

        {/* Score / local kickoff time */}
        <div className="w-[72px] flex flex-col items-center flex-shrink-0">
          {showScore ? (
            <div className={clsx(
              'flex items-center gap-2 px-3 py-1 rounded-lg text-base font-bold tabular-nums',
              isLive ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
            )}>
              <span>{ft.home ?? 0}</span>
              <span className="text-sm font-normal opacity-50">-</span>
              <span>{ft.away ?? 0}</span>
            </div>
          ) : (
            <>
              <span className="text-base font-bold text-gray-700 dark:text-gray-300 tabular-nums">
                {formatMatchTime(fixture.date)}
              </span>
              <span className="text-[9px] text-gray-400 uppercase tracking-wide">your time</span>
            </>
          )}
        </div>

        {/* Away */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={teams.away.logo} alt="" width={32} height={32}
            className="w-8 h-8 object-contain flex-shrink-0" loading="lazy"
            onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
          <span className={clsx(
            'text-sm leading-tight min-w-0',
            showScore && awayWin  ? 'font-bold text-gray-900 dark:text-gray-100'
            : showScore && homeWin ? 'text-gray-400 dark:text-gray-500'
            : 'font-medium text-gray-700 dark:text-gray-300'
          )}>
            {teamShort(teams.away.name)}
          </span>
        </div>

        {/* Nav arrow */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className="flex-shrink-0 text-gray-300 dark:text-gray-600">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>

      {/* Live player points - top 3, updates every minute */}
      {isLive && <LiveTopPoints fixtureId={fixture.id} asLink={false} />}

      {/* Venue + referee */}
      {(fixture.venue.name || fixture.referee) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0 text-[10px] text-gray-400">
          {fixture.venue.name && (
            <span className="flex items-center gap-1 min-w-0">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <span className="truncate">{fixture.venue.name}{fixture.venue.city ? `, ${fixture.venue.city}` : ''}</span>
            </span>
          )}
          {fixture.referee && (
            <span className="flex items-center gap-1 min-w-0">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <span className="truncate">{fixture.referee}</span>
            </span>
          )}
        </div>
      )}
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures tab
// ─────────────────────────────────────────────────────────────────────────────

type FixtureFilter = 'all' | 'live' | 'today' | 'upcoming' | 'finished'

function FixturesTab({ data, isLoading }: { data: FixturesResponse | undefined; isLoading: boolean }) {
  const [filter, setFilter] = useState<FixtureFilter>('all')
  const [roundFilter, setRound] = useState('all')
  const [showEarlier, setShowEarlier] = useState(false)

  const filtered = useMemo(() => {
    if (!data) return []
    let list = data.fixtures
    if (filter === 'live')     list = list.filter(f => LIVE_STATUSES.has(f.fixture.status.short))
    if (filter === 'today')    list = list.filter(f => localDateKey(f.fixture.date) === todayKey())
    if (filter === 'upcoming') list = list.filter(f => !LIVE_STATUSES.has(f.fixture.status.short) && !FINISHED_STATUSES.has(f.fixture.status.short))
    if (filter === 'finished') list = list.filter(f => FINISHED_STATUSES.has(f.fixture.status.short))
    if (roundFilter !== 'all') list = list.filter(f => f.league.round === roundFilter)
    return list
  }, [data, filter, roundFilter])

  const byDate = useMemo(() => {
    const map: Record<string, AFWCFixture[]> = {}
    for (const f of filtered) {
      const key = localDateKey(f.fixture.date)   // viewer's local date
      if (!map[key]) map[key] = []
      map[key].push(f)
    }
    // Results read newest-first; everything else chronological
    return Object.entries(map).sort(([a], [b]) =>
      filter === 'finished' ? b.localeCompare(a) : a.localeCompare(b)
    )
  }, [filtered, filter])

  // ── "All" view sections: live → just finished → upcoming → earlier results ──
  const sections = useMemo(() => {
    const tKey = todayKey()
    const groupBy = (list: AFWCFixture[], desc = false) => {
      const map: Record<string, AFWCFixture[]> = {}
      for (const f of list) {
        const key = localDateKey(f.fixture.date)
        if (!map[key]) map[key] = []
        map[key].push(f)
      }
      return Object.entries(map).sort(([a], [b]) => desc ? b.localeCompare(a) : a.localeCompare(b))
    }

    const live = filtered
      .filter(f => LIVE_STATUSES.has(f.fixture.status.short))
      .sort((a, b) => (b.fixture.status.elapsed ?? 0) - (a.fixture.status.elapsed ?? 0))

    const finished = filtered.filter(f => FINISHED_STATUSES.has(f.fixture.status.short))
    const finishedToday = finished
      .filter(f => localDateKey(f.fixture.date) === tKey)
      .sort((a, b) => +new Date(b.fixture.date) - +new Date(a.fixture.date))
    const earlier = finished
      .filter(f => localDateKey(f.fixture.date) !== tKey)
      .sort((a, b) => +new Date(b.fixture.date) - +new Date(a.fixture.date))

    const upcoming = filtered
      .filter(f => !LIVE_STATUSES.has(f.fixture.status.short) && !FINISHED_STATUSES.has(f.fixture.status.short))
      .sort((a, b) => +new Date(a.fixture.date) - +new Date(b.fixture.date))

    return {
      live,
      finishedToday,
      upcomingByDate: groupBy(upcoming),
      earlierByDate:  groupBy(earlier, true),
      earlierCount:   earlier.length,
    }
  }, [filtered])

  // "Today" count in the viewer's local timezone (server count is UTC-based)
  const localTodayCount = useMemo(
    () => (data?.fixtures ?? []).filter(f => localDateKey(f.fixture.date) === todayKey()).length,
    [data]
  )

  if (isLoading && !data) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    )
  }

  const filters: { id: FixtureFilter; label: string; count?: number }[] = [
    { id: 'all',      label: 'All',       count: data?.total },
    { id: 'live',     label: '🔴 Live',   count: data?.liveCount },
    { id: 'today',    label: 'Today',     count: localTodayCount },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'finished', label: 'Results',   count: data?.finishedCount },
  ]

  return (
    <div>
      {/* Filter pills */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-black/[0.05] dark:border-white/[0.05]" style={{ scrollbarWidth: 'none' }}>
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={clsx(
              'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95',
              filter === f.id
                ? f.id === 'live'
                  ? 'bg-green-500 text-white shadow-sm'
                  : 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            )}
          >
            {f.label}
            {f.count !== undefined && f.count > 0 && (
              <span className={clsx(
                'text-[10px] px-1.5 rounded-full tabular-nums',
                filter === f.id ? 'bg-white/25 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              )}>
                {f.count}
              </span>
            )}
          </button>
        ))}
        {data?.rounds && data.rounds.length > 1 && (
          <>
            <div className="w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
            <select
              value={roundFilter}
              onChange={e => setRound(e.target.value)}
              className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-black/[0.06] dark:border-white/[0.06]"
            >
              <option value="all">All rounds</option>
              {data.rounds.map(r => <option key={r} value={r}>{roundLabel(r)}</option>)}
            </select>
          </>
        )}
      </div>

      {/* Match list */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-3xl mb-2">⚽</p>
          <p className="text-sm text-gray-400">No fixtures match this filter</p>
        </div>
      ) : filter === 'all' ? (
        <>
          {/* ── 1. Live now - always pinned on top ── */}
          {sections.live.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-green-50/95 dark:bg-green-950/40 backdrop-blur-sm border-b border-green-100/60 dark:border-green-900/30">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                <span className="text-[11px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wider">
                  Live now
                </span>
                <span className="ml-auto text-[10px] text-green-600/70 dark:text-green-500 tabular-nums">
                  {sections.live.length} match{sections.live.length > 1 ? 'es' : ''}
                </span>
              </div>
              {sections.live.map(f => <FixtureCard key={f.fixture.id} fixture={f} />)}
            </div>
          )}

          {/* ── 2. Just finished today - the score you came to check ── */}
          {sections.finishedToday.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-black/[0.04] dark:border-white/[0.04]">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  Finished today
                </span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-[10px] text-gray-400 tabular-nums">{sections.finishedToday.length}</span>
              </div>
              {sections.finishedToday.map(f => <FixtureCard key={f.fixture.id} fixture={f} />)}
            </div>
          )}

          {/* ── 3. Upcoming - chronological, grouped by local day ── */}
          {sections.upcomingByDate.map(([dateKey, matches]) => (
            <div key={dateKey}>
              <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-black/[0.04] dark:border-white/[0.04]">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  {formatDateHeading(dateKey)}
                </span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-[10px] text-gray-400 tabular-nums whitespace-nowrap">
                  {matches.length} match{matches.length > 1 ? 'es' : ''}
                </span>
              </div>
              {matches.map(f => <FixtureCard key={f.fixture.id} fixture={f} />)}
            </div>
          ))}

          {/* ── 4. Earlier results - collapsed at the bottom ── */}
          {sections.earlierCount > 0 && (
            <div>
              <button
                onClick={() => setShowEarlier(v => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50/80 dark:bg-gray-800/40 border-y border-black/[0.04] dark:border-white/[0.04] hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors"
              >
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Earlier results
                </span>
                <span className="text-[10px] text-gray-400 bg-gray-200/70 dark:bg-gray-700 px-1.5 py-0.5 rounded-full tabular-nums">
                  {sections.earlierCount}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={clsx('ml-auto text-gray-400 transition-transform', showEarlier && 'rotate-180')}>
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              {showEarlier && sections.earlierByDate.map(([dateKey, matches]) => (
                <div key={dateKey}>
                  <div className="flex items-center gap-3 px-4 py-2 bg-gray-50/95 dark:bg-gray-900/95 border-b border-black/[0.04] dark:border-white/[0.04]">
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {formatDateHeading(dateKey)}
                    </span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  </div>
                  {matches.map(f => <FixtureCard key={f.fixture.id} fixture={f} />)}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {byDate.map(([dateKey, matches]) => (
            <div key={dateKey}>
              <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-black/[0.04] dark:border-white/[0.04]">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  {formatDateHeading(dateKey)}
                </span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-[10px] text-gray-400 tabular-nums whitespace-nowrap">
                  {matches.length} match{matches.length > 1 ? 'es' : ''}
                </span>
              </div>
              {matches.map(f => <FixtureCard key={f.fixture.id} fixture={f} />)}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Group Tables tab
// ─────────────────────────────────────────────────────────────────────────────

function FormPill({ r }: { r: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold flex-shrink-0',
      r === 'W' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
      : r === 'D' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
      : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
    )}>
      {r}
    </span>
  )
}

function GroupTable({ group }: { group: AFStandingGroup }) {
  const hasStarted   = group.table.some(r => r.all.played > 0)
  const isThirdPlace = group.group === THIRD_PLACE_GROUP
  const qualifyCount = isThirdPlace ? 8 : 2
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] bg-gray-50/60 dark:bg-gray-800/30">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{group.group}</span>
        {!hasStarted && (
          <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">Not started</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: 380 }}>
          <thead>
            <tr className="border-b border-black/[0.04] dark:border-white/[0.04]">
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider py-2 pl-4 pr-2 w-6">#</th>
              <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider py-2 pr-2">Team</th>
              {['P','W','D','L','GF','GA','GD','Pts'].map(h => (
                <th key={h} className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider py-2 px-1.5 text-center w-7">{h}</th>
              ))}
              <th className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider py-2 pl-1.5 pr-4">Form</th>
            </tr>
          </thead>
          <tbody>
            {group.table.map((row, i) => {
              const advances  = i < qualifyCount
              const formChars = row.form?.split('').filter(c => 'WDL'.includes(c)) ?? []
              return (
                <tr
                  key={row.team.id}
                  className={clsx(
                    'border-b border-black/[0.04] dark:border-white/[0.04] last:border-0',
                    advances && hasStarted && 'bg-green-50/50 dark:bg-green-950/15'
                  )}
                >
                  <td className="py-2.5 pl-4 pr-2">
                    <span className={clsx(
                      'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                      i === 0 ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400'
                      : i === 1 ? 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                      : 'text-gray-400'
                    )}>
                      {row.rank}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={row.team.logo} alt="" width={18} height={18}
                        className="w-4 h-4 object-contain flex-shrink-0" loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      <span className={clsx('text-xs font-medium',
                        advances && hasStarted ? 'text-green-800 dark:text-green-300' : 'text-gray-700 dark:text-gray-300')}>
                        {teamShort(row.team.name)}
                      </span>
                    </div>
                  </td>
                  {[row.all.played, row.all.win, row.all.draw, row.all.lose, row.all.goals.for, row.all.goals.against].map((v, j) => (
                    <td key={j} className="py-2.5 px-1.5 text-center text-xs text-gray-500 tabular-nums">{v}</td>
                  ))}
                  <td className={clsx('py-2.5 px-1.5 text-center text-xs font-medium tabular-nums',
                    row.goalsDiff > 0 ? 'text-green-600 dark:text-green-400'
                    : row.goalsDiff < 0 ? 'text-red-500' : 'text-gray-400')}>
                    {row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}
                  </td>
                  <td className="py-2.5 px-1.5 text-center">
                    <span className={clsx('text-sm font-bold tabular-nums',
                      advances && hasStarted ? 'text-green-700 dark:text-green-300' : 'text-gray-800 dark:text-gray-200')}>
                      {row.points}
                    </span>
                  </td>
                  <td className="py-2.5 pl-1.5 pr-4">
                    <div className="flex items-center gap-0.5">
                      {formChars.length > 0
                        ? formChars.slice(-5).map((c, fi) => <FormPill key={fi} r={c} />)
                        : <span className="text-[10px] text-gray-300 dark:text-gray-600">-</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {hasStarted && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-black/[0.04] dark:border-white/[0.04] bg-green-50/40 dark:bg-green-950/10">
          <div className="w-2.5 h-2.5 rounded-sm bg-green-200 dark:bg-green-800 flex-shrink-0" />
          <span className="text-[10px] text-green-700 dark:text-green-400">
            {isThirdPlace ? 'Best 8 third-placed teams advance to Round of 32' : 'Top 2 advance to Round of 32'}
          </span>
        </div>
      )}
    </div>
  )
}

function GroupTablesTab({ standings, isLoading }: { standings: AFStandingGroup[]; isLoading: boolean }) {
  if (isLoading && standings.length === 0) {
    return (
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-44 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }
  if (standings.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-4xl mb-3">🏆</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">Group standings appear once the tournament begins</p>
      </div>
    )
  }
  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      {standings.map(g => (
        <div key={g.group} className={g.group === THIRD_PLACE_GROUP ? 'md:col-span-2' : ''}>
          <GroupTable group={g} />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'fixtures' | 'groups'

export default function FixturesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('fixtures')
  const { data, error, isLoading, refresh } = useWCFixtures()
  const { standings, isLoading: standingsLoading } = useWCStandings()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-screen-md mx-auto px-0 sm:px-4 py-4 sm:py-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-4 px-4 sm:px-0 flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Fixtures & Standings</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              FIFA World Cup 2026 · 11 Jun - 19 Jul
              {data && (
                <span className="ml-2 text-green-600 dark:text-green-400 font-medium">· {data.total} matches</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(data?.liveCount ?? 0) > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2.5 py-1 rounded-full border border-green-200 dark:border-green-900/40">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {data!.liveCount} live
              </span>
            )}
            <button
              onClick={() => refresh()}
              className="flex items-center gap-1.5 text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-gray-900 active:scale-95 transition-transform"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 sm:mx-0 mb-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-3">
            <svg className="flex-shrink-0 mt-0.5 text-red-500" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Could not load fixtures</p>
              <p className="text-xs text-red-600/80 dark:text-red-500 mt-0.5">{error.message}</p>
              <button onClick={() => refresh()} className="text-xs text-red-700 underline mt-1">Retry</button>
            </div>
          </div>
        )}

        {/* Card */}
        <div className="bg-white dark:bg-gray-900 sm:rounded-2xl border-y sm:border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-black/[0.08] dark:border-white/[0.08]">
            {(['fixtures', 'groups'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={clsx(
                  'flex-1 py-3.5 text-sm font-medium transition-colors border-b-2 active:bg-gray-50 dark:active:bg-gray-800/40',
                  activeTab === t
                    ? 'border-green-500 text-green-700 dark:text-green-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                )}
              >
                {t === 'fixtures'
                  ? <>Fixtures{(data?.liveCount ?? 0) > 0 && <span className="ml-1.5 inline-flex w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}</>
                  : 'Groups'}
              </button>
            ))}
          </div>

          {activeTab === 'fixtures'
            ? <FixturesTab data={data} isLoading={isLoading} />
            : <GroupTablesTab standings={standings} isLoading={standingsLoading} />
          }
        </div>

        <p className="mt-3 text-center text-[10px] text-gray-400 px-4">
          Powered by api-football.com · Tap any match for lineups, stats & predictions
        </p>
      </div>
    </div>
  )
}
