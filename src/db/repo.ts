import { db, DEFAULT_SETTINGS } from './schema'
import type {
  Activity,
  ActivityType,
  LiveSession,
  Settings,
  TrainingPlan,
  UserProfile,
} from '../types'

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// --- settings ---------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.get('app')
  if (existing) return { ...DEFAULT_SETTINGS, ...existing }
  await db.settings.put(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next = { ...current, ...patch, id: 'app' as const }
  await db.settings.put(next)
  return next
}

// --- profile ----------------------------------------------------------------

export async function getProfile(): Promise<UserProfile | undefined> {
  return db.profile.get('me')
}

export async function saveProfile(
  patch: Partial<UserProfile>,
): Promise<UserProfile> {
  const now = Date.now()
  const current = await getProfile()
  const next: UserProfile = {
    id: 'me',
    weightKg: 70,
    age: 35,
    createdAt: now,
    ...current,
    ...patch,
    updatedAt: now,
  }
  await db.profile.put(next)
  return next
}

// --- activities -------------------------------------------------------------

export async function saveActivity(activity: Activity): Promise<void> {
  await db.activities.put(activity)
}

export async function getActivity(id: string): Promise<Activity | undefined> {
  return db.activities.get(id)
}

export async function deleteActivity(id: string): Promise<void> {
  await db.activities.delete(id)
}

/** Newest first — every list in the app reads in this order. */
export async function listActivities(filter?: {
  type?: ActivityType
  from?: number
  to?: number
}): Promise<Activity[]> {
  let all = await db.activities.orderBy('startTime').reverse().toArray()
  if (filter?.type) all = all.filter((a) => a.type === filter.type)
  if (filter?.from !== undefined) {
    all = all.filter((a) => a.startTime >= filter.from!)
  }
  if (filter?.to !== undefined) all = all.filter((a) => a.startTime <= filter.to!)
  return all
}

export async function updateActivity(
  id: string,
  patch: Partial<Activity>,
): Promise<void> {
  await db.activities.update(id, patch)
}

// --- plans ------------------------------------------------------------------

export async function getActivePlan(): Promise<TrainingPlan | undefined> {
  const plans = await db.plans.toArray()
  return plans.find((p) => p.active)
}

export async function savePlan(plan: TrainingPlan): Promise<void> {
  if (plan.active) {
    // Only one plan drives the calendar at a time.
    const others = await db.plans.toArray()
    await Promise.all(
      others
        .filter((p) => p.id !== plan.id && p.active)
        .map((p) => db.plans.update(p.id, { active: false })),
    )
  }
  await db.plans.put(plan)
}

export async function listPlans(): Promise<TrainingPlan[]> {
  return db.plans.orderBy('createdAt').reverse().toArray()
}

export async function deletePlan(id: string): Promise<void> {
  await db.plans.delete(id)
}

// --- live session (crash recovery) -----------------------------------------

export async function saveLiveSession(session: LiveSession): Promise<void> {
  await db.liveSession.put(session)
}

export async function getLiveSession(): Promise<LiveSession | undefined> {
  return db.liveSession.get('current')
}

export async function clearLiveSession(): Promise<void> {
  await db.liveSession.delete('current')
}
