/**
 * teamTla - 3-letter code for a national team name.
 * Shared by client cards and server scoring/lineup routes so the
 * `team_tla` stored on picks always matches what the scorer writes.
 */

const TLA_MAP: Record<string, string> = {
  'United States': 'USA',
  'South Korea': 'KOR',
  'Korea Republic': 'KOR',
  'Saudi Arabia': 'KSA',
  'South Africa': 'RSA',
  'Costa Rica': 'CRC',
  'New Zealand': 'NZL',
  'Bosnia and Herzegovina': 'BIH',
  'Bosnia & Herzegovina': 'BIH',
  'Czech Republic': 'CZE',
  'Trinidad and Tobago': 'TRI',
  'United Arab Emirates': 'UAE',
  'Dominican Republic': 'DOM',
  'Ivory Coast': 'CIV',
  "Cote d'Ivoire": 'CIV',
  'Cape Verde Islands': 'CPV',
  'Cape Verde': 'CPV',
}

export function teamTla(name: string): string {
  return TLA_MAP[name] ?? name.slice(0, 3).toUpperCase()
}
