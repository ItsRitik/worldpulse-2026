import { NextResponse } from 'next/server'

export const revalidate = 300   // cache 5 min

// ── RSS sources ───────────────────────────────────────────────────────────────
const FEEDS = [
  {
    name: 'BBC Sport',
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    icon: '🔴',
  },
  {
    name: 'ESPN FC',
    url: 'https://www.espn.com/espn/rss/soccer/news',
    icon: '🟠',
  },
  {
    name: 'Goal.com',
    url: 'https://www.goal.com/feeds/en/news',
    icon: '⚽',
  },
  {
    name: 'Sky Sports',
    url: 'https://www.skysports.com/rss/12040',
    icon: '🔵',
  },
  {
    name: 'The Guardian',
    url: 'https://www.theguardian.com/football/rss',
    icon: '🟣',
  },
]

// World Cup 2026 keywords - item must match at least one
const WC_KEYWORDS = [
  'world cup', 'worldcup', 'fifa', 'wc2026', 'wc 2026',
  'world cup 2026', 'copa del mundo',
  'messi', 'ronaldo', 'mbappé', 'mbappe', 'neymar', 'vinicius',
  'argentina', 'brazil', 'france', 'england', 'germany', 'spain',
  'usa', 'mexico', 'morocco', 'portugal', 'netherlands',
  'group stage', 'knockout', 'quarter-final', 'semi-final',
  'metlife', 'sofi stadium', 'rose bowl', 'azteca',
]

export interface NewsItem {
  id: string
  title: string
  link: string
  description: string
  source: string
  icon: string
  pubDate: string        // ISO string
  isHot: boolean         // published < 30 min ago
  category?: string
  image?: string         // article thumbnail from the feed, when available
}

// ── XML helpers ───────────────────────────────────────────────────────────────
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')
  return (xml.match(re)?.[1] ?? '').trim()
}

function extractItems(xml: string): string[] {
  const items: string[] = []
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) items.push(m[1])
  return items
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g,         (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&hellip;/gi, '…')
    .replace(/&mdash;/gi, '-')
    .replace(/&ndash;/gi, '-')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')   // last, so &amp;lt; → &lt; → < on the next pass
}

function cleanHtml(s: string): string {
  let t = s
  // Two passes handle feeds (e.g. Guardian) that double-encode their HTML:
  // decode entities, strip tags, repeat - then collapse whitespace.
  for (let i = 0; i < 2; i++) {
    t = decodeEntities(t).replace(/<[^>]+>/g, ' ')
  }
  return t.replace(/\s+/g, ' ').trim()
}

/**
 * Pull an article image out of an RSS <item>. Feeds differ:
 *   BBC / Sky      → <media:thumbnail url="…">
 *   Guardian       → <media:content url="…"> (multiple sizes, take largest)
 *   ESPN / Goal    → <enclosure url="…"> or an <img src> inside description
 */
function extractImage(raw: string): string | undefined {
  const fromAttr = (re: RegExp) => {
    let best: string | undefined
    let m: RegExpExecArray | null
    const g = new RegExp(re.source, 'gi')
    while ((m = g.exec(raw)) !== null) best = m[1]   // last match tends to be largest
    return best
  }
  const url =
    fromAttr(/<media:content[^>]+url="([^"]+)"/) ??
    fromAttr(/<media:thumbnail[^>]+url="([^"]+)"/) ??
    fromAttr(/<enclosure[^>]+url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/) ??
    fromAttr(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpe?g|png|webp)[^"]*)"/)
  if (!url) return undefined
  return url.replace(/&amp;/g, '&')
}

function matchesWC(text: string): boolean {
  const lower = text.toLowerCase()
  return WC_KEYWORDS.some(kw => lower.includes(kw))
}

async function fetchFeed(feed: typeof FEEDS[0]): Promise<NewsItem[]> {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': 'WC26FantasyXI/1.0 (+https://wc26fantasyxi.app)' },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`${feed.name}: HTTP ${res.status}`)

  const xml = await res.text()
  const rawItems = extractItems(xml)

  const now = Date.now()
  const items: NewsItem[] = []

  for (const raw of rawItems.slice(0, 30)) {
    const title       = cleanHtml(extractTag(raw, 'title'))
    const link        = cleanHtml(extractTag(raw, 'link') || extractTag(raw, 'guid'))
    const description = cleanHtml(extractTag(raw, 'description')).slice(0, 200)
    const pubDateRaw  = extractTag(raw, 'pubDate') || extractTag(raw, 'dc:date') || extractTag(raw, 'published')
    const category    = cleanHtml(extractTag(raw, 'category'))
    const image       = extractImage(raw)

    if (!title || !link) continue

    // Filter: only WC-related items
    if (!matchesWC(title + ' ' + description)) continue

    const pubDate  = pubDateRaw ? new Date(pubDateRaw).toISOString() : new Date().toISOString()
    const ageMs    = now - new Date(pubDate).getTime()
    const isHot    = ageMs < 30 * 60 * 1000  // < 30 minutes

    items.push({
      id:          Buffer.from(link).toString('base64').slice(0, 16),
      title,
      link,
      description,
      source:      feed.name,
      icon:        feed.icon,
      pubDate,
      isHot,
      category:    category || undefined,
      image,
    })
  }

  return items
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET() {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed))

  const all: NewsItem[] = []
  const errors: string[] = []

  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value)
    else errors.push(String(r.reason))
  }

  if (all.length === 0) {
    return NextResponse.json(
      { error: 'No news items fetched. ' + errors.join(' | '), items: [], timestamp: new Date().toISOString() },
      { status: 502 }
    )
  }

  // De-dupe by title similarity, sort newest first
  const seen = new Set<string>()
  const deduped = all
    .filter(item => {
      const key = item.title.toLowerCase().slice(0, 60)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 20)

  return NextResponse.json({
    items: deduped,
    sources: FEEDS.map(f => f.name),
    fetchErrors: errors.length ? errors : undefined,
    timestamp: new Date().toISOString(),
  })
}
