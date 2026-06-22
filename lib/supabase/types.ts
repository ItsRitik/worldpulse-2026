// WC26 Fantasy XI - Supabase Database Types
// Matches supabase/schema.sql exactly.
// Run `npx supabase gen types typescript --project-id hggskmhczggjtxfubacl > lib/supabase/types.ts`
// to regenerate after schema changes.

// ── Enums ─────────────────────────────────────────────────────────────────────
export type Position   = 'GK' | 'DEF' | 'MID' | 'FWD'
export type PickRole   = 'captain' | 'vice_captain' | 'player'
export type RoomStatus = 'waiting' | 'locked' | 'live' | 'finished' | 'cancelled'

// ── Entity types ──────────────────────────────────────────────────────────────

export type UserProfile = {
  id:            string          // uuid - same as auth.users.id
  display_name:  string | null
  fav_team_tla:  string | null   // 3-letter code e.g. 'BRA'
  phone:         string | null
  avatar_url:    string | null
  created_at:    string
  updated_at:    string
}

export type FantasyRoom = {
  id:             string          // uuid
  match_id:       string          // API-Football fixture id
  match_label:    string          // "Brazil vs Argentina"
  home_team_tla:  string
  away_team_tla:  string
  kickoff_at:     string          // ISO datetime
  lock_at:        string          // = kickoff
  host_id:        string          // creator - auth.users.id
  guest_id:       string | null   // legacy (1v1)
  room_code:      string          // short join code, e.g. "GHX7Q2"
  max_players:    number          // capacity (default 100)
  status:         RoomStatus
  host_points:    number | null   // legacy
  guest_points:   number | null   // legacy
  winner_id:      string | null   // top of the leaderboard at FT
  created_at:     string
  updated_at:     string
}

/** One participant in a contest room */
export type FantasyRoomMember = {
  room_id:      string
  user_id:      string
  is_host:      boolean
  total_points: number | null
  rank:         number | null
  joined_at:    string
}

export type FantasyPick = {
  id:             number
  room_id:        string
  user_id:        string
  // Player snapshot - stored inline, no FK to a players table
  api_player_id:  number
  player_name:    string
  player_short:   string
  team_tla:       string
  position:       Position
  jersey_number:  number | null
  price:          number
  // Role
  role:           PickRole
  // Points (null until match finishes)
  base_points:    number | null
  multiplier:     number | null   // 2.0 | 1.5 | 1.0
  total_points:   number | null
  created_at:     string
  updated_at:     string
}

export type LiveEvent = {
  player_name:  string
  team_tla:     string
  event_type:   string
  minute:       number
  points:       number
}

export type FantasyLiveState = {
  room_id:       string
  match_minute:  number | null
  match_status:  string | null    // 'IN_PLAY' | 'PAUSED' | 'FINISHED'
  home_score:    number
  away_score:    number
  host_points:   number
  guest_points:  number
  last_event:    LiveEvent | null
  events:        LiveEvent[]
  updated_at:    string
}

// ── Supabase Database type (used to type the client) ──────────────────────────
export type Database = {
  public: {
    Views:     Record<never, never>
    Functions: {
      validate_picks: {
        Args:    { p_room_id: string; p_user_id: string }
        Returns: { valid: boolean; error?: string }
      }
    }
    Enums: {
      position_type: Position
      pick_role:     PickRole
      room_status:   RoomStatus
    }
    Tables: {
      user_profiles: {
        Row:           UserProfile
        Insert:        Omit<UserProfile, 'created_at' | 'updated_at'>
        Update:        Partial<Omit<UserProfile, 'id'>>
        Relationships: []
      }
      fantasy_rooms: {
        Row:           FantasyRoom
        Insert:        Omit<FantasyRoom, 'id' | 'created_at' | 'updated_at' | 'host_points' | 'guest_points' | 'winner_id'>
        Update:        Partial<Omit<FantasyRoom, 'id'>>
        Relationships: []
      }
      fantasy_picks: {
        Row:           FantasyPick
        Insert:        Omit<FantasyPick, 'id' | 'created_at' | 'updated_at' | 'base_points' | 'multiplier' | 'total_points'>
        Update:        Partial<Omit<FantasyPick, 'id' | 'room_id' | 'user_id'>>
        Relationships: []
      }
      fantasy_live_state: {
        Row:           FantasyLiveState
        Insert:        Omit<FantasyLiveState, 'updated_at'>
        Update:        Partial<Omit<FantasyLiveState, 'room_id'>>
        Relationships: []
      }
      fantasy_room_members: {
        Row:           FantasyRoomMember
        Insert:        Omit<FantasyRoomMember, 'total_points' | 'rank' | 'joined_at'> & { total_points?: number | null; rank?: number | null }
        Update:        Partial<FantasyRoomMember>
        Relationships: []
      }
    }
  }
}

// ── Convenience join types ────────────────────────────────────────────────────

/** A room with both participants' profile info joined */
export type RoomWithProfiles = FantasyRoom & {
  host:  UserProfile | null
  guest: UserProfile | null
}

/** A pick with the user's profile joined */
export type PickWithProfile = FantasyPick & {
  profile: UserProfile | null
}
