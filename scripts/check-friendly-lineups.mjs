/**
 * Run: node scripts/check-friendly-lineups.mjs
 *
 * Checks API-Football lineup availability for friendly fixtures.
 * - Fetches all league=10, season=2026 fixtures
 * - Groups by status (live / upcoming / finished)
 * - For live + recently finished: fetches /fixtures/lineups and reports what's available
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
try {
  const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* no .env.local */ }

const KEY = process.env.APIFOOTBALL_KEY
if (!KEY) { console.error('❌  APIFOOTBALL_KEY not set'); process.exit(1) }

const BASE = 'https://v3.football.api-sports.io'
const h = { 'x-apisports-key': KEY, 'Accept': 'application/json' }

async function get(path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  const r = await fetch(url.toString(), { headers: h, cache: 'no-store' })
  const j = await r.json()
  if (j.errors && Object.keys(j.errors).length > 0) throw new Error(JSON.stringify(j.errors))
  return j.response
}

const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'INT', 'LIVE'])
const DONE = new Set(['FT', 'AET', 'PEN'])

async function main() {
  console.log('\n──────────────────────────────────────────')
  console.log(' Friendly Lineup Check  (league=10, 2026)')
  console.log('──────────────────────────────────────────\n')

  const fixtures = await get('/fixtures', { league: 10, season: 2026 })
  console.log(`Total league=10 fixtures fetched: ${fixtures.length}\n`)

  const live     = fixtures.filter(f => LIVE.has(f.fixture.status.short))
  const upcoming = fixtures.filter(f => f.fixture.status.short === 'NS')
  const done     = fixtures.filter(f => DONE.has(f.fixture.status.short))

  console.log(`  Live:     ${live.length}`)
  console.log(`  Upcoming: ${upcoming.length}`)
  console.log(`  Finished: ${done.length}`)

  // Check lineups for up to 3 live fixtures
  if (live.length > 0) {
    console.log('\n━━━ LIVE fixtures — lineup check ━━━')
    for (const f of live.slice(0, 3)) {
      const id = f.fixture.id
      const label = `${f.teams.home.name} vs ${f.teams.away.name}`
      const status = f.fixture.status.short
      const elapsed = f.fixture.status.elapsed ?? '?'
      console.log(`\n  ${label}  [${status} ${elapsed}']  id=${id}`)
      try {
        const lineups = await get('/fixtures/lineups', { fixture: id })
        if (!lineups || lineups.length === 0) {
          console.log('    ⚠️  No lineup data returned at all')
        } else {
          for (const team of lineups) {
            const xi = team.startXI?.length ?? 0
            const subs = team.substitutes?.length ?? 0
            const hasPhoto = team.startXI?.[0]?.player?.photo ? '✅ photo' : '❌ no photo field'
            console.log(`    ${team.team.name}: startXI=${xi}  subs=${subs}  ${hasPhoto}`)
            if (xi > 0) {
              console.log(`    Sample player:`, JSON.stringify(team.startXI[0].player))
            }
          }
        }
      } catch (e) {
        console.log(`    ❌ Error: ${e.message}`)
      }
      await new Promise(r => setTimeout(r, 400)) // rate limit
    }
  }

  // Check a few recently finished fixtures
  const recentDone = done
    .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))
    .slice(0, 2)

  if (recentDone.length > 0) {
    console.log('\n━━━ Recent FINISHED fixtures — lineup check ━━━')
    for (const f of recentDone) {
      const id = f.fixture.id
      const label = `${f.teams.home.name} vs ${f.teams.away.name}`
      const date = f.fixture.date.slice(0, 10)
      const score = `${f.goals.home ?? '?'}-${f.goals.away ?? '?'}`
      console.log(`\n  ${label}  ${score}  (${date})  id=${id}`)
      try {
        const lineups = await get('/fixtures/lineups', { fixture: id })
        if (!lineups || lineups.length === 0) {
          console.log('    ⚠️  No lineup data returned')
        } else {
          for (const team of lineups) {
            const xi = team.startXI?.length ?? 0
            const subs = team.substitutes?.length ?? 0
            const hasPhoto = team.startXI?.[0]?.player?.photo ? '✅ photo' : '❌ no photo field'
            console.log(`    ${team.team.name}: startXI=${xi}  subs=${subs}  ${hasPhoto}`)
          }
        }
      } catch (e) {
        console.log(`    ❌ Error: ${e.message}`)
      }
      await new Promise(r => setTimeout(r, 400))
    }
  }

  // Check an upcoming friendly to see what the pre-match lineup state looks like
  const soon = upcoming
    .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
    .slice(0, 2)

  if (soon.length > 0) {
    console.log('\n━━━ Next UPCOMING friendlies — lineup check ━━━')
    for (const f of soon) {
      const id = f.fixture.id
      const label = `${f.teams.home.name} vs ${f.teams.away.name}`
      const kickoff = new Date(f.fixture.date).toLocaleString('en-GB', { timeZone: 'UTC' })
      const hoursAway = ((new Date(f.fixture.date) - Date.now()) / 3_600_000).toFixed(1)
      console.log(`\n  ${label}  KO: ${kickoff} UTC  (in ${hoursAway}h)  id=${id}`)
      try {
        const lineups = await get('/fixtures/lineups', { fixture: id })
        if (!lineups || lineups.length === 0) {
          console.log('    ℹ️  No lineup data yet (expected — not announced)')
        } else {
          for (const team of lineups) {
            const xi = team.startXI?.length ?? 0
            console.log(`    ${team.team.name}: startXI=${xi}`)
          }
        }
      } catch (e) {
        console.log(`    ❌ Error: ${e.message}`)
      }
      await new Promise(r => setTimeout(r, 400))
    }
  }

  console.log('\n──────────────────────────────────────────')
  console.log(' Done.')
  console.log('──────────────────────────────────────────\n')
}

main().catch(console.error)
