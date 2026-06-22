'use client'

/**
 * OnboardingGate - blocking modal shown after login until the profile is complete.
 * Two mandatory steps, both saved to user_profiles:
 *   1. unique manager name (display_name)
 *   2. favourite World Cup team (fav_team_tla)
 *
 * Mounted globally in the root layout, so it gates the whole app (dashboard
 * included) the moment a logged-in user has an incomplete profile.
 */

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import clsx from 'clsx'
import { useAuth } from '@/lib/hooks/useAuth'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json
}

type WCTeam = { id: number; name: string; tla: string; logo: string }

export function OnboardingGate() {
  const { user, loading: authLoading } = useAuth()

  // Profile completeness - only fetched once we have a user
  const { data: prof, mutate } = useSWR<{ complete: boolean; profile: { display_name?: string; fav_team_tla?: string } | null }>(
    user ? '/api/profile' : null, fetcher, { revalidateOnFocus: false },
  )

  const needsOnboarding = !!user && prof !== undefined && !prof.complete

  // ── Form state ──
  const [step, setStep]   = useState<1 | 2>(1)
  const [name, setName]   = useState('')
  const [team, setTeam]   = useState<WCTeam | null>(null)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Prefill a partial profile (e.g. name set, team missing)
  useEffect(() => {
    if (prof?.profile?.display_name && !name) setName(prof.profile.display_name)
    if (prof?.profile?.display_name && !prof.profile?.fav_team_tla) setStep(2)
  }, [prof]) // eslint-disable-line react-hooks/exhaustive-deps

  // Teams - only loaded when the gate is actually open
  const { data: teamsData } = useSWR<{ teams: WCTeam[] }>(
    needsOnboarding ? '/api/wc/teams' : null, fetcher, { revalidateOnFocus: false },
  )
  const teams = teamsData?.teams ?? []
  const filtered = query
    ? teams.filter(t => t.name.toLowerCase().includes(query.toLowerCase()))
    : teams

  if (!needsOnboarding || authLoading) return null

  async function submit() {
    if (saving || !team) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name.trim(), fav_team_tla: team.tla }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Could not save')
      await mutate()   // re-fetch profile → complete → gate closes
    } catch (e: any) {
      setError(e.message)
      // a name clash is a step-1 problem - send them back
      if (/taken|character/i.test(e.message)) setStep(1)
      setSaving(false)
    }
  }

  const nameValid = name.trim().length >= 3 && name.trim().length <= 16

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-black/[0.08] dark:border-white/[0.08] shadow-xl overflow-hidden">

        {/* Progress header */}
        <div className="px-6 pt-5 pb-4 border-b border-black/[0.05] dark:border-white/[0.05]">
          <div className="flex items-center gap-2 mb-3">
            {[1, 2].map(n => (
              <div key={n} className={clsx(
                'h-1 flex-1 rounded-full transition-colors',
                step >= n ? 'bg-pulse-500' : 'bg-gray-200 dark:bg-gray-700'
              )} />
            ))}
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {step === 1 ? 'Choose your manager name' : 'Pick your team'}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {step === 1
              ? 'This is how opponents see you. It must be unique.'
              : 'Your favourite nation in the World Cup. You can only set this once.'}
          </p>
        </div>

        {/* Step 1 - name */}
        {step === 1 && (
          <div className="p-6">
            <input
              autoFocus
              value={name}
              onChange={e => { setName(e.target.value); setError(null) }}
              onKeyDown={e => { if (e.key === 'Enter' && nameValid) setStep(2) }}
              maxLength={16}
              placeholder="e.g. RitikTheGreat"
              className="w-full h-11 px-4 rounded-xl border border-black/[0.1] dark:border-white/[0.1] bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-pulse-400"
            />
            <p className="text-[10px] text-gray-400 mt-2">3 to 16 characters: letters, numbers, spaces, _ . -</p>
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            <button
              onClick={() => nameValid && setStep(2)}
              disabled={!nameValid}
              className={clsx(
                'mt-4 w-full h-11 rounded-xl text-sm font-semibold transition-colors',
                nameValid ? 'bg-pulse-600 hover:bg-pulse-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              )}
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2 - team */}
        {step === 2 && (
          <div className="p-6">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search teams"
              className="w-full h-10 px-4 mb-3 rounded-xl border border-black/[0.1] dark:border-white/[0.1] bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-pulse-400"
            />
            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
              {teams.length === 0 && (
                <div className="col-span-3 py-8 text-center text-xs text-gray-400">Loading teams…</div>
              )}
              {filtered.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTeam(t)}
                  className={clsx(
                    'flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-colors',
                    team?.id === t.id
                      ? 'border-pulse-400 bg-pulse-50 dark:bg-pulse-900/20'
                      : 'border-black/[0.06] dark:border-white/[0.06] hover:border-pulse-300'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.logo} alt="" width={28} height={28} className="w-7 h-7 object-contain" loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
                  <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300 text-center leading-tight truncate w-full">
                    {t.name}
                  </span>
                </button>
              ))}
            </div>

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setStep(1)}
                className="h-11 px-4 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Back
              </button>
              <button
                onClick={submit}
                disabled={saving || !team}
                className={clsx(
                  'flex-1 h-11 rounded-xl text-sm font-semibold transition-colors',
                  saving || !team ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed' : 'bg-pulse-600 hover:bg-pulse-700 text-white'
                )}
              >
                {saving ? 'Saving…' : team ? `Play as ${name.trim()}` : 'Pick a team'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
