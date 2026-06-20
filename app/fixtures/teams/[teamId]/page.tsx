'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { format, isToday, isTomorrow } from 'date-fns'
import clsx from 'clsx'
import type { AFWCFixture, AFSquadPlayer, AFCoach } from '@/lib/api/apifootball'

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const res  = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json
}

interface TeamData {
  squad:    AFSquadPlayer[]
  coach:    AFCoach | null
  fixtures: AFWCFixture[]
}

interface NewsItem {
  id:          string
  title:       string
  link:        string
  description: string
  source:      string
  pubDate:     string
}

interface NewsData {
  items: NewsItem[]
}

const LIVE_STATUSES     = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE'])
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])

const POSITION_ORDER: Record<string, number> = {
  Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3,
}
const POSITION_LABEL: Record<string, string> = {
  Goalkeeper: 'Goalkeepers', Defender: 'Defenders', Midfielder: 'Midfielders', Attacker: 'Attackers',
}
const POSITION_SHORT: Record<string, string> = {
  Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'FWD',
}

// ─────────────────────────────────────────────────────────────────────────────
// Squad tab
// ─────────────────────────────────────────────────────────────────────────────

function PlayerCard({ player }: { player: AFSquadPlayer }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-black/[0.04] dark:border-white/[0.04] last:border-0">
      {/* Photo */}
      <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={player.photo} alt=""
          width={40} height={40}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={e => {
            const el = e.target as HTMLImageElement
            el.style.display = 'none'
            el.parentElement!.innerHTML = `<div class="w-full h-full flex items-center justify-center text-gray-400 text-sm font-bold">${player.name.charAt(0)}</div>`
          }}
        />
      </div>

      {/* Name + age */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{player.name}</p>
        <p className="text-xs text-gray-400">Age {player.age}</p>
      </div>

      {/* Jersey + position */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {player.number != null && (
          <span className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-400 tabular-nums">
            {player.number}
          </span>
        )}
        <span className={clsx(
          'text-[10px] font-bold px-1.5 py-0.5 rounded',
          player.position === 'Goalkeeper'
            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
            : player.position === 'Defender'
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
            : player.position === 'Midfielder'
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
        )}>
          {POSITION_SHORT[player.position] ?? player.position}
        </span>
      </div>
    </div>
  )
}

function SquadTab({ squad, coach }: { squad: AFSquadPlayer[]; coach: AFCoach | null }) {
  // Group by position
  const groups = useMemo(() => {
    const map: Record<string, AFSquadPlayer[]> = {}
    for (const p of squad) {
      if (!map[p.position]) map[p.position] = []
      map[p.position].push(p)
    }
    return Object.entries(map).sort(
      ([a], [b]) => (POSITION_ORDER[a] ?? 4) - (POSITION_ORDER[b] ?? 4)
    )
  }, [squad])

  if (squad.length === 0) {
    return (
      <div className="py-16 text-center px-4">
        <p className="text-3xl mb-3">👤</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">Squad not available yet</p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-6">
      {/* Coach */}
      {coach && (
        <div className="flex items-center gap-3 py-4 border-b border-black/[0.06] dark:border-white/[0.06] mb-2">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coach.photo} alt="" width={40} height={40} className="w-full h-full object-cover" loading="lazy"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{coach.name}</p>
            <p className="text-xs text-gray-400">{coach.nationality} · Head Coach</p>
          </div>
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/40">
            COACH
          </span>
        </div>
      )}

      {/* Position groups */}
      {groups.map(([pos, players]) => (
        <div key={pos} className="mt-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">
            {POSITION_LABEL[pos] ?? pos} ({players.length})
          </p>
          {players.map(p => <PlayerCard key={p.id} player={p} />)}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures tab
// ─────────────────────────────────────────────────────────────────────────────

function FixtureRow({ f, teamId }: { f: AFWCFixture; teamId: number }) {
  const { fixture, teams, goals, score } = f
  const isLive     = LIVE_STATUSES.has(fixture.status.short)
  const isFinished = FINISHED_STATUSES.has(fixture.status.short)
  const showScore  = isLive || isFinished
  const ft         = score?.fulltime ?? goals

  const isHome   = teams.home.id === teamId
  const myTeam   = isHome ? teams.home : teams.away
  const oppTeam  = isHome ? teams.away  : teams.home
  const myScore  = isHome ? (ft.home ?? 0) : (ft.away ?? 0)
  const oppScore = isHome ? (ft.away ?? 0) : (ft.home ?? 0)

  const result = isFinished
    ? myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D'
    : null

  const d = new Date(fixture.date)
  const dateStr = isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'd MMM')

  return (
    <Link
      href={`/fixtures/${fixture.id}`}
      className={clsx(
        'flex items-center gap-3 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/30',
        isLive && 'bg-green-50/40 dark:bg-green-950/15'
      )}
    >
      {/* Result badge */}
      <div className="w-7 flex-shrink-0">
        {result ? (
          <span className={clsx(
            'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold',
            result === 'W' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
            : result === 'L' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
          )}>
            {result}
          </span>
        ) : isLive ? (
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block mt-2.5" />
        ) : (
          <span className="text-[10px] text-gray-400 tabular-nums font-medium">{dateStr}</span>
        )}
      </div>

      {/* Opponent */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={oppTeam.logo} alt="" width={24} height={24} className="w-6 h-6 object-contain flex-shrink-0"
          loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{oppTeam.name}</p>
          <p className="text-[10px] text-gray-400">{isHome ? 'Home' : 'Away'} · {f.league.round.replace('Group Stage - ', 'MD')}</p>
        </div>
      </div>

      {/* Score / time */}
      <div className="text-right flex-shrink-0">
        {showScore ? (
          <p className={clsx(
            'text-sm font-bold tabular-nums',
            isLive ? 'text-green-600 dark:text-green-400' : 'text-gray-800 dark:text-gray-200'
          )}>
            {myScore}–{oppScore}
          </p>
        ) : (
          <p className="text-sm font-semibold text-gray-500 tabular-nums">{format(d, 'HH:mm')}</p>
        )}
        {isLive && (
          <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">
            {fixture.status.elapsed}'
          </p>
        )}
        {isFinished && (
          <p className="text-[10px] text-gray-400">FT</p>
        )}
      </div>
    </Link>
  )
}

function FixturesTab({ fixtures, teamId }: { fixtures: AFWCFixture[]; teamId: number }) {
  if (fixtures.length === 0) {
    return (
      <div className="py-16 text-center px-4">
        <p className="text-3xl mb-3">📅</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">No fixtures found</p>
      </div>
    )
  }

  // Stats summary
  const played   = fixtures.filter(f => FINISHED_STATUSES.has(f.fixture.status.short))
  const upcoming = fixtures.filter(f => !LIVE_STATUSES.has(f.fixture.status.short) && !FINISHED_STATUSES.has(f.fixture.status.short))
  const live     = fixtures.filter(f => LIVE_STATUSES.has(f.fixture.status.short))

  const wins   = played.filter(f => {
    const isHome = f.teams.home.id === teamId
    return isHome ? f.teams.home.winner === true : f.teams.away.winner === true
  }).length
  const losses = played.filter(f => {
    const isHome = f.teams.home.id === teamId
    return isHome ? f.teams.away.winner === true : f.teams.home.winner === true
  }).length
  const draws  = played.length - wins - losses

  return (
    <div>
      {/* Summary bar */}
      {played.length > 0 && (
        <div className="flex items-center gap-0 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] bg-gray-50/60 dark:bg-gray-800/20">
          {[
            { label: 'Played',   value: played.length,   color: 'text-gray-700 dark:text-gray-300' },
            { label: 'Won',      value: wins,             color: 'text-green-600 dark:text-green-400' },
            { label: 'Drawn',    value: draws,            color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Lost',     value: losses,           color: 'text-red-500 dark:text-red-400' },
            { label: 'Upcoming', value: upcoming.length,  color: 'text-gray-500 dark:text-gray-400' },
          ].map(stat => (
            <div key={stat.label} className="flex-1 text-center">
              <p className={clsx('text-lg font-black tabular-nums', stat.color)}>{stat.value}</p>
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {live.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50/80 dark:bg-green-950/20 border-b border-green-100/60 dark:border-green-900/30">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[11px] font-semibold text-green-700 dark:text-green-400">Playing now</span>
        </div>
      )}

      {fixtures.map(f => <FixtureRow key={f.fixture.id} f={f} teamId={teamId} />)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// News tab
// ─────────────────────────────────────────────────────────────────────────────

function NewsTab({ teamName }: { teamName: string }) {
  const { data, error, isLoading } = useSWR<NewsData>('/api/news', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval:  300_000,
  })

  const filtered = useMemo(() => {
    if (!data?.items) return []
    const kw = teamName.toLowerCase().split(' ')
    return data.items.filter(n => {
      const text = (n.title + ' ' + n.description).toLowerCase()
      return kw.some(w => w.length > 3 && text.includes(w))
    })
  }, [data?.items, teamName])

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
        ))}
      </div>
    )
  }

  if (error || filtered.length === 0) {
    return (
      <div className="py-16 text-center px-4">
        <p className="text-3xl mb-3">📰</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">No recent news for {teamName}</p>
        <p className="text-xs text-gray-400 mt-1">Check back during the tournament</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
      {filtered.slice(0, 15).map(item => (
        <a
          key={item.id}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug line-clamp-2">
              {item.title}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-gray-400 font-medium">{item.source}</span>
              <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
              <span className="text-[10px] text-gray-400">
                {format(new Date(item.pubDate), 'd MMM')}
              </span>
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-gray-300 dark:text-gray-600 mt-0.5">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'squad' | 'fixtures' | 'news'

export default function TeamPage() {
  const params   = useParams()
  const router   = useRouter()
  const teamId   = params.teamId as string
  const [tab, setTab] = useState<Tab>('squad')

  const { data, error, isLoading } = useSWR<TeamData>(
    teamId ? `/api/wc/team/${teamId}` : null,
    fetcher,
    { revalidateOnFocus: false, errorRetryCount: 3 }
  )

  // Get team info from first fixture
  const teamInfo = useMemo(() => {
    if (!data?.fixtures?.length) return null
    const id = parseInt(teamId, 10)
    const f  = data.fixtures[0]
    return f.teams.home.id === id ? f.teams.home : f.teams.away
  }, [data, teamId])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-screen-md mx-auto">
          <div className="h-12 bg-white dark:bg-gray-900 border-b border-black/[0.06] dark:border-white/[0.06]" />
          <div className="p-4 space-y-3">
            <div className="h-28 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
            <div className="h-12 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
            <div className="h-48 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Team not found</p>
          <button onClick={() => router.back()} className="text-xs text-green-700 dark:text-green-400 underline">
            ← Go back
          </button>
        </div>
      </div>
    )
  }

  const teamName = teamInfo?.name ?? `Team ${teamId}`
  const teamLogo = teamInfo?.logo ?? ''

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'squad',    label: 'Squad',    count: data.squad.length },
    { id: 'fixtures', label: 'Fixtures', count: data.fixtures.length },
    { id: 'news',     label: 'News' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-screen-md mx-auto">

        {/* Back nav */}
        <div className="sticky top-0 z-20 flex items-center gap-2 px-4 h-12 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-black/[0.06] dark:border-white/[0.06]">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Back
          </button>
        </div>

        {/* Team header */}
        <div className="bg-white dark:bg-gray-900 px-6 py-6 flex items-center gap-4 border-b border-black/[0.06] dark:border-white/[0.06]">
          {teamLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={teamLogo} alt="" width={64} height={64}
              className="w-16 h-16 object-contain flex-shrink-0"
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2' }} />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-gray-900 dark:text-gray-100 leading-tight">
              {teamName}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              FIFA World Cup 2026
              {data.squad.length > 0 && ` · ${data.squad.length} players`}
            </p>
            {data.coach && (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                {data.coach.name}
              </p>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex bg-white dark:bg-gray-900 border-b border-black/[0.08] dark:border-white/[0.08]">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex-1 py-3 text-sm font-medium transition-colors border-b-2 active:bg-gray-50 dark:active:bg-gray-800/40',
                tab === t.id
                  ? 'border-green-500 text-green-700 dark:text-green-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400'
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={clsx(
                  'ml-1.5 text-[10px] tabular-nums px-1.5 py-0.5 rounded-full',
                  tab === t.id
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                )}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-white dark:bg-gray-900 sm:rounded-b-2xl overflow-hidden min-h-[50vh]">
          {tab === 'squad'    && <SquadTab squad={data.squad} coach={data.coach} />}
          {tab === 'fixtures' && <FixturesTab fixtures={data.fixtures} teamId={parseInt(teamId, 10)} />}
          {tab === 'news'     && <NewsTab teamName={teamName} />}
        </div>

      </div>
    </div>
  )
}
