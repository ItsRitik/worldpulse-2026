# WorldPulse 2026 🌍

Real-time fan sentiment, AI match predictions, and tactical intelligence for FIFA World Cup 2026.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment (optional — app runs in mock mode without keys)
cp .env.local.example .env.local

# 3. Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — live matches, sentiment overview, navigation |
| `/pulse` | Fan sentiment globe — real-time mood map by country |
| `/predict` | AI match predictor — probabilities + live Claude reasoning |
| `/tactical` | Tactical DNA — D3 radar chart team comparison |

---

## API Keys (all optional — mock mode works without them)

### 1. Anthropic API (AI reasoning)
- Get key: https://console.anthropic.com
- Add to `.env.local`: `ANTHROPIC_API_KEY=sk-ant-...`
- Powers: Live AI match analysis on `/predict`

### 2. Football-data.org (live scores)
- Free tier: https://www.football-data.org/ — register for a free key
- Add to `.env.local`: `FOOTBALL_DATA_API_KEY=your_key`
- Powers: Live scores, fixtures, team data

### 3. Mapbox (3D globe)
- Free tier (generous): https://account.mapbox.com
- Add to `.env.local`: `NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...`
- Powers: Interactive 3D rotating sentiment globe on `/pulse`
- Without it: Falls back to a country grid card view

### 4. Reddit API (fan sentiment)
- Register app: https://www.reddit.com/prefs/apps
- Add to `.env.local`: `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET`
- Powers: Real fan reactions from r/soccer, r/worldcup, team subreddits

---

## Project structure

```
worldpulse-2026/
├── app/
│   ├── layout.tsx              # Root layout + Navbar
│   ├── page.tsx                # Home dashboard
│   ├── globals.css             # Design tokens + animations
│   ├── pulse/page.tsx          # Fan sentiment globe
│   ├── predict/page.tsx        # Match predictor
│   ├── tactical/page.tsx       # Tactical DNA explorer
│   └── api/
│       ├── matches/route.ts    # Live scores (football-data.org)
│       └── predict/route.ts    # Claude AI streaming analysis
├── components/
│   ├── nav/Navbar.tsx          # Top nav with live ticker
│   ├── globe/
│   │   ├── SentimentGlobe.tsx  # Mapbox GL globe
│   │   └── ReactionFeed.tsx    # Live reaction stream
│   ├── predictor/
│   │   └── AIReasoning.tsx     # Streaming AI text component
│   └── shared/
│       ├── MatchCard.tsx       # Reusable match card
│       └── SentimentBadge.tsx  # Mood badge pill
├── data/mock/
│   ├── matches.ts              # 6 sample matches (inc. 2 live)
│   ├── teams.ts                # 16 WC 2026 teams
│   ├── sentiment.ts            # 18 country sentiment profiles
│   └── tactical.ts             # 7 team tactical profiles
└── lib/
    └── types/index.ts          # All TypeScript types
```

---

## Tech stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Map**: Mapbox GL + react-map-gl
- **Charts**: D3.js (tactical radar), Recharts
- **AI**: Anthropic Claude (claude-haiku — fast + cheap for streaming)
- **Animations**: CSS keyframes + Framer Motion
- **Data**: football-data.org (free tier), Reddit API, mock data fallback
- **Deploy**: Vercel (zero config)

---

## Deployment (Vercel)

```bash
npm i -g vercel
vercel
```

Add your env vars in the Vercel dashboard under Settings → Environment Variables.

---

## Next features to build

- [ ] Share card generator (Canvas API → OG image per match)
- [ ] Reddit sentiment pipeline (real-time subreddit scraping)
- [ ] Push notifications for goal alerts
- [ ] Bracket simulator with Monte Carlo AI
- [ ] Player intelligence profiles
- [ ] VAR controversy tracker
