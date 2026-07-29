import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type {
  Activity,
  LiveSession,
  Settings,
  TrainingPlan,
  UserProfile,
} from '../types'

/** IndexedDB is the source of truth. Nothing here talks to a network. */
export class RunnyDb extends Dexie {
  activities!: EntityTable<Activity, 'id'>
  profile!: EntityTable<UserProfile, 'id'>
  plans!: EntityTable<TrainingPlan, 'id'>
  settings!: EntityTable<Settings, 'id'>
  liveSession!: EntityTable<LiveSession, 'id'>

  constructor() {
    super('runny')
    this.version(1).stores({
      activities: 'id, startTime, type, planSessionId',
      profile: 'id',
      plans: 'id, createdAt, active',
      settings: 'id',
      liveSession: 'id',
    })
  }
}

export const db = new RunnyDb()

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  units: 'km',
  autoPause: true,
  theme: 'system',
  keepScreenAwake: true,
  onboardingComplete: false,
}
