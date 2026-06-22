'use client'
import useSWR from 'swr'
import type { AFWCFixture } from '@/lib/api/apifootball'
import { localDateKey, todayKey } from '@/lib/time'

// Throw on non-2xx so SWR treats it as an error
const fetcher = async (url: string) => {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json
}

export const LIVE_STATUSES     = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE'])
export const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])

interface WCFixturesResponse {
  fixtures:  AFWCFixture[]
  liveCount: number
  total:     number
  timestamp: string
}

/**
 * WC 2026 fixtures from API-Football (via /api/wc/fixtures).
 * Splits into live / today / upcoming for the home page and navbar ticker.
 * Auto-refreshes every 60s.
 */
export function useFixtures() {
  const { data, error, isLoading, mutate } = useSWR<WCFixturesResponse>(
    '/api/wc/fixtures',
    fetcher,
    {
      refreshInterval:     60_000,
      revalidateOnFocus:   true,
      shouldRetryOnError:  true,
      errorRetryCount:     3,
      errorRetryInterval:  15_000,
    }
  )

  const all = data?.fixtures ?? []
  const tKey = todayKey()   // viewer's local date

  const live = all.filter(f => LIVE_STATUSES.has(f.fixture.status.short))
  const today = all.filter(f =>
    localDateKey(f.fixture.date) === tKey && !LIVE_STATUSES.has(f.fixture.status.short)
  )
  const upcoming = all
    .filter(f => f.fixture.status.short === 'NS')
    .sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime())

  // Finished matches, most recently kicked off first
  const recent = all
    .filter(f => FINISHED_STATUSES.has(f.fixture.status.short))
    .sort((a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime())

  return {
    live,
    today,
    upcoming,
    recent,
    total:     data?.total ?? 0,
    hasData:   !!data,
    error,
    isLoading,
    refresh:   mutate,
  }
}

export interface NewsItem {
  id: string
  title: string
  link: string
  description: string
  source: string
  icon: string
  pubDate: string
  isHot: boolean
  category?: string
  image?: string
}

export interface NewsData {
  items: NewsItem[]
  sources: string[]
  fetchErrors?: string[]
  timestamp: string
}

/** Live news - auto-refreshes every 5 min */
export function useNews() {
  const { data, error, isLoading, mutate } = useSWR<NewsData>(
    '/api/news',
    fetcher,
    {
      refreshInterval:    300_000,
      revalidateOnFocus:  false,
      shouldRetryOnError: true,
      errorRetryCount:    2,
      errorRetryInterval: 30_000,
    }
  )
  return { news: data, items: data?.items ?? [], error, isLoading, refresh: mutate }
}
