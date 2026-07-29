import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { Button, Card, Disclaimer } from '../components/ui'
import { estimateMaxHr } from '../lib/hrZones'

/**
 * Minimal first-run setup. Only what's needed to make the numbers honest:
 * weight drives the calorie model, age seeds the max-HR estimate. Everything
 * else can wait for the intake.
 */
export function Onboarding() {
  const navigate = useNavigate()
  const { updateProfile, updateSettings } = useApp()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('70')
  const [age, setAge] = useState('35')

  async function finish() {
    await updateProfile({
      name: name.trim() || undefined,
      weightKg: Number(weight) || 70,
      age: Number(age) || 35,
      maxHrEstimated: true,
    })
    await updateSettings({
      onboardingComplete: true,
      disclaimerAcknowledgedAt: Date.now(),
    })
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 safe-top safe-bottom">
      {step === 0 && (
        <div>
          <div className="mb-6 text-6xl" aria-hidden>
            🏃
          </div>
          <h1 className="mb-3 text-3xl font-bold">Welcome to Runny</h1>
          <p className="mb-6 leading-relaxed text-slate-600 dark:text-slate-300">
            Track your runs and walks, and get a training plan that's built from real
            coaching science — then actually adapts to how your weeks go.
          </p>
          <p className="mb-8 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Works whether you're training for a marathon or can't yet run 2K without
            stopping. Everything stays on your device, and it all works offline.
          </p>
          <Button size="lg" full onClick={() => setStep(1)}>
            Get started
          </Button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h1 className="mb-2 text-2xl font-bold">A couple of basics</h1>
          <p className="mb-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Your weight makes the calorie estimate meaningful rather than a guess, and
            your age gives a starting point for heart rate zones. Both are editable
            later.
          </p>
          <Card className="mb-6">
            <label className="mb-4 block text-sm">
              <span className="mb-1 block font-medium">What should we call you?</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
              />
            </label>
            <label className="mb-4 block text-sm">
              <span className="mb-1 block font-medium">Weight (kg)</span>
              <input
                type="number"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Age</span>
              <input
                type="number"
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
              />
            </label>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              We'll estimate your max heart rate at {estimateMaxHr(Number(age) || 35)} bpm
              for now.
            </p>
          </Card>
          <Button size="lg" full onClick={() => setStep(2)}>
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h1 className="mb-3 text-2xl font-bold">One thing before you start</h1>
          <Card className="mb-6">
            <p className="mb-3 text-sm leading-relaxed">
              Runny's training guidance comes from published research — Daniels' VDOT
              system, Galloway's run-walk method, current evidence on training
              progression and tapering.
            </p>
            <Disclaimer />
          </Card>
          <p className="mb-6 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            If anything hurts — pain, not ordinary soreness — Runny will always tell you
            to back off and get it looked at, rather than push through.
          </p>
          <Button size="lg" full onClick={() => void finish()}>
            Got it — let's go
          </Button>
        </div>
      )}
    </div>
  )
}
