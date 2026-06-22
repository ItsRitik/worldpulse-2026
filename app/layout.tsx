import type { Metadata } from 'next'
import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import { Navbar } from '@/components/nav/Navbar'
import { OnboardingGate } from '@/components/auth/OnboardingGate'

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  ),
  title: 'WC26 Fantasy XI - FIFA World Cup 2026 Fantasy',
  description: 'Pick your 11, challenge a friend, score live - match-wise fantasy for the FIFA World Cup 2026.',
  openGraph: {
    title: 'WC26 Fantasy XI · World Cup 2026 Fantasy',
    description: 'Pick your 11, challenge a friend, score live.',
    // og:image is provided automatically by app/opengraph-image.tsx
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider signInUrl="/fantasy/login" signUpUrl="/fantasy/signup">
      <html lang="en">
        <body className="min-h-screen bg-gray-50 dark:bg-gray-950">
          <Navbar />
          <main className="pt-14">
            {children}
          </main>
          <OnboardingGate />
        </body>
      </html>
    </ClerkProvider>
  )
}
