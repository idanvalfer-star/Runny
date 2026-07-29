import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, cx } from './ui'

/** 0-10 RPE. The modern scale, easier for non-athletes than Borg's 6-20. */
const RPE_LABELS: Record<number, string> = {
  0: 'Nothing at all',
  1: 'Very, very light',
  2: 'Very light',
  3: 'Light',
  4: 'Somewhat hard',
  5: 'Hard',
  6: 'Harder',
  7: 'Very hard',
  8: 'Very, very hard',
  9: 'Near maximal',
  10: 'Maximal effort',
}

/**
 * Effort and pain are asked separately and stored separately: one is a normal
 * training response, the other is a red flag that halts progression.
 */
export function RpeSheet({
  onSubmit,
  onDismiss,
}: {
  onSubmit: (rpe: number, painReported: boolean, painNote?: string) => Promise<void>
  onDismiss: () => void
}) {
  const [rpe, setRpe] = useState<number | undefined>()
  const [pain, setPain] = useState<boolean | undefined>()
  const [painNote, setPainNote] = useState('')
  const [saving, setSaving] = useState(false)

  const ready = rpe !== undefined && pain !== undefined

  // Portalled to the body so the sheet clears the fixed tab bar.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 safe-bottom sm:rounded-3xl dark:bg-slate-900">
        <h2 className="mb-1 text-xl font-bold">How did that feel?</h2>
        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
          This is what lets your plan adjust to you rather than run on autopilot.
        </p>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-semibold">
            Effort — 0 is nothing at all, 10 is maximal
          </label>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <button
                key={n}
                onClick={() => setRpe(n)}
                className={cx(
                  'tnum min-h-11 rounded-xl font-semibold transition',
                  rpe === n
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
                )}
                aria-pressed={rpe === n}
              >
                {n}
              </button>
            ))}
          </div>
          {rpe !== undefined && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {RPE_LABELS[rpe]}
            </p>
          )}
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-semibold">
            Any pain — not just tiredness?
          </label>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Soreness and fatigue are normal. Pain is a different signal, so we track
            it separately.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPain(false)}
              className={cx(
                'min-h-12 rounded-xl font-semibold transition',
                pain === false
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
              )}
              aria-pressed={pain === false}
            >
              No pain
            </button>
            <button
              onClick={() => setPain(true)}
              className={cx(
                'min-h-12 rounded-xl font-semibold transition',
                pain === true
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
              )}
              aria-pressed={pain === true}
            >
              Yes, pain
            </button>
          </div>
          {pain && (
            <div className="mt-3">
              <input
                value={painNote}
                onChange={(e) => setPainNote(e.target.value)}
                placeholder="Where? e.g. left knee"
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700"
              />
              <p className="mt-2 rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-800 dark:bg-red-950/40 dark:text-red-200">
                Your plan will pause progression and swap in rest or cross-training.
                Pain that persists is worth getting looked at by a physio or doctor
                rather than training through.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            full
            disabled={!ready || saving}
            onClick={async () => {
              if (rpe === undefined || pain === undefined) return
              setSaving(true)
              await onSubmit(rpe, pain, painNote.trim() || undefined)
              setSaving(false)
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" full onClick={onDismiss}>
            Skip for now
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
