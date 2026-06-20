/**
 * Run from the project root:
 *   node scripts/check-api.mjs
 *
 * What it checks:
 *   1. API quota / status
 *   2. WC 2026 official fixtures  (league=1, season=2026)
 *   3. International Friendlies   (league=10, season=2026) — pre-WC warm-ups
 *   4. Today's fixtures across both leagues
 */

import { readFileSync } from 'fs'

// ── Load .env.local ───────────────────────────────────────────────────────────
const envRaw = readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(
  envRaw.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map((p, i) => i === 0 ? p.trim() : p.trim()))
)
const KEY = env['APIFOOTBALL_KEY']
if (!KEY) { console.error('APIFOOTBALL_KEY not found in .env.local'); process.exit(1) }

const BASE = 'https://v3.football.api-sports.io'
const H = { 'x-apisports-key': KEY }
const get = async (path) => {
  const r = await fetch(`${BASE}${path}`, { headers: H })
  return r.json()
}

const today = new Date().toISOString().slice(0, 10)

console.log('='.repeat(60))
console.log('API-Football sanity check  —  today:', today)
console.log('='.repeat(60))

// ── 1. Status ─────────────────────────────────────────────────────────────────
{
  const d = await get('/status')
  const s = d?.response
  console.log('\n[1] Account status')
  console.log('    Plan       :', s?.account?.plan ?? 'unknown')
  console.log('    Requests   : used', s?.requests?.current, '/ limit', s?.requests?.limit_day)
  console.log('    Remaining  :', (s?.requests?.limit_day ?? 0) - (s?.requests?.current ?? 0))
}

// ── 2. WC 2026 official fixtures (league 1) ───────────────────────────────────
{
  const d = await get(`/fixtures?league=1&season=2026`)
  const fixtures = d?.response ?? []
  const statuses = {}
  fixtures.forEach(f => {
    const s = f.fixture.status.short
    statuses[s] = (statuses[s] ?? 0) + 1
  })
  const upcoming = fixtures.filter(f => f.fixture.status.short === 'NS')
  const next3 = upcoming
    .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
    .slice(0, 3)

  console.log('\n[2] WC 2026 official fixtures (league=1)')
  console.log('    Total      :', fixtures.length)
  console.log('    By status  :', JSON.stringify(statuses))
  console.log('    Next 3     :')
  next3.forEach(f => console.log(
    `      ${f.fixture.date.slice(0,10)}  ${f.teams.home.name} vs ${f.teams.away.name}  [${f.league.round}]`
  ))
  if (fixtures.length === 0) console.log('    ⚠  No data returned — may not be live yet in API')
}

// ── 3. International Friendlies 2026 (league 10) ─────────────────────────────
{
  const d = await get(`/fixtures?league=10&season=2026`)
  const fixtures = d?.response ?? []

  // Filter to WC-qualified nations only (rough list)
  const WC_TEAMS = [
    'argentina','brazil','france','england','germany','spain','portugal','netherlands',
    'usa','united states','mexico','morocco','japan','south korea','australia',
    'senegal','croatia','switzerland','poland','denmark','serbia','iran',
    'ghana','cameroon','ecuador','qatar','wales','canada','saudi arabia',
    'tunisia','costa rica','south korea'
  ]
  const wcFriendlies = fixtures.filter(f => {
    const h = f.teams.home.name.toLowerCase()
    const a = f.teams.away.name.toLowerCase()
    return WC_TEAMS.some(t => h.includes(t) || a.includes(t))
  })

  const statuses = {}
  wcFriendlies.forEach(f => {
    const s = f.fixture.status.short
    statuses[s] = (statuses[s] ?? 0) + 1
  })

  const recent = wcFriendlies
    .filter(f => ['NS','1H','2H','HT','FT','AET','PEN'].includes(f.fixture.status.short))
    .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))
    .slice(0, 8)

  console.log('\n[3] International Friendlies 2026 (league=10) — WC teams')
  console.log('    Total all  :', fixtures.length)
  console.log('    WC teams   :', wcFriendlies.length)
  console.log('    By status  :', JSON.stringify(statuses))
  console.log('    Recent 8   :')
  recent.forEach(f => console.log(
    `      ${f.fixture.date.slice(0,10)}  ${f.teams.home.name} vs ${f.teams.away.name}  [${f.fixture.status.short}]  id:${f.fixture.id}`
  ))
  if (fixtures.length === 0) console.log('    ⚠  No data returned for league=10')
}

// ── 4. Today's fixtures across both leagues ───────────────────────────────────
{
  const d = await get(`/fixtures?date=${today}`)
  const all = d?.response ?? []
  const wcOrFriendly = all.filter(f => f.league.id === 1 || f.league.id === 10)

  console.log(`\n[4] Today's fixtures (${today}) — leagues 1 + 10`)
  if (wcOrFriendly.length === 0) {
    console.log('    None scheduled today in these leagues')
    // Show any live national team games
    const nationals = all.filter(f => f.league.type === 'International' || f.league.country?.name === 'World')
    console.log('    Other international today:', nationals.length)
    nationals.slice(0, 5).forEach(f => console.log(
      `      [L${f.league.id}] ${f.teams.home.name} vs ${f.teams.away.name}  ${f.fixture.status.short}`
    ))
  } else {
    wcOrFriendly.forEach(f => console.log(
      `      [L${f.league.id}] ${f.fixture.date.slice(11,16)}  ${f.teams.home.name} vs ${f.teams.away.name}  ${f.fixture.status.short}`
    ))
  }
}

// ── 5. Check if there's a dedicated "WC Friendly" league ─────────────────────
{
  const d = await get(`/leagues?search=friendly`)
  const intl = (d?.response ?? []).filter(l =>
    l.league.type === 'Friendly' ||
    l.country?.name === 'World' ||
    l.league.name?.toLowerCase().includes('world') ||
    l.league.name?.toLowerCase().includes('international')
  )
  console.log('\n[5] Friendly leagues for international / world')
  intl.slice(0, 10).forEach(l => console.log(
    `    ID:${l.league.id}  ${l.league.name}  (${l.country?.name ?? '?'})  type:${l.league.type}`
  ))
}

console.log('\n' + '='.repeat(60))
console.log('Done. Check sections [3] and [5] for friendly data.')
console.log('If [3] has data → wire league=10 into the fixtures page.')
console.log('If [3] is empty → friendly data not covered by free plan.')
console.log('='.repeat(60))
