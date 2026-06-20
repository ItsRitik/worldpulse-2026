import { redirect } from 'next/navigation'

// Real win/draw/loss predictions (from API-Football) live on each
// fixture's detail page — tap any match on /fixtures.
export default function PredictPage() { redirect('/fixtures') }
