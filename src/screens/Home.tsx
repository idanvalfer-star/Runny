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
    <div className="min-h-dvh flex flex-col px-4 pt-6 pb-24 safe-top dark:bg-[#0F1419]">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          {greeting}
          {profile?.name ? `, ${profile.name}` : ''}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {thisWeek.length === 0
            ? "Nothing logged this week yet — a short one still counts."
            : `${thisWeek.length} session${thisWeek.length === 1 ? '' : 's'} this week.`}
        </p>
      </header>

      <div className="mb-8 flex items-center gap-8">
        <div className="flex-1">
          <div className="relative w-24 h-24">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-slate-200 dark:text-slate-700"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${Math.min(thisWeek.length, 5) * (2 * Math.PI * 45) / 5} ${2 * Math.PI * 45}`}
                className="text-brand-500 dark:text-brand-400 transition-all"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {thisWeek.length}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">/5</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-3">
          <div>
            <div className="text-sm text-slate-600 dark:text-slate-400">This week</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {formatDistance(weekKm, settings.units, 1)} {distanceLabel(settings.units).toLowerCase()}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Time</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {Math.round(weekMinutes)} min
            </div>
          </div>
        </div>
      </div>

      {todaySession && plan && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Today</h2>
            <Link
              to="/plan"
              className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:opacity-80"
            >
              Full plan
            </Link>
          </div>
          <SessionCard session={todaySession} units={settings.units} />
        </div>
      )}

      <Button size="lg" full className="mb-8" onClick={() => navigate('/track')}>
        Start a session
      </Button>

      {!plan && !loading && (
        <Card className="mb-8 border-l-4 border-brand-500 dark:bg-[#1A1F2E]">
          <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">No training plan yet</h3>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            Answer a few questions and Runny will build a plan around your goal,
            your schedule and where your fitness actually is right now.
          </p>
          <Button onClick={() => navigate('/intake')}>Build my plan</Button>
        </Card>
      )}

      <div className="flex-1">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Recent</h2>
        {activities.length === 0 ? (
          <EmptyState
            title="No activities yet"
            body="Your first tracked run or walk will show up here with a full breakdown."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {activities.slice(0, 5).map((a) => (
              <ActivityRow key={a.id} activity={a} units={settings.units} />
            ))}
          </div>
        )}
      </div>
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
