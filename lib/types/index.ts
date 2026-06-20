// ── Match types ─────────────────────────────────────────────────────────────

export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'FINISHED' | 'POSTPONED'

export interface Team {
  id: number
  name: string
  shortName: string
  code: string
  flag: string          // emoji flag
  crest?: string        // URL to crest image
  group: string
  record: { w: number; d: number; l: number }
  form: ('W' | 'D' | 'L')[]
}

export interface MatchScore {
  home: number | null
  away: number | null
  minute?: number
}

export interface Match {
  id: number
  homeTeam: Team
  awayTeam: Team
  score: MatchScore
  status: MatchStatus
  stage: string         // 'Group Stage' | 'Round of 32' | 'Quarter-final' etc
  group?: string
  date: string          // ISO string
  venue: string
  city: string
}

// ── Prediction types ─────────────────────────────────────────────────────────

export interface Prediction {
  matchId: number
  homeWinProbability: number   // 0–100
  drawProbability: number
  awayWinProbability: number
  confidence: number           // 0–100 — how sure the AI is
  reasoning: string            // streaming AI text
  keyFactors: string[]
  xgHome: number
  xgAway: number
  lastUpdated: string
}

// ── Sentiment types ──────────────────────────────────────────────────────────

export type SentimentMood = 'joy' | 'hype' | 'tense' | 'shock' | 'neutral'

export interface CountrySentiment {
  countryCode: string          // ISO 3166-1 alpha-2
  countryName: string
  flag: string
  teamCode?: string            // if country has a team in the tournament
  mood: SentimentMood
  score: number                // -100 to +100
  volume: number               // posts/mentions per minute
  topReaction: string          // short text snippet
  lat: number
  lng: number
}

export interface ReactionItem {
  id: string
  countryCode: string
  countryName: string
  flag: string
  text: string
  mood: SentimentMood
  timestamp: string
  matchId?: number
}

// ── Tactical types ───────────────────────────────────────────────────────────

export interface TacticalProfile {
  teamCode: string
  pressing: number             // 0–10
  buildUp: number
  setPieces: number
  defensiveLine: number
  transitionSpeed: number
  possession: number
  aerialDuels: number
  xgPerGame: number
  summary: string
}

// ── API response wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  source: 'live' | 'mock'
  timestamp: string
}

// ── Fantasy 1v1 ───────────────────────────────────────────────────────────────

/** A pickable player for a match — served by /api/wc/lineups/[fixtureId] */
export type LineupPlayer = {
  id:            number          // = api_player_id (stable UI key)
  match_id:      string
  api_player_id: number
  name:          string
  team_tla:      string
  position:      'GK' | 'DEF' | 'MID' | 'FWD'
  jersey_number: number | null
  price:         number
  is_starter?:   boolean
  photo?:        string          // media.api-sports.io player headshot
  team_logo?:    string          // media.api-sports.io team crest
}
