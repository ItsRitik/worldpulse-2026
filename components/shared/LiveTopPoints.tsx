'use client'

/**
 * LiveTopPoints — compact link strip for live match cards.
 * Links to /fixtures/[id]/points: every player ranked high → low + the
 * minute-by-minute points log. Set `asLink={false}` when the strip sits
 * inside an element that is already a link (no nested <a> tags).
 */

import Link from 'next/link'

export function LiveTopPoints({ fixtureId, asLink = true }: { fixtureId: number | string; asLink?: boolean }) {
  const inner = (
    <>
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
      <span className="text-[11px] font-semibold text-green-700 dark:text-green-400">
        Live player points &amp; log
      </span>
      <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400">
        View all
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </span>
    </>
  )

  const cls = 'mt-2 flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/40 rounded-xl px-3 py-2 transition-colors hover:bg-green-100 dark:hover:bg-green-900/30'

  if (!asLink) return <div className={cls}>{inner}</div>

  return (
    <Link href={`/fixtures/${fixtureId}/points`} className={cls}>
      {inner}
    </Link>
  )
}
