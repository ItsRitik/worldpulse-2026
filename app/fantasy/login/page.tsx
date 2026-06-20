'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SignIn } from '@clerk/nextjs'

/**
 * Login — Clerk's prebuilt sign-in. Email code + (any social providers you
 * enable in the Clerk dashboard) work out of the box, no template wrangling.
 * `routing="hash"` keeps it on this single route (no catch-all needed).
 */
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center pt-14">
        <div className="w-6 h-6 rounded-full border-2 border-pulse-400 border-t-transparent animate-spin" />
      </div>
    }>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const params = useSearchParams()
  const next   = params.get('next') ?? '/'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-pulse-600 mb-4">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M2 12h20"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">WC26 Fantasy <span className="text-pulse-600">XI</span></h1>
        <p className="text-sm text-gray-400 mt-1.5">Sign in to play fantasy contests</p>
      </div>

      <SignIn
        routing="hash"
        signUpUrl="/fantasy/signup"
        forceRedirectUrl={next}
        fallbackRedirectUrl={next}
        appearance={{
          elements: {
            rootBox: 'w-full max-w-sm',
            card: 'shadow-sm border border-black/[0.08] dark:border-white/[0.08]',
          },
        }}
      />
    </div>
  )
}
