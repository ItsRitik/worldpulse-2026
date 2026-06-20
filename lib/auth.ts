import { auth } from '@clerk/nextjs/server'

/** The signed-in Clerk user id (text) for the current request, or null. */
export async function currentUserId(): Promise<string | null> {
  const { userId } = await auth()
  return userId ?? null
}
