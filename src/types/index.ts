/** Core data model. Distances are stored in kilometres and paces in seconds per
 *  kilometre everywhere below the display layer; unit conversion happens only in
 *  `lib/units.ts` when rendering. */

export type ActivityType = 'run' | 'walk'

export interface RoutePoint {
  lat: number
  lng: number
  timestamp: number
  elevation?: number
  /** Reported GPS accuracy in metres, kept so the summary can be honest about quality. */
  accuracy?: number
}

export interface HrSample {
  timestamp: number
  bpm: number
}

export interface Split {
  /** 1-based index of the split (km or mile depending on how it was generated). */
  index: number
  distanceKm: number
  durationSec: number
  paceSecPerKm: number
  avgHr?: number
  elevationGainM?: number
}

export interface Activity {
  id: string
  type: ActivityType
  startTime: number
  endTime: number
  /** Time actually moving, excluding auto-paused and manually paused stretches. */
  movingTimeSec: number
  elapsedTimeSec: number
  distanceKm: number
  route: RoutePoint[]
  hrSamples: HrSample[]
  avgPaceSecPerKm: number
  bestPaceSecPerKm?: number
  avgHr?: number
  maxHr?: number
  caloriesBurned: number
  elevationGainM: number
  elevationLossM: number
  splits: Split[]
  /** 0-10 RPE, collected after the run. Distinct from `painReported` on purpose. */
  rpe?: number
  painReported?: boolean
  painNote?: string
  notes?: string
  /** Set when this activity was logged against a prescribed plan session. */
  planSessionId?: string
  /** GPS fixes rejected by the noise filter, surfaced in the summary. */
  discardedPoints?: number
  source?: 'gps' | 'import' | 'manual'
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export type ParqQuestionId =
  | 'heartCondition'
  | 'chestPainDizziness'
  | 'boneOrJointProblem'
  | 'pregnancyOrOtherMedical'

export interface SafetyScreen {
  answers: Record<ParqQuestionId, boolean>
  /** False if any PAR-Q answer was yes. Gates whether an intense plan is generated. */
  clearedForIntensePlan: boolean
  completedAt: number
}

export interface TimeTrial {
  distanceKm: number
  timeSec: number
  /** When the effort happened; older results are treated with more caution. */
  date?: number
}

export type RunningAbility =
  | 'cannot_run_2k'
  | 'run_2k_to_5k'
  | 'run_5k_to_10k'
  | 'run_10k_plus'

export type InjuryHistory =
  | 'none'
  | 'shin_splints'
  | 'it_band'
  | 'plantar_fasciitis'
  | 'runners_knee'
  | 'stress_fracture'
  | 'other'

export interface FitnessBaseline {
  currentAbility: RunningAbility
  currentAbilityDescription?: string
  recentRaceOrTimeTrial?: TimeTrial
  vdotScore?: number
  daysPerWeek: number
  preferredLongDay: number // 0 = Sunday
  injuryHistory: InjuryHistory[]
  returningFromBreak?: boolean
  doesStrengthTraining: boolean
}

export interface PaceRange {
  /** Seconds per kilometre. `min` is the faster end. */
  minSecPerKm: number
  maxSecPerKm: number
}

export interface PaceZones {
  easy: PaceRange
  marathon: PaceRange
  threshold: PaceRange
  interval: PaceRange
  repetition: PaceRange
}

export interface UserProfile {
  id: 'me'
  name?: string
  weightKg: number
  age: number
  maxHr?: number
  /** True when maxHr came from 220-age rather than a measured value. */
  maxHrEstimated?: boolean
  restingHr?: number
  safetyScreen?: SafetyScreen
  fitnessBaseline?: FitnessBaseline
  paceZones?: PaceZones
  createdAt: number
  updatedAt: number
}

export interface Settings {
  id: 'app'
  units: 'km' | 'mi'
  autoPause: boolean
  theme: 'system' | 'light' | 'dark'
  keepScreenAwake: boolean
  onboardingComplete: boolean
  disclaimerAcknowledgedAt?: number
}

// ---------------------------------------------------------------------------
// Training plan
// ---------------------------------------------------------------------------

export type GoalDistance =
  | '5k'
  | '10k'
  | 'half'
  | 'marathon'
  | 'ultra'
  | 'custom'
  | 'habit'

export type SessionType =
  | 'rest'
  | 'easy_run'
  | 'walk'
  | 'walk_run_intervals'
  | 'tempo'
  | 'intervals'
  | 'long_run'
  | 'strength'
  | 'cross_train'
  | 'time_trial'
  | 'race'

export type PlanPhase =
  | 'beginner_runwalk'
  | 'base'
  | 'build'
  | 'peak'
  | 'taper'
  | 'race_week'

export interface PlannedSession {
  id: string
  date: number
  dayOfWeek: number
  activityType: SessionType
  targetDistanceKm?: number
  targetDurationMin?: number
  targetPaceRange?: PaceRange
  /** e.g. "30s run / 90s walk x 10" */
  runWalkRatio?: string
  runWalkSegments?: { runSec: number; walkSec: number; repeats: number }
  coachNote: string
  /** Rule ids that produced this session, resolved to copy through `whyMap`. */
  whyRuleIds: RuleId[]
  completedActivityId?: string
  /** True when the user edited this session by hand. */
  userModified?: boolean
}

export interface PlanWeek {
  weekNumber: number
  startDate: number
  phase: PlanPhase
  isStepBackWeek: boolean
  totalDistanceKm: number
  sessions: PlannedSession[]
  summaryNote?: string
}

export interface PlanGoal {
  distance: GoalDistance
  distanceKm?: number
  targetTimeSec?: number
  targetDate?: number
  weeks: number
}

export interface AdjustmentLogEntry {
  date: number
  ruleId: RuleId
  reason: string
  summary: string
}

export interface TrainingPlan {
  id: string
  createdAt: number
  updatedAt: number
  goal: PlanGoal
  /** Snapshot of the intake that produced this plan, for regeneration. */
  createdFrom: {
    baseline: FitnessBaseline
    safetyScreen: SafetyScreen
    paceZones?: PaceZones
  }
  weeks: PlanWeek[]
  adjustmentLog: AdjustmentLogEntry[]
  /** False when the PAR-Q gate forced a conservative walking plan. */
  intensePlanAllowed: boolean
  active: boolean
}

/** Identifies which coaching rule fired, so the UI can look up an explanation
 *  instead of embedding copy in the plan renderer. See `plan/whyMap.ts`. */
export type RuleId =
  | 'easy_pace_discipline'
  | 'long_run_cap'
  | 'step_back_week'
  | 'strength_sessions'
  | 'taper'
  | 'run_walk_ratio'
  | 'pain_flag'
  | 'safety_screen_flagged'
  | 'vdot_pace_zones'
  | 'rest_day'
  | 'quality_session'
  | 'time_trial_week_one'
  | 'held_volume_high_rpe'
  | 'held_volume_missed_sessions'
  | 'progressed_on_track'
  | 'conservative_start_injury_history'

/** In-progress activity, persisted so a mid-run crash or reload can recover. */
export interface LiveSession {
  id: 'current'
  type: ActivityType
  startTime: number
  route: RoutePoint[]
  hrSamples: HrSample[]
  movingTimeSec: number
  elapsedTimeSec: number
  distanceKm: number
  discardedPoints: number
  paused: boolean
  planSessionId?: string
  updatedAt: number
}
