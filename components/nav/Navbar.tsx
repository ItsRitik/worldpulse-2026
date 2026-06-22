'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useFixtures, LIVE_STATUSES } from '@/lib/hooks/useFixtures'
import { useAuth } from '@/lib/hooks/useAuth'
import type { AFWCFixture } from '@/lib/api/apifootball'
import clsx from 'clsx'

const NAV_LINKS = [
  { href: '/fixtures', label: 'Fixtures' },
  { href: '/fantasy',  label: 'Fantasy'  },
]

// ── User avatar / auth button ──────────────────────────────────────────────────
function AuthWidget() {
  const { user, loading, signOut } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()
  const [open,   setOpen]   = useState(false)
  const menuRef  = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (loading) {
    return <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
  }

  if (!user) {
    return (
      <Link
        href={`/fantasy/login?next=${encodeURIComponent(pathname)}`}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-1.5 rounded-full transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/>
        </svg>
        Sign in
      </Link>
    )
  }

  // Logged-in avatar + dropdown
  const initials = (user.email ?? user.user_metadata?.full_name ?? '?')
    .split(/[@\s]/).filter(Boolean).slice(0, 2).map((s: string) => s[0].toUpperCase()).join('')

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-full hover:ring-2 hover:ring-pulse-300 transition-all"
        aria-label="User menu"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="avatar" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-pulse-600 flex items-center justify-center text-[10px] font-bold text-white">
            {initials}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-52 bg-white dark:bg-gray-900 border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-lg py-2 z-50 overflow-hidden">
          {/* User info */}
          <div className="px-4 py-2.5 border-b border-black/[0.06] dark:border-white/[0.06]">
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
              {user.user_metadata?.full_name ?? 'Player'}
            </p>
            <p className="text-[10px] text-gray-400 truncate mt-0.5">{user.email}</p>
          </div>

          {/* Links */}
          <div className="py-1">
            <Link
              href="/fantasy"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
              </svg>
              My Fantasy Rooms
            </Link>
          </div>

          <div className="border-t border-black/[0.06] dark:border-white/[0.06] py-1">
            <button
              onClick={async () => { setOpen(false); await signOut(); router.push('/') }}
              className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Navbar ─────────────────────────────────────────────────────────────────────
export function Navbar() {
  const pathname = usePathname()
  const [tickerIndex, setTickerIndex] = useState(0)
  const { live, today, upcoming } = useFixtures()

  // Ticker pool: when a match is LIVE, lock the ticker to live games only so the
  // score stays put (it refreshes in place via useFixtures) instead of cycling
  // off to upcoming fixtures. Only when nothing is live do we shuffle through
  // today's + the next few upcoming matches.
  const pool: AFWCFixture[] = live.length > 0
    ? live
    : [...today, ...upcoming.slice(0, 5)]

  useEffect(() => {
    // A single match (or a single live game) sticks - no rotation.
    if (pool.length <= 1) return
    const interval = setInterval(() => {
      setTickerIndex(i => (i + 1) % pool.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [pool.length])

  const tickerMatch = pool[tickerIndex % Math.max(pool.length, 1)]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-white dark:bg-gray-950 border-b border-black/[0.08] dark:border-white/[0.08] flex items-center px-4 gap-0">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mr-6 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-pulse-400 live-dot" />
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 tracking-tight">
          WC26 Fantasy <span className="text-pulse-600">XI</span>
        </span>
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-0 flex-1">
        {NAV_LINKS.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              'text-xs px-3 h-14 flex items-center border-b-2 transition-colors',
              pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
                ? 'text-gray-900 dark:text-white border-pulse-400'
                : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-200'
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Live ticker - hidden on small screens */}
      {tickerMatch && (
        <div className="hidden md:flex items-center gap-2 text-xs mr-4">
          {live.length > 0 && (
            <span className="flex items-center gap-1.5 bg-pulse-50 text-pulse-800 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-pulse-400 live-dot" />
              {live.length} live
            </span>
          )}
          <span className="flex items-center text-gray-400 dark:text-gray-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tickerMatch.teams.home.logo} alt="" width={14} height={14}
              className="w-3.5 h-3.5 object-contain mr-1.5" loading="lazy" />
            {tickerMatch.teams.home.name}
            <span className="mx-2 font-medium text-gray-700 dark:text-gray-300">
              {tickerMatch.fixture.status.short === 'NS'
                ? 'vs'
                : `${tickerMatch.goals.home ?? 0} - ${tickerMatch.goals.away ?? 0}`}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tickerMatch.teams.away.logo} alt="" width={14} height={14}
              className="w-3.5 h-3.5 object-contain mr-1.5" loading="lazy" />
            {tickerMatch.teams.away.name}
            {LIVE_STATUSES.has(tickerMatch.fixture.status.short) && tickerMatch.fixture.status.elapsed && (
              <span className="ml-2 text-pulse-600 font-medium">{tickerMatch.fixture.status.elapsed}'</span>
            )}
          </span>
        </div>
      )}

      {/* Auth widget - always visible */}
      <AuthWidget />
    </nav>
  )
}
