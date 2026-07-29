import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { RuleId } from '../types'
import { whyFor } from '../plan/whyMap'

/**
 * The "ⓘ why?" affordance. Copy comes from `whyMap` keyed by the rule that
 * fired, so the reasoning stays attached to the decision that produced it.
 */
export function WhyChip({ ruleId, label = 'why?' }: { ruleId: RuleId; label?: string }) {
  const [open, setOpen] = useState(false)
  const why = whyFor(ruleId)
  if (!why) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <span aria-hidden>ⓘ</span>
        {label}
      </button>
      {/* Portalled to the body so the sheet is never trapped beneath the fixed
          tab bar, which would leave its dismiss button untappable. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={why.title}
          >
            <div
              className="w-full max-w-lg rounded-t-3xl bg-white p-6 safe-bottom sm:rounded-3xl dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-2 text-lg font-bold">{why.title}</h3>
              <p className="mb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {why.body}
              </p>
              <button
                onClick={() => setOpen(false)}
                className="min-h-11 w-full rounded-xl bg-slate-200 font-semibold dark:bg-slate-800"
              >
                Got it
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
