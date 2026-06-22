'use client'

import Link from 'next/link'
import { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

type Category = 'attack' | 'defense' | 'appearance' | 'negative'

type ScoringRow = {
  icon:     string
  label:    string
  pts:      string          // e.g. "+40" | "+50 / +60" | "+1 per 5"
  cat:      Category
  note?:    string
  position?: string         // which positions it applies to
}

const ROWS: ScoringRow[] = [
  // ── Attack ────────────────────────────────────────────────────────────────
  {
    icon: '⚽', label: 'Goal - Striker (FWD)', pts: '+40', cat: 'attack',
    position: 'FWD',
  },
  {
    icon: '⚽', label: 'Goal - Midfielder (MID)', pts: '+50', cat: 'attack',
    position: 'MID',
  },
  {
    icon: '⚽', label: 'Goal - Defender / GK', pts: '+60', cat: 'attack',
    position: 'DEF · GK',
    note: 'Defenders and keepers score more for goals - reward the unexpected.',
  },
  {
    icon: '🎯', label: 'Assist', pts: '+20', cat: 'attack',
    note: 'Direct assist, rebound assist, won-penalty assist, and own-goal-from-cross assist all count.',
  },
  {
    icon: '👟', label: 'Shot on Target', pts: '+6', cat: 'attack',
    position: 'All',
    note: 'Goals count as shots on target - scorer earns both the goal bonus and +6.',
  },
  {
    icon: '🔑', label: 'Chance Created (key pass)', pts: '+3', cat: 'attack',
    position: 'All',
    note: 'The final touch leading to any shot (on target, blocked, or off target). If that same pass earned an Assist, no additional Chance Created points are awarded.',
  },
  {
    icon: '🔄', label: 'Per 5 passes completed', pts: '+1', cat: 'attack',
    position: 'All',
    note: '10 passes = +2, 25 passes = +5, etc. Based on passes × accuracy %.',
  },
  // ── Defense ───────────────────────────────────────────────────────────────
  {
    icon: '🛡️', label: 'Tackle Won', pts: '+4', cat: 'defense',
    position: 'All',
    note: 'Player takes the ball away from the opponent or puts it out of play.',
  },
  {
    icon: '✂️', label: 'Interception Won', pts: '+4', cat: 'defense',
    position: 'All',
    note: 'Player intentionally steps into the line of a pass and retains possession.',
  },
  {
    icon: '🧤', label: 'Save (GK)', pts: '+6', cat: 'defense',
    position: 'GK',
    note: 'Every save earns +6. A GK making 5 saves = +30 save points alone.',
  },
  {
    icon: '🛑', label: 'Penalty Saved (GK)', pts: '+50', cat: 'defense',
    position: 'GK',
    note: 'Only awarded if the goalkeeper touches the ball. A complete miss by the taker does NOT earn the keeper +50.',
  },
  {
    icon: '🔒', label: 'Clean Sheet (GK / DEF)', pts: '+20', cat: 'defense',
    position: 'GK · DEF',
    note: 'Team concedes zero goals while the player is on the field, and they played 54+ minutes. A sub removed before any goal was conceded still earns this if they played 54+ min.',
  },
  // ── Appearance ────────────────────────────────────────────────────────────
  {
    icon: '▶️', label: 'Starting XI', pts: '+4', cat: 'appearance',
    position: 'All',
    note: 'Awarded when a player is named in the starting lineup and takes the field.',
  },
  {
    icon: '🔁', label: 'Substitute appearance', pts: '+2', cat: 'appearance',
    position: 'All',
    note: 'Awarded when a player comes on from the bench and plays.',
  },
  // ── Negative ──────────────────────────────────────────────────────────────
  {
    icon: '🟨', label: 'Yellow card', pts: '−4', cat: 'negative',
    position: 'All',
    note: 'If a player receives a second yellow (leading to a red), only the −10 red card penalty applies - not −4 as well.',
  },
  {
    icon: '🟥', label: 'Red card', pts: '−10', cat: 'negative',
    position: 'All',
    note: 'Player continues to be penalised for goals conceded by their team even after leaving the pitch.',
  },
  {
    icon: '😬', label: 'Own goal', pts: '−8', cat: 'negative',
    position: 'All',
  },
  {
    icon: '💔', label: 'Goal conceded (GK / DEF)', pts: '−2', cat: 'negative',
    position: 'GK · DEF',
    note: 'Per goal conceded while the player is on the field. Red-carded players continue to accumulate this penalty after leaving.',
  },
  {
    icon: '❌', label: 'Penalty missed', pts: '−20', cat: 'negative',
    position: 'All',
    note: 'Only applies when the goalkeeper has not touched the ball. A saved penalty does not trigger this penalty.',
  },
]

const CATEGORIES: { id: Category; label: string; color: string; bg: string; border: string }[] = [
  { id: 'attack',     label: 'Attack',     color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20',  border: 'border-emerald-100 dark:border-emerald-800/30' },
  { id: 'defense',    label: 'Defense',    color: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-50 dark:bg-sky-900/20',          border: 'border-sky-100 dark:border-sky-800/30' },
  { id: 'appearance', label: 'Appearance', color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-50 dark:bg-violet-900/20',    border: 'border-violet-100 dark:border-violet-800/30' },
  { id: 'negative',   label: 'Penalties',  color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-50 dark:bg-red-900/20',          border: 'border-red-100 dark:border-red-800/30' },
]

const IMPORTANT_RULES = [
  'Any event during extra time counts for points. Penalty shootout events do NOT count.',
  'A player who does not play at all receives no points - including no negative points for off-field cards.',
  'If a player earns an Assist, they will NOT additionally earn Chance Created points for that same touch.',
  'If the penalty taker themselves wins the penalty and also scores it, they earn the Goal points only - no Assist.',
  'Once a match is marked Complete and winners are declared, no further point adjustments are made.',
  'Points for live matches are subject to change while the match status is "In Progress" or "In Review".',
  'Stats are sourced from Opta. In case of a clear data error, points may be manually corrected.',
]

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ScoringPage() {
  const [activeTab, setActiveTab] = useState<Category | 'all'>('all')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const filtered = activeTab === 'all' ? ROWS : ROWS.filter(r => r.cat === activeTab)

  function ptColor(pts: string) {
    if (pts.startsWith('−') || pts.startsWith('-')) return 'text-red-500 dark:text-red-400'
    return 'text-emerald-600 dark:text-emerald-400'
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-pulse-700 via-pulse-600 to-indigo-700 text-white">
        <div className="max-w-lg mx-auto px-4 pt-8 pb-7">
          <Link
            href="/fantasy"
            className="inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white mb-5 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back to Fantasy
          </Link>

          <div className="flex items-start gap-3 mb-5">
            <div className="text-4xl leading-none">🏆</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Points System</h1>
              <p className="text-sm text-white/70 mt-1 leading-relaxed">
                Every goal, tackle, and save earns or costs your team points -
                updated live every few minutes during a match.
              </p>
            </div>
          </div>

          {/* Headline stat pills */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'DEF/GK goal', value: '+60' },
              { label: 'Penalty save', value: '+50' },
              { label: 'Clean sheet', value: '+20' },
              { label: 'Missed pen', value: '−20' },
            ].map(s => (
              <div key={s.label} className="bg-white/10 rounded-xl px-2 py-2.5 text-center">
                <div className="text-base font-black">{s.value}</div>
                <div className="text-[9px] text-white/60 mt-0.5 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-6">

        {/* ── Captain / VC banner ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-2xl p-4 text-white">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold opacity-80">Captain</span>
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">C</span>
            </div>
            <div className="text-3xl font-black">×2</div>
            <p className="text-[10px] opacity-80 mt-1">All points doubled. Choose your star player.</p>
          </div>
          <div className="bg-gradient-to-br from-slate-500 to-slate-600 rounded-2xl p-4 text-white">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold opacity-80">Vice-Captain</span>
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">V</span>
            </div>
            <div className="text-3xl font-black">×1.5</div>
            <p className="text-[10px] opacity-80 mt-1">Points multiplied by 1.5. Your backup star.</p>
          </div>
        </div>

        {/* Example calc */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-2xl px-4 py-4">
          <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3">Captain example - Messi scores + assists</p>
          <div className="space-y-1.5">
            {[
              { label: 'Goal (FWD)',             pts: '+40' },
              { label: 'Shot on target',          pts: '+6'  },
              { label: 'Assist',                  pts: '+20' },
              { label: 'Starting XI',             pts: '+4'  },
              { label: '50 passes (×10 bonus)',   pts: '+10' },
            ].map(r => (
              <div key={r.label} className="flex justify-between text-xs text-amber-700 dark:text-amber-300">
                <span>{r.label}</span>
                <span className="font-semibold tabular-nums">{r.pts}</span>
              </div>
            ))}
            <div className="border-t border-amber-200 dark:border-amber-700/40 pt-2 flex justify-between text-xs">
              <span className="text-amber-700 dark:text-amber-300">Base total</span>
              <span className="font-bold text-amber-700 dark:text-amber-300 tabular-nums">80 pts</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-bold text-amber-700 dark:text-amber-400">×2 as Captain</span>
              <span className="font-black text-amber-600 dark:text-amber-400 tabular-nums">= 160 pts</span>
            </div>
          </div>
        </div>

        {/* ── Category filter tabs ─────────────────────────────────────────── */}
        <div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                activeTab === 'all'
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              All
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  activeTab === cat.id
                    ? `${cat.bg} ${cat.color} border ${cat.border}`
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scoring rows ─────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] overflow-hidden divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {filtered.map(row => {
            const isOpen = expandedRow === row.label
            const cat    = CATEGORIES.find(c => c.id === row.cat)!

            return (
              <div key={row.label}>
                <button
                  onClick={() => setExpandedRow(isOpen ? null : row.label)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  {/* Icon */}
                  <span className="text-xl w-7 text-center flex-shrink-0 leading-none">{row.icon}</span>

                  {/* Label + position badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{row.label}</span>
                      {row.position && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
                          {row.position}
                        </span>
                      )}
                    </div>
                    {/* Inline note preview when collapsed */}
                    {!isOpen && row.note && (
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">{row.note}</p>
                    )}
                  </div>

                  {/* Points + expand arrow */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-base font-black tabular-nums ${ptColor(row.pts)}`}>
                      {row.pts}
                    </span>
                    {row.note && (
                      <svg
                        width="12" height="12"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        className={`text-gray-300 dark:text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      >
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    )}
                  </div>
                </button>

                {/* Expanded note */}
                {isOpen && row.note && (
                  <div className={`px-4 pb-4 pt-1 mx-4 mb-3 rounded-xl text-xs text-gray-600 dark:text-gray-300 leading-relaxed ${cat.bg} border ${cat.border}`}>
                    {row.note}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Team selection rules ─────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Team rules</h2>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] overflow-hidden divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {[
              { icon: '🥅', label: 'Goalkeeper',            value: 'Exactly 1',    note: 'GK' },
              { icon: '🛡️', label: 'Defenders',             value: '3 - 5',        note: 'DEF' },
              { icon: '⚙️', label: 'Midfielders',           value: '3 - 5',        note: 'MID' },
              { icon: '⚡', label: 'Forwards',              value: '1 - 3',        note: 'FWD' },
              { icon: '👥', label: 'Total players',         value: '11',           note: '' },
              { icon: '💰', label: 'Budget',                value: '≤ 100 credits',note: '' },
              { icon: '🏳️', label: 'Max from one team',    value: '7 players',    note: '' },
            ].map(r => (
              <div key={r.label} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg w-6 text-center flex-shrink-0">{r.icon}</span>
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{r.label}</span>
                {r.note && (
                  <span className="text-[9px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{r.note}</span>
                )}
                <span className="text-sm font-bold text-pulse-600 dark:text-pulse-400 tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Important rules ──────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Important rules</h2>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.07] dark:border-white/[0.07] overflow-hidden divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {IMPORTANT_RULES.map((rule, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <span className="text-pulse-400 mt-0.5 flex-shrink-0 text-xs font-black">{String(i + 1).padStart(2, '0')}</span>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{rule}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How a match works timeline ───────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">How a match works</h2>
          <div className="relative pl-6">
            <div className="absolute left-[7px] top-1 bottom-8 w-px bg-gradient-to-b from-pulse-400 to-transparent" />
            {[
              { icon: '🔗', step: '1', title: 'Create a room',                body: 'Pick a match. Share your invite link with your opponent.' },
              { icon: '📋', step: '2', title: 'Lineups drop (≈1 hr before)',  body: 'Player selection opens once the official starting XI is announced. Pick 11 players, set your Captain and Vice-Captain.' },
              { icon: '🔒', step: '3', title: 'Picks lock at kick-off',       body: 'No changes once the whistle blows. Your team is set.' },
              { icon: '📡', step: '4', title: 'Live scoring every few mins',  body: 'Watch the points feed update as goals, cards, saves, and tackles roll in.' },
              { icon: '🏆', step: '5', title: 'Result at full time',          body: 'Final points are tallied after 90+ minutes. Highest total wins. Draws are possible.' },
            ].map((s, i) => (
              <div key={i} className="relative pb-6 last:pb-0">
                <div className="absolute -left-[17px] top-0 w-5 h-5 rounded-full bg-white dark:bg-gray-900 border-2 border-pulse-400 flex items-center justify-center text-[11px] font-black text-pulse-600">
                  {s.step}
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{s.title}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-pulse-600 to-indigo-600 rounded-2xl p-5 text-center text-white">
          <div className="text-3xl mb-2">⚡</div>
          <p className="text-sm font-bold mb-1">Ready to compete?</p>
          <p className="text-xs text-white/70 mb-4">Create a room, pick your team, score live.</p>
          <Link
            href="/fantasy"
            className="inline-flex items-center gap-1.5 bg-white text-pulse-700 text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Browse matches →
          </Link>
        </div>

      </div>
    </div>
  )
}
