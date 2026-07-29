import type { RuleId } from '../types'

/**
 * Every coaching decision the engine makes carries a `RuleId`. The UI looks the
 * explanation up here rather than embedding copy in the plan renderer, which
 * keeps tone edits to a single file.
 */
export const whyMap: Record<RuleId, { title: string; body: string }> = {
  easy_pace_discipline: {
    title: 'Why so slow?',
    body: "This pace is supposed to feel almost too slow. Running easy days too fast is the most common mistake — even experienced runners do it — and it's what causes fatigue to quietly build up until you get hurt or plateau.",
  },
  long_run_cap: {
    title: 'Why such a small jump?',
    body: "Your long run only went up a little this week. Big jumps in your longest single run are one of the strongest predictors of injury — much more than your weekly total — so this cap protects you even if you're feeling great.",
  },
  step_back_week: {
    title: 'Why is this week easier?',
    body: "This is a planned lighter week, not a sign you're falling behind. Reducing load every few weeks lets your body actually absorb the fitness you've been building — skipping it is how fatigue sneaks up on people.",
  },
  strength_sessions: {
    title: 'Why strength work?',
    body: "Two short strength sessions a week isn't optional filler — it's one of the few things with strong evidence behind it for cutting your injury risk roughly in half.",
  },
  taper: {
    title: 'Why is my mileage dropping?',
    body: "Your mileage is dropping on purpose. You're not losing fitness — you're shedding fatigue so the fitness you built shows up on race day. Runners who cut volume but keep some intensity here tend to race better than runners who just stop.",
  },
  run_walk_ratio: {
    title: 'Why walk breaks?',
    body: "Walk breaks aren't a fallback for when running gets hard — they're the plan. Taking them on purpose, before you're gassed, is proven to reduce injury risk and dropout, especially for new runners.",
  },
  pain_flag: {
    title: 'Why did my plan pause?',
    body: "This isn't a judgment call — any reported pain automatically pauses progression and suggests rest or cross-training. Soreness and fatigue are a normal part of training; pain isn't, and it's worth getting checked rather than pushed through.",
  },
  safety_screen_flagged: {
    title: 'Why is my plan conservative?',
    body: "Based on your answers, we're starting conservatively and recommending a quick check with a doctor before ramping up intensity — this isn't the app being overly cautious, it's the standard first step any coach or trainer would take.",
  },
  vdot_pace_zones: {
    title: 'Where do these paces come from?',
    body: "These paces come from a real fitness calculation based on your recent time, not a generic guess — they're set slightly conservative on purpose so your training actually builds the fitness you're after.",
  },
  rest_day: {
    title: 'Why a full rest day?',
    body: "Rest is when the adaptation actually happens. Training breaks you down; the day off is where you rebuild slightly stronger than before. Every week gets at least one.",
  },
  quality_session: {
    title: 'Why only one hard session?',
    body: "One genuinely hard session a week is enough to drive fitness forward. More than that and the easy days stop being easy, which is where most overtraining starts. It's held back until you've got a few weeks of consistent easy running behind you.",
  },
  time_trial_week_one: {
    title: 'Why start with a test?',
    body: "Without a recent race or hard effort there's nothing to calculate your paces from, so week one includes a relaxed timed effort. It's not a race — it just gives the plan real numbers to work with instead of a guess.",
  },
  held_volume_high_rpe: {
    title: 'Why did the plan hold back?',
    body: "Your easy runs have been feeling harder than they should. Rather than pile more on top, the plan holds at your current volume until they settle back down — that's how you avoid digging a hole you can't train out of.",
  },
  held_volume_missed_sessions: {
    title: 'Why did the plan hold back?',
    body: "A few sessions were missed, so progressing as if they'd happened would mean a bigger jump than your body has been prepared for. The plan repeats rather than pushes on.",
  },
  progressed_on_track: {
    title: 'Why did this go up?',
    body: "Last week went to plan and your effort levels were where they should be, so the plan steps forward — still capped so no single session jumps too far at once.",
  },
  conservative_start_injury_history: {
    title: 'Why start here?',
    body: "You mentioned a previous injury, so the plan starts a notch easier and progresses more slowly. Coming back slightly under-cooked is recoverable; re-injuring the same spot usually isn't, at least not quickly.",
  },
}

export function whyFor(ruleId: RuleId) {
  return whyMap[ruleId]
}
