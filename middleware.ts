import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Pages that require a signed-in user. Everything else (dashboard, fixtures,
// public room views, the scoring/cron API) stays open. Pages also guard
// themselves client-side, so this is just an extra redirect for the obvious ones.
const isProtected = createRouteMatcher([
  '/fantasy/room/create',
  '/fantasy/room/(.*)/pick',
])

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) {
    const { userId } = await auth()
    if (!userId) {
      const url = new URL('/fantasy/login', req.url)
      url.searchParams.set('next', req.nextUrl.pathname)
      return NextResponse.redirect(url)
    }
  }
})

export const config = {
  matcher: [
    // Run on app routes (skip static assets), and always on API routes
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
