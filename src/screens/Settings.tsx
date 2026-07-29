import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext'
import { useHeartRate } from '../tracking/useHeartRate'
import { Button, Card, Disclaimer, SectionTitle, cx } from '../components/ui'
import { estimateMaxHr, hrZones } from '../lib/hrZones'
import { db } from '../db/schema'

export function SettingsScreen() {
  const { settings, profile, updateSettings, updateProfile } = useApp()
  const hr = useHeartRate()

  const [weight, setWeight] = useState('')
  const [age, setAge] = useState('')
  const [maxHr, setMaxHr] = useState('')
  const [restingHr, setRestingHr] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    if (!profile) return
    setWeight(String(profile.weightKg))
    setAge(String(profile.age))
    setMaxHr(profile.maxHr ? String(profile.maxHr) : '')
    setRestingHr(profile.restingHr ? String(profile.restingHr) : '')
    setName(profile.name ?? '')
  }, [profile])

  const effectiveMaxHr = profile?.maxHr ?? estimateMaxHr(profile?.age ?? 35)
  const zones = hrZones(effectiveMaxHr)

  return (
    <div className="px-4 pt-6 pb-6 safe-top">
      <h1 className="mb-5 text-2xl font-bold">Settings</h1>

      <section className="mb-6">
        <SectionTitle>You</SectionTitle>
        <Card>
          <Field label="Name (optional)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void updateProfile({ name: name.trim() || undefined })}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
            />
          </Field>
          <Field
            label="Weight (kg)"
            hint="Used for the calorie estimate, which is based on oxygen cost rather than a flat rate per km."
          >
            <input
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={() => {
                const v = Number(weight)
                if (v > 0) void updateProfile({ weightKg: v })
              }}
              className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
            />
          </Field>
          <Field label="Age">
            <input
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              onBlur={() => {
                const v = Number(age)
                if (v > 0) void updateProfile({ age: v })
              }}
              className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
            />
          </Field>
        </Card>
      </section>

      <section className="mb-6">
        <SectionTitle>Heart rate</SectionTitle>
        <Card>
          <Field
            label="Max heart rate"
            hint={
              profile?.maxHr
                ? 'Your measured value.'
                : `Estimated as 220 − age (${effectiveMaxHr} bpm). It varies a lot between people, so replace it if you know your real number.`
            }
          >
            <input
              type="number"
              inputMode="numeric"
              placeholder={String(effectiveMaxHr)}
              value={maxHr}
              onChange={(e) => setMaxHr(e.target.value)}
              onBlur={() => {
                const v = Number(maxHr)
                void updateProfile({
                  maxHr: v > 0 ? v : undefined,
                  maxHrEstimated: !(v > 0),
                })
              }}
              className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
            />
          </Field>
          <Field label="Resting heart rate (optional)">
            <input
              type="number"
              inputMode="numeric"
              value={restingHr}
              onChange={(e) => setRestingHr(e.target.value)}
              onBlur={() => {
                const v = Number(restingHr)
                void updateProfile({ restingHr: v > 0 ? v : undefined })
              }}
              className="tnum min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-slate-700"
            />
          </Field>

          <div className="mt-2 mb-4 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            {zones.map((z) => (
              <div key={z.index} className="flex justify-between">
                <span>
                  Z{z.index} · {z.description}
                </span>
                <span className="tnum">
                  {z.minBpm}–{z.maxBpm}
                </span>
              </div>
            ))}
          </div>

          {hr.supported ? (
            hr.status === 'connected' ? (
              <div>
                <p className="mb-2 text-sm">
                  Connected to {hr.deviceName} — {hr.bpm ?? '--'} bpm
                </p>
                <Button variant="secondary" onClick={hr.disconnect}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => void hr.connect()}>
                {hr.status === 'connecting' ? 'Connecting…' : 'Pair a heart rate monitor'}
              </Button>
            )
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This browser doesn't support Web Bluetooth (Safari on iOS, for example).
              You can still add heart rate by hand after a run, or import a GPX file
              from your watch.
            </p>
          )}
          {hr.error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{hr.error}</p>
          )}
        </Card>
      </section>

      <section className="mb-6">
        <SectionTitle>Tracking</SectionTitle>
        <Card>
          <Toggle
            label="Auto-pause"
            hint="Pauses automatically after 10 seconds standing still, and resumes when you move."
            checked={settings.autoPause}
            onChange={(v) => void updateSettings({ autoPause: v })}
          />
          <Toggle
            label="Keep screen awake"
            hint="Holds a wake lock while tracking so the screen doesn't sleep mid-run."
            checked={settings.keepScreenAwake}
            onChange={(v) => void updateSettings({ keepScreenAwake: v })}
          />
        </Card>
      </section>

      <section className="mb-6">
        <SectionTitle>Display</SectionTitle>
        <Card>
          <FieldGroup label="Units">
            <div className="grid grid-cols-2 gap-2">
              {(['km', 'mi'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => void updateSettings({ units: u })}
                  aria-pressed={settings.units === u}
                  className={cx(
                    'min-h-11 rounded-xl font-medium transition',
                    settings.units === u
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
                  )}
                >
                  {u === 'km' ? 'Kilometres' : 'Miles'}
                </button>
              ))}
            </div>
          </FieldGroup>
          <FieldGroup label="Theme">
            <div className="grid grid-cols-3 gap-2">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => void updateSettings({ theme: t })}
                  aria-pressed={settings.theme === t}
                  className={cx(
                    'min-h-11 rounded-xl font-medium capitalize transition',
                    settings.theme === t
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </FieldGroup>
        </Card>
      </section>

      <section className="mb-6">
        <SectionTitle>Data</SectionTitle>
        <Card>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Everything lives on this device. Nothing is uploaded anywhere.
          </p>
          <Button
            variant="ghost"
            onClick={async () => {
              if (!confirm('Delete all activities, plans and settings? This cannot be undone.')) {
                return
              }
              await Promise.all([
                db.activities.clear(),
                db.plans.clear(),
                db.liveSession.clear(),
              ])
              location.reload()
            }}
          >
            Erase all data
          </Button>
        </Card>
      </section>

      <Disclaimer />
    </div>
  )
}

/** Wraps a single input. A `<label>` must not contain several controls. */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="mb-4 block text-sm last:mb-0">
      <span className="mb-1 block font-medium">{label}</span>
      {hint && (
        <span className="mb-2 block text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      )}
      {children}
    </label>
  )
}

/**
 * For a set of choice buttons. These are a group, not a labelled input —
 * wrapping them in a `<label>` folds the group's text into each button's
 * accessible name, so a screen reader announces "Units Miles" for the
 * kilometres button.
 */
function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-4 block text-sm last:mb-0" role="group" aria-label={label}>
      <span className="mb-1 block font-medium">{label}</span>
      {hint && (
        <span className="mb-2 block text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      )}
      {children}
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4 last:mb-0">
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && (
          <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full transition',
          checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700',
        )}
      >
        <span
          className={cx(
            'absolute top-1 size-5 rounded-full bg-white transition-all',
            checked ? 'left-6' : 'left-1',
          )}
        />
      </button>
    </div>
  )
}
