import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TrainingPlan } from '../types'
import { deletePlan, getActivePlan } from '../db/repo'
import { useApp } from '../state/AppContext'
import { runWeeklyReview } from '../plan/adapt'
import { SessionCard } from '../components/SessionCard'
import { WhyChip } from '../components/WhyChip'
import { Button, Card, Disclaimer, EmptyState, Pill, SectionTitle, cx } from '../components/ui'
import { GOALS } from '../plan/templates'
import { formatShortDate, startOfWeek } from '../lib/dates'
import { distanceLabel, formatDistance, formatPaceRange, formatDuration } from '../lib/units'

const PHASE_LABEL: Record<string, string> = {
  beginner_runwalk: 'Run-walk',
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
  race_week: 'Race week',
}

export function PlanScreen() {
  const navigate = useNavigate()
  const { settings } = useApp()
  const [plan, setPlan] = useState<TrainingPlan | undefined>()
  const [loading, setLoading] = useState(true)
  const [weekIndex, setWeekIndex] = useState(0)
  const [reviewing, setReviewing] = useState(false)
  const [showLog, setShowLog] = useState(false)

  async function refresh() {
    const p = await getActivePlan()
    setPlan(p)
    if (p) {
      // Land on the current week rather than week 1.
      const thisWeek = startOfWeek(Date.now())
      const idx = p.weeks.findIndex((w) => w.startDate === thisWeek)
      setWeekIndex(idx >= 0 ? idx : 0)
    }
    setLoading(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>

  if (!plan) {
    return (
      <div className="px-4 pt-6 safe-top">
        <h1 className="mb-4 text-2xl font-bold">Training plan</h1>
        <EmptyState
          title="No plan yet"
          body="Tell Runny your goal and a bit about where you're starting from, and it'll build a week-by-week plan around it."
          action={<Button onClick={() => navigate('/intake')}>Build my plan</Button>}
        />
      </div>
    )
  }

  const week = plan.weeks[weekIndex]
  const goalLabel = GOALS[plan.goal.distance].label
  const zones = plan.createdFrom.paceZones

  return (
    <div className="px-4 pt-6 pb-6 safe-top">
      <header className="mb-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Pill tone="brand">{goalLabel}</Pill>
          {plan.goal.targetTimeSec && (
            <Pill>Target {formatDuration(plan.goal.targetTimeSec)}</Pill>
          )}
          {!plan.intensePlanAllowed && <Pill tone="warn">Conservative plan</Pill>}
        </div>
        <h1 className="text-2xl font-bold">
          Week {week.weekNumber} of {plan.weeks.length}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {formatShortDate(week.startDate)} · {PHASE_LABEL[week.phase] ?? week.phase} ·{' '}
          {formatDistance(week.totalDistanceKm, settings.units, 1)}{' '}
          {distanceLabel(settings.units)}
        </p>
      </header>

      {!plan.intensePlanAllowed && (
        <Card className="mb-4 border-l-4 border-amber-500">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-sm font-semibold">Starting conservatively</p>
            <WhyChip ruleId="safety_screen_flagged" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Your health screen flagged something, so this plan keeps intensity out and
            builds slowly. Worth a quick chat with a doctor before ramping up.
          </p>
        </Card>
      )}

      {/* Week strip */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {plan.weeks.map((w, i) => (
          <button
            key={w.weekNumber}
            onClick={() => setWeekIndex(i)}
            className={cx(
              'min-h-12 shrink-0 rounded-xl px-3 text-center transition',
              i === weekIndex
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            <div className="text-xs opacity-70">Wk</div>
            <div className="tnum text-sm font-bold">{w.weekNumber}</div>
            {w.isStepBackWeek && <div className="text-[10px]">easy</div>}
            {w.phase === 'taper' && <div className="text-[10px]">taper</div>}
          </button>
        ))}
      </div>

      {(week.isStepBackWeek || week.phase === 'taper') && (
        <Card className="mb-4 border-l-4 border-brand-500">
          <div className="mb-1 flex items-center gap-2">
            <p className="text-sm font-semibold">
              {week.isStepBackWeek ? 'Planned lighter week' : 'Taper'}
            </p>
            <WhyChip ruleId={week.isStepBackWeek ? 'step_back_week' : 'taper'} />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{week.summaryNote}</p>
        </Card>
      )}

      <section className="mb-6">
        <SectionTitle>This week</SectionTitle>
        <div className="flex flex-col gap-2">
          {week.sessions.map((s) => (
            <SessionCard key={s.id} session={s} units={settings.units} />
          ))}
        </div>
      </section>

      {zones && (
        <section className="mb-6">
          <SectionTitle
            action={<WhyChip ruleId="vdot_pace_zones" label="where from?" />}
          >
            Your training paces
          </SectionTitle>
          <Card>
            <dl className="flex flex-col gap-2 text-sm">
              {(
                [
                  ['Easy', zones.easy],
                  ['Marathon', zones.marathon],
                  ['Threshold', zones.threshold],
                  ['Interval', zones.interval],
                  ['Repetition', zones.repetition],
                ] as const
              ).map(([label, range]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-slate-600 dark:text-slate-300">{label}</dt>
                  <dd className="tnum font-medium">
                    {formatPaceRange(range, settings.units)}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
      )}

      <section className="mb-6">
        <SectionTitle
          action={
            plan.adjustmentLog.length > 0 ? (
              <button
                onClick={() => setShowLog((v) => !v)}
                className="text-sm font-medium text-brand-600 dark:text-brand-400"
              >
                {showLog ? 'Hide' : `Show (${plan.adjustmentLog.length})`}
              </button>
            ) : undefined
          }
        >
          Plan adjustments
        </SectionTitle>
        {plan.adjustmentLog.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nothing adjusted yet. As you log sessions and tell Runny how they felt,
              any change to your plan gets explained here.
            </p>
          </Card>
        ) : (
          showLog && (
            <div className="flex flex-col gap-2">
              {plan.adjustmentLog.map((entry, i) => (
                <Card key={`${entry.date}-${i}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{entry.reason}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {formatShortDate(entry.date)}
                    </span>
                    <WhyChip ruleId={entry.ruleId} />
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {entry.summary}
                  </p>
                </Card>
              ))}
            </div>
          )
        )}
      </section>

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          disabled={reviewing}
          onClick={async () => {
            setReviewing(true)
            const decision = await runWeeklyReview()
            await refresh()
            setReviewing(false)
            if (!decision) {
              alert('No completed week to review yet — check back after your first full week.')
            }
          }}
        >
          {reviewing ? 'Reviewing…' : 'Review last week and adjust'}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            if (!confirm('Start over with a new plan? Your current plan will be replaced.')) {
              return
            }
            await deletePlan(plan.id)
            navigate('/intake')
          }}
        >
          Build a different plan
        </Button>
      </div>

      <Disclaimer className="mt-6" />
    </div>
  )
}
