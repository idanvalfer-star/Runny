import { Link } from 'react-router-dom'
import type { PlannedSession, SessionType } from '../types'
import type { Units } from '../lib/units'
import { distanceLabel, formatDistance, formatMinutes, formatPaceRange } from '../lib/units'
import { WhyChip } from './WhyChip'
import { Pill, cx } from './ui'

export const SESSION_META: Record<
  SessionType,
  { label: string; icon: string; tone: string }
> = {
  rest: { label: 'Rest', icon: '🛌', tone: 'bg-slate-100 dark:bg-slate-800' },
  easy_run: { label: 'Easy run', icon: '🏃', tone: 'bg-brand-100 dark:bg-brand-900/40' },
  walk: { label: 'Walk', icon: '🚶', tone: 'bg-sky-100 dark:bg-sky-900/40' },
  walk_run_intervals: {
    label: 'Run/walk intervals',
    icon: '🔁',
    tone: 'bg-sky-100 dark:bg-sky-900/40',
  },
  tempo: { label: 'Tempo', icon: '⚡', tone: 'bg-amber-100 dark:bg-amber-900/40' },
  intervals: { label: 'Intervals', icon: '🔥', tone: 'bg-orange-100 dark:bg-orange-900/40' },
  long_run: { label: 'Long run', icon: '🛣️', tone: 'bg-indigo-100 dark:bg-indigo-900/40' },
  strength: { label: 'Strength', icon: '💪', tone: 'bg-violet-100 dark:bg-violet-900/40' },
  cross_train: { label: 'Cross-train', icon: '🚴', tone: 'bg-teal-100 dark:bg-teal-900/40' },
  time_trial: { label: 'Time trial', icon: '⏱️', tone: 'bg-amber-100 dark:bg-amber-900/40' },
  race: { label: 'Race day', icon: '🏁', tone: 'bg-red-100 dark:bg-red-900/40' },
}

/** The target line: distance, duration, run/walk ratio — whatever applies. */
export function sessionTarget(session: PlannedSession, units: Units): string {
  const parts: string[] = []
  if (session.targetDistanceKm) {
    parts.push(
      `${formatDistance(session.targetDistanceKm, units, 1)} ${distanceLabel(units)}`,
    )
  }
  if (session.targetDurationMin) parts.push(formatMinutes(session.targetDurationMin))
  if (session.runWalkRatio) parts.push(session.runWalkRatio)
  return parts.join(' · ')
}

export function SessionCard({
  session,
  units,
  compact,
}: {
  session: PlannedSession
  units: Units
  compact?: boolean
}) {
  const meta = SESSION_META[session.activityType]
  const target = sessionTarget(session, units)
  const done = Boolean(session.completedActivityId)

  return (
    <Link
      to={`/plan/session/${session.id}`}
      className={cx(
        'flex items-start gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200/70 transition active:scale-[0.99] dark:bg-slate-900 dark:ring-slate-800',
        done && 'opacity-70',
      )}
    >
      <span
        className={cx(
          'flex size-11 shrink-0 items-center justify-center rounded-full text-lg',
          meta.tone,
        )}
        aria-hidden
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{meta.label}</span>
          {done && <Pill tone="brand">Done</Pill>}
          {session.userModified && <Pill>Edited</Pill>}
        </div>
        {target && (
          <div className="tnum text-sm text-slate-600 dark:text-slate-300">{target}</div>
        )}
        {session.targetPaceRange && (
          <div className="tnum text-xs text-slate-500 dark:text-slate-400">
            {formatPaceRange(session.targetPaceRange, units)}
          </div>
        )}
        {!compact && (
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {session.coachNote}
          </p>
        )}
        {!compact && session.whyRuleIds.length > 0 && (
          <div
            className="mt-2 flex flex-wrap gap-1"
            onClick={(e) => {
              // The chip opens an explanation; it should not also open the day.
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            {session.whyRuleIds.slice(0, 2).map((ruleId) => (
              <WhyChip key={ruleId} ruleId={ruleId} />
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
