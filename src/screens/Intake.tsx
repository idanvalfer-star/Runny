import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  FitnessBaseline,
  GoalDistance,
  InjuryHistory,
  ParqQuestionId,
  RunningAbility,
  SafetyScreen,
} from '../types'
import { useApp } from '../state/AppContext'
import { generatePlan } from '../plan/engine'
import { savePlan } from '../db/repo'
import { Button, Card, Disclaimer, cx } from '../components/ui'
import { DAY_NAMES } from '../lib/dates'

const PARQ: Array<{ id: ParqQuestionId; question: string }> = [
  {
    id: 'heartCondition',
    question:
      'Has a doctor ever told you that you have a heart condition, or that you should only do physical activity recommended by a doctor?',
  },
  {
    id: 'chestPainDizziness',
    question:
      'Do you feel chest pain, dizziness, or lose your balance during physical activity — or have you in the past month?',
  },
  {
    id: 'boneOrJointProblem',
    question:
      'Do you have a bone or joint problem (back, knee, hip) that could be made worse by increased activity?',
  },
  {
    id: 'pregnancyOrOtherMedical',
    question:
      'Are you currently pregnant, or has a doctor told you not to run or walk for another medical reason?',
  },
]

const ABILITIES: Array<{ value: RunningAbility; label: string; hint: string }> = [
  {
    value: 'cannot_run_2k',
    label: "I can't run 2K without stopping yet",
    hint: 'Completely normal starting point — your plan will use run-walk intervals.',
  },
  { value: 'run_2k_to_5k', label: 'I can run about 2–5K', hint: 'A solid base to build on.' },
  { value: 'run_5k_to_10k', label: 'I can run 5–10K', hint: 'Comfortable aerobic base.' },
  { value: 'run_10k_plus', label: 'I can run 10K or more', hint: 'Experienced — plans can be more structured.' },
]

const INJURIES: Array<{ value: InjuryHistory; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'shin_splints', label: 'Shin splints' },
  { value: 'it_band', label: 'IT band' },
  { value: 'plantar_fasciitis', label: 'Plantar fasciitis' },
  { value: 'runners_knee', label: "Runner's knee" },
  { value: 'stress_fracture', label: 'Stress fracture' },
  { value: 'other', label: 'Something else' },
]

const GOAL_OPTIONS: Array<{ value: GoalDistance; label: string }> = [
  { value: '5k', label: '5K' },
  { value: '10k', label: '10K' },
  { value: 'half', label: 'Half marathon' },
  { value: 'marathon', label: 'Marathon' },
  { value: 'ultra', label: 'Ultra' },
  { value: 'habit', label: 'Just build a running habit' },
]

export function Intake() {
  const navigate = useNavigate()
  const { profile, updateProfile } = useApp()
  const [step, setStep] = useState(0)

  const [parq, setParq] = useState<Partial<Record<ParqQuestionId, boolean>>>({})
  const [ability, setAbility] = useState<RunningAbility | undefined>()
  const [hasTrial, setHasTrial] = useState<boolean | undefined>()
  const [trialDistance, setTrialDistance] = useState('5')
  const [trialTime, setTrialTime] = useState('')
  const [daysPerWeek, setDaysPerWeek] = useState(3)
  const [longDay, setLongDay] = useState(0)
  const [injuries, setInjuries] = useState<InjuryHistory[]>([])
  const [strength, setStrength] = useState<boolean | undefined>()
  const [goal, setGoal] = useState<GoalDistance | undefined>()
  const [targetTime, setTargetTime] = useState('')
  const [weeks, setWeeks] = useState('12')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)

  const parqComplete = PARQ.every((q) => parq[q.id] !== undefined)
  const anyParqYes = PARQ.some((q) => parq[q.id] === true)

  // One question per screen, in the spec's order: safety, then baseline, then goal.
  const steps = [
    ...PARQ.map((q) => ({ kind: 'parq' as const, question: q })),
    { kind: 'parq_result' as const },
    { kind: 'ability' as const },
    { kind: 'trial' as const },
    { kind: 'days' as const },
    { kind: 'injuries' as const },
    { kind: 'strength' as const },
    { kind: 'goal' as const },
    { kind: 'target' as const },
    { kind: 'timeline' as const },
  ]

  const current = steps[step]
  const progress = ((step + 1) / steps.length) * 100

  function next() {
    setStep((s) => Math.min(steps.length - 1, s + 1))
  }
  function back() {
    if (step === 0) navigate(-1)
    else setStep((s) => s - 1)
  }

  async function finish() {
    if (!ability || !goal) return
    setSaving(true)

    const safetyScreen: SafetyScreen = {
      answers: {
        heartCondition: parq.heartCondition ?? false,
        chestPainDizziness: parq.chestPainDizziness ?? false,
        boneOrJointProblem: parq.boneOrJointProblem ?? false,
        pregnancyOrOtherMedical: parq.pregnancyOrOtherMedical ?? false,
      },
      clearedForIntensePlan: !anyParqYes,
      completedAt: Date.now(),
    }

    const trialSec = parseTime(trialTime)
    const baseline: FitnessBaseline = {
      currentAbility: ability,
      recentRaceOrTimeTrial:
        hasTrial && trialSec
          ? { distanceKm: Number(trialDistance) || 5, timeSec: trialSec }
          : undefined,
      daysPerWeek,
      preferredLongDay: longDay,
      injuryHistory: injuries.length > 0 ? injuries : ['none'],
      doesStrengthTraining: strength ?? false,
    }

    await updateProfile({ safetyScreen, fitnessBaseline: baseline })

    const plan = generatePlan({
      goal: {
        distance: goal,
        targetTimeSec: parseTime(targetTime) ?? undefined,
        targetDate: targetDate ? new Date(targetDate).getTime() : undefined,
        weeks: targetDate ? undefined : Number(weeks) || undefined,
      },
      baseline,
      safetyScreen,
      age: profile?.age ?? 35,
    })

    await savePlan(plan)
    await updateProfile({ paceZones: plan.createdFrom.paceZones })
    setSaving(false)
    navigate('/plan', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col px-4 pt-4 safe-top">
      <div className="mb-6">
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <button onClick={back} className="text-sm text-slate-500 dark:text-slate-400">
          ← Back
        </button>
      </div>

      <div className="flex-1">
        {current.kind === 'parq' && (
          <Question
            eyebrow="Health check"
            title={current.question.question}
            hint="Four quick questions before anything else. This is the standard first step any coach would take."
          >
            <div className="grid grid-cols-2 gap-3">
              {[false, true].map((val) => (
                <Choice
                  key={String(val)}
                  selected={parq[current.question.id] === val}
                  onClick={() => {
                    setParq((p) => ({ ...p, [current.question.id]: val }))
                    setTimeout(next, 150)
                  }}
                >
                  {val ? 'Yes' : 'No'}
                </Choice>
              ))}
            </div>
          </Question>
        )}

        {current.kind === 'parq_result' && (
          <Question
            eyebrow="Health check"
            title={anyParqYes ? 'Let’s start carefully' : 'All clear'}
            hint={
              anyParqYes
                ? undefined
                : 'Nothing flagged, so your plan can include the full range of sessions.'
            }
          >
            {anyParqYes ? (
              <Card className="border-l-4 border-amber-500">
                <p className="mb-3 text-sm leading-relaxed">
                  Based on your answers, Runny will build a low-intensity plan that
                  starts with walking and builds slowly, and it won't add hard
                  sessions. Please check in with a doctor before increasing intensity.
                </p>
                <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  This isn't the app being overly cautious — it's the standard first
                  step any coach or trainer would take.
                </p>
              </Card>
            ) : null}
            <Button size="lg" full className="mt-4" onClick={next} disabled={!parqComplete}>
              Continue
            </Button>
          </Question>
        )}

        {current.kind === 'ability' && (
          <Question
            eyebrow="Where you are now"
            title="Can you currently run continuously, and roughly how far?"
            hint="Be honest rather than optimistic — the plan is built from this."
          >
            <div className="flex flex-col gap-2">
              {ABILITIES.map((a) => (
                <Choice
                  key={a.value}
                  selected={ability === a.value}
                  onClick={() => {
                    setAbility(a.value)
                    setTimeout(next, 150)
                  }}
                  align="left"
                >
                  <span className="font-semibold">{a.label}</span>
                  <span className="mt-0.5 block text-xs font-normal opacity-70">
                    {a.hint}
                  </span>
                </Choice>
              ))}
            </div>
          </Question>
        )}

        {current.kind === 'trial' && (
          <Question
            eyebrow="Where you are now"
            title="Have you raced or done a hard timed effort recently?"
            hint="This is the single most useful thing you can tell Runny — it turns your training paces from a guess into a calculation."
          >
            <div className="mb-4 grid grid-cols-2 gap-3">
              <Choice selected={hasTrial === true} onClick={() => setHasTrial(true)}>
                Yes
              </Choice>
              <Choice
                selected={hasTrial === false}
                onClick={() => {
                  setHasTrial(false)
                  setTimeout(next, 150)
                }}
              >
                Not recently
              </Choice>
            </div>

            {hasTrial === true && (
              <Card>
                <label className="mb-3 block text-sm">
                  <span className="mb-1 block text-slate-500 dark:text-slate-400">
                    Distance (km)
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={trialDistance}
                    onChange={(e) => setTrialDistance(e.target.value)}
                    className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
                  />
                </label>
                <label className="mb-3 block text-sm">
                  <span className="mb-1 block text-slate-500 dark:text-slate-400">
                    Time (mm:ss or h:mm:ss)
                  </span>
                  <input
                    value={trialTime}
                    onChange={(e) => setTrialTime(e.target.value)}
                    placeholder="27:30"
                    className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
                  />
                </label>
                <Button full disabled={!parseTime(trialTime)} onClick={next}>
                  Continue
                </Button>
              </Card>
            )}

            {hasTrial === false && (
              <Card>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  No problem — week 1 will include a relaxed timed effort so your paces
                  come from a real number instead of a guess.
                </p>
              </Card>
            )}
          </Question>
        )}

        {current.kind === 'days' && (
          <Question
            eyebrow="Your schedule"
            title="How many days a week can you realistically train?"
            hint="Realistically. A plan you can actually follow beats an ambitious one you can't."
          >
            <div className="mb-6 grid grid-cols-3 gap-2">
              {[2, 3, 4, 5, 6, 7].map((d) => (
                <Choice key={d} selected={daysPerWeek === d} onClick={() => setDaysPerWeek(d)}>
                  {d} days
                </Choice>
              ))}
            </div>
            <p className="mb-2 text-sm font-semibold">
              Preferred day for your longest session
            </p>
            <div className="mb-6 grid grid-cols-2 gap-2">
              {DAY_NAMES.map((name, i) => (
                <Choice key={name} selected={longDay === i} onClick={() => setLongDay(i)}>
                  {name}
                </Choice>
              ))}
            </div>
            <Button size="lg" full onClick={next}>
              Continue
            </Button>
          </Question>
        )}

        {current.kind === 'injuries' && (
          <Question
            eyebrow="Your history"
            title="Any past running injuries?"
            hint="This makes the plan progress more conservatively — select all that apply."
          >
            <div className="mb-6 flex flex-col gap-2">
              {INJURIES.map((inj) => (
                <Choice
                  key={inj.value}
                  selected={injuries.includes(inj.value)}
                  onClick={() =>
                    setInjuries((prev) =>
                      inj.value === 'none'
                        ? ['none']
                        : prev.includes(inj.value)
                          ? prev.filter((v) => v !== inj.value)
                          : [...prev.filter((v) => v !== 'none'), inj.value],
                    )
                  }
                  align="left"
                >
                  {inj.label}
                </Choice>
              ))}
            </div>
            <Button size="lg" full onClick={next} disabled={injuries.length === 0}>
              Continue
            </Button>
          </Question>
        )}

        {current.kind === 'strength' && (
          <Question
            eyebrow="Your history"
            title="Do you currently do any strength training?"
            hint="Strength work is one of the few interventions with strong evidence for cutting running injury risk, so your plan will include it either way."
          >
            <div className="grid grid-cols-2 gap-3">
              {[true, false].map((val) => (
                <Choice
                  key={String(val)}
                  selected={strength === val}
                  onClick={() => {
                    setStrength(val)
                    setTimeout(next, 150)
                  }}
                >
                  {val ? 'Yes' : 'Not yet'}
                </Choice>
              ))}
            </div>
          </Question>
        )}

        {current.kind === 'goal' && (
          <Question eyebrow="Your goal" title="What are you training for?">
            <div className="flex flex-col gap-2">
              {GOAL_OPTIONS.map((g) => (
                <Choice
                  key={g.value}
                  selected={goal === g.value}
                  onClick={() => {
                    setGoal(g.value)
                    setTimeout(next, 150)
                  }}
                  align="left"
                >
                  {g.label}
                </Choice>
              ))}
            </div>
          </Question>
        )}

        {current.kind === 'target' && (
          <Question
            eyebrow="Your goal"
            title="Do you have a target time?"
            hint="Leave it blank if you just want to finish comfortably — that's a perfectly good goal."
          >
            <Card className="mb-4">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-500 dark:text-slate-400">
                  Target time (optional)
                </span>
                <input
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                  placeholder="1:59:00"
                  className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
                />
              </label>
            </Card>
            <Button size="lg" full onClick={next}>
              Continue
            </Button>
          </Question>
        )}

        {current.kind === 'timeline' && (
          <Question
            eyebrow="Your goal"
            title="When is it?"
            hint="A race date lets Runny build a proper taper into the end of your plan."
          >
            <Card className="mb-4">
              <label className="mb-4 block text-sm">
                <span className="mb-1 block text-slate-500 dark:text-slate-400">
                  Event date (optional)
                </span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
                />
              </label>
              {!targetDate && (
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-500 dark:text-slate-400">
                    Or how many weeks do you want to train for?
                  </span>
                  <input
                    type="number"
                    value={weeks}
                    onChange={(e) => setWeeks(e.target.value)}
                    className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
                  />
                </label>
              )}
            </Card>
            <Disclaimer className="mb-4" />
            <Button size="lg" full disabled={saving} onClick={() => void finish()}>
              {saving ? 'Building your plan…' : 'Build my plan'}
            </Button>
          </Question>
        )}
      </div>
    </div>
  )
}

function Question({
  eyebrow,
  title,
  hint,
  children,
}: {
  eyebrow: string
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide text-brand-600 uppercase dark:text-brand-400">
        {eyebrow}
      </p>
      <h1 className="mb-2 text-xl leading-snug font-bold">{title}</h1>
      {hint && (
        <p className="mb-5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Choice({
  selected,
  onClick,
  children,
  align = 'center',
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  align?: 'center' | 'left'
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'min-h-12 rounded-xl px-4 py-3 font-medium ring-1 transition active:scale-[0.99]',
        align === 'left' ? 'text-left' : 'text-center',
        selected
          ? 'bg-brand-600 text-white ring-brand-600'
          : 'bg-white text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800',
      )}
    >
      {children}
    </button>
  )
}

/** Accepts mm:ss, h:mm:ss, or plain minutes. */
export function parseTime(input: string): number | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  const parts = trimmed.split(':').map((p) => Number(p))
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return undefined
  if (parts.length === 1) return parts[0] * 60
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return undefined
}
