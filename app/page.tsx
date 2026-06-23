'use client'

/**
 * WC26 Fantasy XI, main screen
 * ═════════════════════════════
 * Everything on this page is live data:
 *   featured match + today rail   /api/wc/fixtures   (API-Football)
 *   win probability               /api/wc/odds       (real bookmaker odds)
 *   top stories with images       /api/news          (BBC, Guardian, ESPN, Sky RSS)
 *   Golden Boot race              /api/wc/topscorers (API-Football)
 */

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { useFixtures, useNews, LIVE_STATUSES, FINISHED_STATUSES } from '@/lib/hooks/useFixtures'
import type { AFWCFixture } from '@/lib/api/apifootball'
import { teamTla } from '@/lib/api/tla'
import { format } from 'date-fns'
import clsx from 'clsx'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json
}

// ─────────────────────────────────────────────────────────────────────────────
// Featured match hero
// ─────────────────────────────────────────────────────────────────────────────

function OddsBar({ fixtureId, homeName, awayName }: { fixtureId: number; homeName: string; awayName: string }) {
  const { data } = useSWR<{ available: boolean; home: number; draw: number; away: number; bookmakers: number }>(
    `/api/wc/odds/${fixtureId}`, fetcher, { revalidateOnFocus: false, errorRetryCount: 1 }
  )
  if (!data?.available) return null

  return (
    <div className="mt-5 max-w-md mx-auto w-full">
      <div className="flex items-end justify-between mb-1.5 text-white">
        <div>
          <p className="text-[10px] text-white/60 uppercase tracking-wider">{teamTla(homeName)} win</p>
          <p className="text-lg font-bold tabular-nums leading-tight">{data.home}%</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-white/60 uppercase tracking-wider">Draw</p>
          <p className="text-lg font-bold tabular-nums leading-tight text-white/80">{data.draw}%</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-white/60 uppercase tracking-wider">{teamTla(awayName)} win</p>
          <p className="text-lg font-bold tabular-nums leading-tight">{data.away}%</p>
        </div>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden gap-px bg-white/10">
        <div className="bg-pulse-400 rounded-l-full transition-all duration-700" style={{ width: `${data.home}%` }} />
        <div className="bg-white/30 transition-all duration-700" style={{ width: `${data.draw}%` }} />
        <div className="bg-amber-400 rounded-r-full transition-all duration-700" style={{ width: `${data.away}%` }} />
      </div>
      <p className="mt-1.5 text-center text-[10px] text-white/40">
        Win probability, averaged from {data.bookmakers} bookmaker odds
      </p>
    </div>
  )
}

function FeaturedMatch({ match }: { match: AFWCFixture }) {
  const isLive  = LIVE_STATUSES.has(match.fixture.status.short)
  const isDone  = FINISHED_STATUSES.has(match.fixture.status.short)
  const kickoff = new Date(match.fixture.date)

  return (
    <div
      className="relative overflow-hidden rounded-3xl"
      style={{ background: 'linear-gradient(135deg, #0c2620 0%, #123b2f 55%, #0a1f1a 100%)' }}
    >
      {/* subtle pitch rings */}
      <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full border border-white/[0.06] pointer-events-none" />
      <div className="absolute -right-10 -top-10 w-52 h-52 rounded-full border border-white/[0.06] pointer-events-none" />

      <div className="relative px-5 sm:px-8 pt-6 pb-7">
        {/* status row */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {isLive ? (
            <span className="flex items-center gap-1.5 bg-green-500 text-white text-[11px] font-bold px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {match.fixture.status.short === 'HT' ? 'Half time' : `Live · ${match.fixture.status.elapsed ?? ''}'`}
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-white/60 uppercase tracking-widest">
              {isDone ? 'Full time' : 'Next up'} · {match.league.round.replace('Group Stage - ', 'Group stage, matchday ')}
            </span>
          )}
        </div>

        {/* teams + score */}
        <div className="flex items-center justify-center gap-6 sm:gap-10">
          <Link href={`/fixtures/teams/${match.teams.home.id}`} className="flex flex-col items-center gap-2 w-24 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={match.teams.home.logo} alt={match.teams.home.name} width={64} height={64}
              className="w-14 h-14 sm:w-16 sm:h-16 object-contain group-hover:scale-105 transition-transform"
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }} />
            <span className="text-sm font-semibold text-white text-center leading-tight">{match.teams.home.name}</span>
          </Link>

          <div className="text-center">
            {isLive || isDone ? (
              <div className="text-5xl font-black text-white tabular-nums tracking-tight">
                {match.goals.home ?? 0}<span className="text-white/30 font-light mx-2">:</span>{match.goals.away ?? 0}
              </div>
            ) : (
              <div>
                <div className="text-4xl font-black text-white tabular-nums">{format(kickoff, 'HH:mm')}</div>
                <div className="text-[11px] text-white/50 mt-1">{format(kickoff, 'EEE d MMM')} · your time</div>
              </div>
            )}
          </div>

          <Link href={`/fixtures/teams/${match.teams.away.id}`} className="flex flex-col items-center gap-2 w-24 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={match.teams.away.logo} alt={match.teams.away.name} width={64} height={64}
              className="w-14 h-14 sm:w-16 sm:h-16 object-contain group-hover:scale-105 transition-transform"
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }} />
            <span className="text-sm font-semibold text-white text-center leading-tight">{match.teams.away.name}</span>
          </Link>
        </div>

        {/* venue */}
        {match.fixture.venue.name && (
          <p className="text-center text-[11px] text-white/40 mt-4">
            {match.fixture.venue.name}{match.fixture.venue.city ? `, ${match.fixture.venue.city}` : ''}
          </p>
        )}

        {/* bookmaker probabilities, pre-match only */}
        {!isLive && !isDone && (
          <OddsBar fixtureId={match.fixture.id} homeName={match.teams.home.name} awayName={match.teams.away.name} />
        )}

        {/* CTAs */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href={`/fixtures/${match.fixture.id}`}
            className="h-10 px-5 flex items-center gap-2 rounded-xl bg-white text-gray-900 text-sm font-semibold hover:bg-gray-100 transition-colors"
          >
            Match centre
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
          <Link
            href="/fantasy"
            className="h-10 px-5 flex items-center gap-2 rounded-xl bg-pulse-500/90 text-white text-sm font-semibold hover:bg-pulse-500 transition-colors"
          >
            Play Fantasy 1v1
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Today rail
// ─────────────────────────────────────────────────────────────────────────────

function RailCard({ m }: { m: AFWCFixture }) {
  const isLive = LIVE_STATUSES.has(m.fixture.status.short)
  const isDone = FINISHED_STATUSES.has(m.fixture.status.short)
  return (
    <Link
      href={`/fixtures/${m.fixture.id}`}
      className={clsx(
        'flex-shrink-0 w-44 rounded-2xl border p-3 transition-all hover:shadow-md bg-white dark:bg-gray-900',
        isLive ? 'border-green-300 dark:border-green-800' : 'border-black/[0.07] dark:border-white/[0.07]'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        {isLive ? (
          <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {m.fixture.status.short === 'HT' ? 'HT' : `${m.fixture.status.elapsed ?? ''}'`}
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-gray-400">{isDone ? 'FT' : format(new Date(m.fixture.date), 'HH:mm')}</span>
        )}
        <span className="text-[9px] text-gray-300 dark:text-gray-600 uppercase">{m.league.round.replace('Group Stage - ', 'MD')}</span>
      </div>
      {[
        { t: m.teams.home, g: m.goals.home },
        { t: m.teams.away, g: m.goals.away },
      ].map(({ t, g }, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.logo} alt="" width={18} height={18} className="w-[18px] h-[18px] object-contain flex-shrink-0" loading="lazy"
            onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
          <span className={clsx('text-xs flex-1 truncate', t.winner ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400')}>
            {t.name}
          </span>
          {(isLive || isDone) && <span className="text-xs font-bold tabular-nums text-gray-800 dark:text-gray-200">{g ?? 0}</span>}
        </div>
      ))}
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// News
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const min = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
  if (min < 60) return `${min}m ago`
  if (min < 1440) return `${Math.floor(min / 60)}h ago`
  return `${Math.floor(min / 1440)}d ago`
}

function NewsSection() {
  const { items, isLoading } = useNews()

  if (isLoading && items.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 h-64 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
        {[1, 2].map(i => <div key={i} className="h-28 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />)}
      </div>
    )
  }
  if (items.length === 0) return null

  const withImg = items.filter(i => i.image)
  const lead    = withImg[0] ?? items[0]
  const cards   = withImg.filter(i => i !== lead).slice(0, 4)
  const rows    = items.filter(i => i !== lead && !cards.includes(i)).slice(0, 5)

  return (
    <div>
      {/* Lead story */}
      <a href={lead.link} target="_blank" rel="noopener noreferrer"
        className="group block rounded-2xl overflow-hidden border border-black/[0.07] dark:border-white/[0.07] bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
        {lead.image && (
          <div className="relative h-56 sm:h-72 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lead.image} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold text-pulse-600 dark:text-pulse-400 uppercase tracking-wider">{lead.source}</span>
            <span className="text-[10px] text-gray-400">{timeAgo(lead.pubDate)}</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 leading-snug group-hover:text-pulse-700 dark:group-hover:text-pulse-400 transition-colors">
            {lead.title}
          </h3>
          {lead.description && lead.description !== 'null' && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2">{lead.description}</p>
          )}
        </div>
      </a>

      {/* Image cards */}
      {cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {cards.map(item => (
            <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer"
              className="group flex gap-3 rounded-2xl overflow-hidden border border-black/[0.07] dark:border-white/[0.07] bg-white dark:bg-gray-900 hover:shadow-md transition-shadow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image} alt="" className="w-28 h-full object-cover flex-shrink-0" loading="lazy" />
              <div className="py-3 pr-3 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold text-pulse-600 dark:text-pulse-400 uppercase tracking-wider">{item.source}</span>
                  <span className="text-[9px] text-gray-400">{timeAgo(item.pubDate)}</span>
                </div>
                <h4 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 leading-snug line-clamp-3 group-hover:text-pulse-700 dark:group-hover:text-pulse-400 transition-colors">
                  {item.title}
                </h4>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Text rows */}
      {rows.length > 0 && (
        <div className="mt-4 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] bg-white dark:bg-gray-900 divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {rows.map(item => (
            <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-pulse-700 dark:group-hover:text-pulse-400 transition-colors">
                  {item.title}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">{item.source} · {timeAgo(item.pubDate)}</p>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className="text-gray-300 dark:text-gray-600 flex-shrink-0">
                <path d="M7 17L17 7M7 7h10v10"/>
              </svg>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Golden Boot race, live and interactive
// ─────────────────────────────────────────────────────────────────────────────

type TopScorer = {
  id: number; name: string; photo: string; team: string; team_logo: string
  goals: number; assists: number; matches: number
}

function GoldenBoot() {
  const { data } = useSWR<{ scorers: TopScorer[] }>('/api/wc/topscorers', fetcher, {
    revalidateOnFocus: false, refreshInterval: 300_000,
  })
  const [active, setActive] = useState<number | null>(null)

  const scorers = data?.scorers ?? []
  if (scorers.length === 0) return null

  return (
    <div className="rounded-2xl border border-black/[0.07] dark:border-white/[0.07] bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.05] flex items-center gap-2">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BA7517" strokeWidth="2">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21 1.18.54 2.03 2.03 2.03 4M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
        </svg>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Golden Boot race</span>
        <span className="ml-auto text-[10px] text-gray-400">live</span>
      </div>

      <div className="p-3 space-y-1">
        {scorers.slice(0, 8).map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActive(a => a === s.id ? null : s.id)}
            className={clsx(
              'w-full text-left rounded-xl px-2 py-1.5 transition-colors',
              active === s.id ? 'bg-amber-50 dark:bg-amber-900/15' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className={clsx('w-4 text-center text-[11px] font-bold tabular-nums',
                i === 0 ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600')}>{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.photo} alt="" width={26} height={26} loading="lazy"
                className="w-[26px] h-[26px] rounded-full object-cover bg-gray-100 dark:bg-gray-800 flex-shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate block">{s.name}</span>
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.team_logo} alt="" width={11} height={11} className="w-[11px] h-[11px] object-contain" loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  {s.team}
                </span>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-base font-black text-gray-900 dark:text-gray-100 tabular-nums">{s.goals}</span>
                <span className="text-[9px] text-gray-400 ml-1">{s.goals === 1 ? 'goal' : 'goals'}</span>
              </div>
            </div>
            {active === s.id && (
              <div className="flex gap-4 mt-2 ml-9 text-[11px] text-gray-500 dark:text-gray-400">
                <span>{s.team}</span>
                <span className="tabular-nums">{s.assists} assist{s.assists === 1 ? '' : 's'}</span>
                <span className="tabular-nums">{s.matches} match{s.matches === 1 ? '' : 'es'}</span>
              </div>
            )}
          </button>
        ))}
      </div>
      <p className="px-4 pb-3 text-[10px] text-gray-400">Tap a player for assists and appearances. Updates as goals go in.</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fantasy promo
// ─────────────────────────────────────────────────────────────────────────────

function FantasyPromo() {
  return (
    <Link
      href="/fantasy"
      className="block rounded-2xl overflow-hidden group"
      style={{ background: 'linear-gradient(135deg, #0F6E56 0%, #085041 100%)' }}
    >
      <div className="p-5">
        <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-2">Fantasy 1v1</p>
        <h3 className="text-lg font-bold text-white leading-snug mb-1.5">
          Pick 11 from one match.<br />Beat your friend live.
        </h3>
        <p className="text-xs text-white/70 leading-relaxed mb-4">
          Build a squad from tonight&apos;s lineups, share one link, and watch points land minute by minute.
        </p>
        <span className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-white text-pulse-800 text-sm font-semibold group-hover:bg-pulse-50 transition-colors">
          Start a 1v1
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </span>
      </div>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { live, today, upcoming, recent, isLoading } = useFixtures()

  // Featured: live match first, else the next kickoff
  const featured = live[0] ?? upcoming[0] ?? today[0] ?? null

  // Today rail: live first, then today's others, then next few upcoming
  const seen = new Set<number>()
  const rail: AFWCFixture[] = []
  for (const m of [...live, ...today, ...upcoming]) {
    if (m === featured) continue
    if (seen.has(m.fixture.id)) continue
    seen.add(m.fixture.id)
    rail.push(m)
    if (rail.length >= 8) break
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-screen-xl mx-auto px-4 py-6">

        {/* ── Featured match ── */}
        {isLoading && !featured ? (
          <div className="h-72 rounded-3xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ) : featured ? (
          <FeaturedMatch match={featured} />
        ) : null}

        {/* ── Today rail ── */}
        {rail.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">More matches</h2>
              <Link href="/fixtures" className="text-xs text-pulse-600 dark:text-pulse-400 font-medium hover:underline">
                All fixtures and groups
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
              {rail.map(m => <RailCard key={m.fixture.id} m={m} />)}
            </div>
          </div>
        )}

        {/* ── Latest results ── */}
        {recent.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Latest results</h2>
              <Link href="/fixtures" className="text-xs text-pulse-600 dark:text-pulse-400 font-medium hover:underline">
                All results
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
              {recent.slice(0, 10).map(m => <RailCard key={m.fixture.id} m={m} />)}
            </div>
          </div>
        )}

        {/* ── Main grid ── */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
          {/* Stories */}
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Top stories</h2>
            <NewsSection />
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-4">
            <FantasyPromo />
            <GoldenBoot />
            <Link
              href="/fixtures"
              className="flex items-center gap-3 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] bg-white dark:bg-gray-900 p-4 hover:shadow-md transition-shadow group"
            >
              <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Groups and standings</p>
                <p className="text-[11px] text-gray-400">All 12 groups plus the third place race</p>
              </div>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className="text-gray-300 dark:text-gray-600 group-hover:text-pulse-500 transition-colors">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </Link>
          </div>
        </div>

        <p className="mt-10 text-center text-[10px] text-gray-400">
          Live scores and stats from API-Football. Stories from BBC Sport, The Guardian, ESPN FC and Sky Sports.
        </p>
      </div>
    </div>
  )
}
