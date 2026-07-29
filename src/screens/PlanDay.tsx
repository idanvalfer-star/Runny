import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { PlanWeek, PlannedSession, TrainingPlan } from '../types'
import { getActivePlan, savePlan } from '../db/repo'
import { useApp } from '../state/AppContext'
import { SESSION_META, sessionTarget } from '../components/SessionCard'
import { WhyChip } from '../components/WhyChip'
import { Button, Card, Pill, SectionTitle } from '../components/ui'
import { capSessionIncrease } from '../plan/progression'
import { formatDate } from '../lib/dates'
import { distanceLabel, formatPaceRange, kmToDisplay, displayToKm } from '../lib/units'

export function PlanDay() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { settings } = useApp()
  const [plan, setPlan] = useState<TrainingPlan | undefined>()
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [capNotice, setCapNotice] = useState<string | undefined>()

  useEffect(() => {
    void (async () => {
      setPlan(await getActivePlan())
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>

  const found = plan ? findSession(plan, id) : undefined
  if (!plan || !found) {
    return (
      <div className="p-6">
        <p className="mb-4 text-sm text-slate-500">That session is no longer in your plan.</p>
        <Button onClick={() => navigate('/plan')}>Back to plan</Button>
      </div>
    )
  }

  const { session, week } = found
  const meta = SESSION_META[session.activityType]
  const trainable = session.activityType !== 'rest' && session.activityType !== 'strength'

  async function saveEdit() {
    if (!plan) return
    const enteredKm = displayToKm(Number(editValue), settings.units)
    if (!Number.isFinite(enteredKm) || enteredKm <= 0) return

    // A manual edit still goes through the guardrails — the cap and the
    // step-back weeks are not overridable, by design.
    const longestRecent = longestRecentFor(plan, session.date)
    const { allowedKm, capped } = capSessionIncrease(enteredKm, longestRecent)

    setCapNotice(
      capped
        ? `Capped at ${kmToDisplay(allowedKm, settings.units).toFixed(1)} ${distanceLabel(settings.units)} — that's the most this session can jump versus your longest run in the past month.`
        : undefined,
    )

    const next: TrainingPlan = {
      ...plan,
      updatedAt: Date.now(),
      weeks: plan.weeks.map((w) => ({
        ...w,
        sessions: w.sessions.map((s) =>
          s.id === session.id
            ? {
                ...s,
                targetDistanceKm: Math.round(allowedKm * 10) / 10,
                userModified: true,
                whyRuleIds: capped
                  ? Array.from(new Set([...s.whyRuleIds, 'long_run_cap' as const]))
                  : s.whyRuleIds,
              }
            : s,
        ),
        totalDistanceKm:
          Math.round(
            w.sessions.reduce(
              (sum, s) =>
                sum +
                (s.id === session.id ? allowedKm : (s.targetDistanceKm ?? 0)),
              0,
            ) * 10,
          ) / 10,
      })),
    }
    await savePlan(next)
    setPlan(next)
    setEditing(false)
  }

  return (
    <div className="px-4 pt-6 pb-6 safe-top">
      <button
        onClick={() => navigate('/plan')}
        className="mb-4 text-sm text-slate-500 dark:text-slate-400"
      >
        ← Plan
      </button>

      <header className="mb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Pill tone="brand">Week {week.weekNumber}</Pill>
          {week.isStepBackWeek && <Pill tone="warn">Step-back week</Pill>}
          {session.completedActivityId && <Pill tone="brand">Completed</Pill>}
        </div>
        <div className="mb-1 flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {meta.icon}
          </span>
          <h1 className="text-2xl font-bold">{meta.label}</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {formatDate(session.date)}
        </p>
      </header>

      <Card className="mb-4">
        {sessionTarget(session, settings.units) && (
          <div className="tnum mb-2 text-2xl font-bold">
            {sessionTarget(session, settings.units)}
          </div>
        )}
        {session.targetPaceRange && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="tnum text-sm text-slate-600 dark:text-slate-300">
              Target pace {formatPaceRange(session.targetPaceRange, settings.units)}
            </span>
            {(session.activityType === 'easy_run' ||
              session.activityType === 'long_run') && (
              <WhyChip ruleId="easy_pace_discipline" />
            )}
          </div>
        )}
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {session.coachNote}
        </p>
      </Card>

      {session.runWalkSegments && (
        <Card className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="font-semibold">How to run it</h2>
            <WhyChip ruleId="run_walk_ratio" />
          </div>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Repeat {session.runWalkSegments.repeats} times:{' '}
            <strong>{session.runWalkSegments.runSec}s easy running</strong>, then{' '}
            <strong>{session.runWalkSegments.walkSec}s walking</strong>. Start the walk
            break on schedule — before you feel you need it.
          </p>
        </Card>
      )}

      {session.whyRuleIds.length > 0 && (
        <section className="mb-4">
          <SectionTitle>Why this session</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {session.whyRuleIds.map((ruleId) => (
              <WhyChip key={ruleId} ruleId={ruleId} label={labelForRule(ruleId)} />
            ))}
          </div>
        </section>
      )}

      {capNotice && (
        <Card className="mb-4 border-l-4 border-amber-500">
          <p className="text-sm">{capNotice}</p>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {trainable && !session.completedActivityId && (
          <Button
            size="lg"
            onClick={() => navigate(`/track?session=${session.id}`)}
          >
            Start this session
          </Button>
        )}
        {session.completedActivityId && (
          <Button
            variant="secondary"
            onClick={() => navigate(`/activity/${session.completedActivityId}`)}
          >
            See what you ran
          </Button>
        )}

        {session.targetDistanceKm !== undefined && !session.completedActivityId && (
          editing ? (
            <Card>
              <label className="mb-3 block text-sm">
                <span className="mb-1 block text-slate-500 dark:text-slate-400">
                  Distance ({distanceLabel(settings.units)})
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
                />
              </label>
              <div className="flex gap-2">
                <Button onClick={() => void saveEdit()}>Save</Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Edits still respect the single-session cap — that guardrail isn't
                something the app lets you switch off.
              </p>
            </Card>
          ) : (
            <Button
              variant="ghost"
              onClick={() => {
                setEditValue(
                  kmToDisplay(session.targetDistanceKm ?? 0, settings.units).toFixed(1),
                )
                setEditing(true)
              }}
            >
              Adjust this session
            </Button>
          )
        )}
      </div>
    </div>
  )
}

function findSession(
  plan: TrainingPlan,
  id?: string,
): { session: PlannedSession; week: PlanWeek } | undefined {
  if (!id) return undefined
  for (const week of plan.weeks) {
    const session = week.sessions.find((s) => s.id === id)
    if (session) return { session, week }
  }
  return undefined
}

function longestRecentFor(plan: TrainingPlan, date: number): number {
  const cutoff = date - 30 * 24 * 60 * 60 * 1000
  let longest = 0
  for (const week of plan.weeks) {
    for (const s of week.sessions) {
      if (s.date >= cutoff && s.date < date) {
        longest = Math.max(longest, s.targetDistanceKm ?? 0)
      }
    }
  }
  return longest
}

function labelForRule(ruleId: string): string {
  switch (ruleId) {
    case 'easy_pace_discipline':
      return 'why so slow?'
    case 'long_run_cap':
      return 'why the small jump?'
    case 'step_back_week':
      return 'why easier?'
    case 'strength_sessions':
      return 'why strength?'
    case 'taper':
      return 'why less?'
    case 'run_walk_ratio':
      return 'why walk breaks?'
    case 'rest_day':
      return 'why rest?'
    case 'quality_session':
      return 'why one hard day?'
    case 'time_trial_week_one':
      return 'why a test?'
    default:
      return 'why?'
  }
}
