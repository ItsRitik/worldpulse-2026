/**
 * Local-timezone date helpers.
 * All fixture grouping/"today" logic must use the VIEWER's local date, not
 * the UTC date — a 19:00 UTC match is "tomorrow" for someone at UTC+5:30.
 */

/** YYYY-MM-DD key in the user's local timezone */
export function localDateKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today's YYYY-MM-DD key in the user's local timezone */
export function todayKey(): string {
  return localDateKey(new Date())
}

/** True if the ISO timestamp falls on the viewer's local "today" */
export function isLocalToday(iso: string): boolean {
  return localDateKey(iso) === todayKey()
}
