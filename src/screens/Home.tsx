import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Activity, PlannedSession, TrainingPlan } from '../types'
import { getActivePlan, listActivities } from '../db/repo'
import { useApp } from '../state/AppContext'
import { Button, Card, EmptyState, Metric, SectionTitle } from '../components/ui'
import { ActivityRow } from '../components/ActivityRow'
import { SessionCard } from '../components/SessionCard'
import { formatDistance, distanceLabel } from '../lib/units'
import { startOfWeek } from '../lib/dates'

export function Home() {
  const navigate = useNavigate()
  const { settings, profile } = useApp()
  const [activities, setActivities] = useState<Activity[]>([])
  const [plan, setPlan] = useState<TrainingPlan | undefined>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const [acts, activePlan] = await Promise.all([
        listActivities(),
        getActivePlan(),
      ])
      setActivities(acts)
      setPlan(activePlan)
      setLoading(false)
    })()
  }, [])

  const weekStart = startOfWeek(Date.now())
  const thisWeek = activities.filter((a) => a.startTime >= weekStart)
  const weekKm = thisWeek.reduce((sum, a) => sum + a.distanceKm, 0)
  const weekMinutes = thisWeek.reduce((sum, a) => sum + a.movingTimeSec / 60, 0)

  const todaySession = plan ? findTodaySession(plan) : undefined
  const greeting = greetingFor(new Date())

  return (
    <div className="px-4 pt-6 safe-top">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">
          {greeting}
          {profile?.name ? `, ${profile.name}` : ''}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {thisWeek.length === 0
            ? "Nothing logged this week yet — a short one still counts."
            : `${thisWeek.length} session${thisWeek.length === 1 ? '' : 's'} this week.`}
        </p>
      </header>

      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-4">
          <Metric
            label="This week"
            value={formatDistance(weekKm, settings.units, 1)}
            unit={distanceLabel(settings.units)}
            size="lg"
            accent
          />
          <Metric
            label="Time"
            value={Math.round(weekMinutes).toString()}
            unit="min"
            size="lg"
          />
        </div>
      </Card>

      <Button size="lg" full className="mb-6" onClick={() => navigate('/track')}>
        Start a session
      </Button>

      {todaySession && plan && (
        <section className="mb-6">
          <SectionTitle
            action={
              <Link
                to="/plan"
                className="text-sm font-medium text-brand-600 dark:text-brand-400"
              >
                Full plan
              </Link>
            }
          >
            Today
          </SectionTitle>
          <SessionCard session={todaySession} units={settings.units} />
        </section>
      )}

      {!plan && !loading && (
        <Card className="mb-6">
          <h3 className="mb-1 font-semibold">No training plan yet</h3>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Answer a few questions and Runny will build a plan around your goal,
            your schedule and where your fitness actually is right now.
          </p>
          <Button onClick={() => navigate('/intake')}>Build my plan</Button>
        </Card>
      )}

      <section>
        <SectionTitle
          action={
            <Link
              to="/history"
              className="text-sm font-medium text-brand-600 dark:text-brand-400"
            >
              See all
            </Link>
          }
        >
          Recent
        </SectionTitle>
        {activities.length === 0 ? (
          <EmptyState
            title="No activities yet"
            body="Your first tracked run or walk will show up here with a full breakdown."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {activities.slice(0, 5).map((a) => (
              <ActivityRow key={a.id} activity={a} units={settings.units} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function greetingFor(now: Date): string {
  const h = now.getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function findTodaySession(plan: TrainingPlan): PlannedSession | undefined {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = today.getTime()
  const end = start + 24 * 60 * 60 * 1000
  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      if (session.date >= start && session.date < end) return session
    }
  }
  return undefined
}
