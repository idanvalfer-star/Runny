import type { SessionType } from '../types'

/**
 * Templated coach notes. Deterministic strings, no API key, works offline —
 * and the numbers never come from here, only the phrasing.
 *
 * Tone scales with the runner: a beginner should never be handed VO2max
 * vocabulary they have no use for yet.
 */

interface NoteContext {
  beginner: boolean
  weekNumber: number
  runWalkRatio?: string
  /** Distinguishes repeats of the same session type inside one week. */
  variant?: number
}

const NOTES: Record<SessionType, (ctx: NoteContext) => string[]> = {
  rest: () => [
    'Full rest day. This is when the adaptation actually happens.',
    "Nothing today. Resting is training — it's the part where you get stronger.",
    'Day off. Resist the urge to sneak a run in; the plan needs this gap.',
  ],
  easy_run: (ctx) =>
    ctx.beginner
      ? [
          'Keep it gentle — you should be able to hold a conversation the whole way.',
          'Easy effort. If you can only get a few words out at a time, slow down.',
        ]
      : [
          'Conversational the whole way. If you finish wanting more, that was right.',
          "Easy means easy. Hold back here so the hard days can actually be hard.",
          'Stay in the easy band even if your legs feel great — especially then.',
        ],
  walk: () => [
    'Brisk walk. Purposeful pace, but you should finish comfortable.',
    'Walking counts. Keep the pace up enough to feel it slightly.',
  ],
  walk_run_intervals: (ctx) => [
    `${ctx.runWalkRatio ?? 'Run-walk intervals'} — start the walk break before you feel like you need it.`,
    'Take the walk breaks on schedule, not when you get tired. That is the whole trick.',
    'Run segments should feel easy, not like a sprint. The walk is where you recover for the next one.',
  ],
  tempo: () => [
    'Comfortably hard — the pace you could hold for about an hour if you had to.',
    'Controlled discomfort, not a race. You should finish knowing you had a bit left.',
    'Settle into the effort after a few minutes and hold it steady.',
  ],
  intervals: () => [
    'Hard efforts with real recovery between them. Jog or walk the recoveries properly.',
    'Run these strong but repeatable — the last one should look like the first.',
    'Quality over heroics. If the reps are falling apart, stop early.',
  ],
  long_run: (ctx) =>
    ctx.beginner
      ? ['Your longest session this week. Slow and steady — time on feet is the goal.']
      : [
          'Slow down. Long runs done too fast are the fastest way to blunt the week.',
          'Time on feet is the point. Easy pace, and take fuel if you are out over an hour.',
          'This is the week\'s cornerstone. Start slower than feels natural.',
        ],
  strength: () => [
    '20 minutes: squats, lunges, calf raises, single-leg balance, core. Twice a week.',
    'Short and simple — bodyweight work is enough. Consistency beats intensity here.',
    'Legs, hips and core. This is the session that keeps you running injury-free.',
  ],
  cross_train: () => [
    'Bike, swim or row at an easy effort. Aerobic work without the pounding.',
    'Low-impact cardio. Keep it comfortable — this is a recovery aid, not a workout.',
  ],
  time_trial: (ctx) =>
    ctx.beginner
      ? [
          "A relaxed 'see where you are' effort. Run-walk it if you need to — there's no wrong result.",
          'Not a race. Just an honest effort so your plan can use real numbers.',
        ]
      : [
          'Warm up first, then a steady hard effort. This sets every pace in your plan.',
          "Run it honestly but don't empty the tank. The number matters more than the heroics.",
        ],
  race: () => [
    'Race day. Trust the work — go out slightly slower than you think you should.',
    "This is what the block was for. Start conservative; you can always pick it up.",
  ],
}

/**
 * Deterministic variety: a given session always gets the same note, but four
 * easy runs in one week do not all read identically.
 */
export function coachNoteFor(type: SessionType, ctx: NoteContext): string {
  const options = NOTES[type](ctx)
  const seed = ctx.weekNumber + (ctx.variant ?? 0)
  return options[Math.abs(seed) % options.length]
}
