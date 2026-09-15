import React, { useState } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'
import { Card } from './ui.jsx'

const SECTIONS = [
  {
    title: 'What is Ironlog?',
    body: `A place to write down what you did at the gym — which exercises, how
much weight, how many reps — so you can look back and see whether you're
actually getting stronger over time, instead of trying to remember it all
in your head.`,
  },
  {
    title: 'The Dashboard (your home screen)',
    body: `This is what you see when you open the app. The three numbers at
the top show: how many workouts you've logged this week, how many total,
and how many routines you have set up.

Below that, "Continue training" shows your workout plans — tap the ▶ play
button on one to start logging that workout right now.

"Recent activity" shows your last few logged workouts. Tap any of them to
see the full details.

If you ever leave a workout half-finished (for example your phone locks
or you switch apps), you'll see an "In progress" card at the very top when
you come back — tap "Resume" and you'll pick up exactly where you left
off, nothing is lost.`,
  },
  {
    title: 'Exercises — your personal list of movements',
    body: `Before you can log a workout, the exercises you do need to exist
in your library. Tap "Add exercise" and you can search a big shared list
(squats, bench press, running, stretches — hundreds of common ones) and
add whichever ones you actually do with one tap. Can't find something?
There's a "create a custom exercise" option at the bottom for anything
specific to you.

When adding or editing an exercise, you'll see a "How is weight tracked?"
choice:
— Weight in kg or lb — normal exercises with a barbell, dumbbell, machine, etc.
— Bodyweight — things like pull-ups or push-ups, where your own body is
  the weight. You can still note "added weight" if you strap on extra
  weight for these.

If the exercise is Cardio (running, cycling, rowing, etc.), you'll instead
pick how you measure effort:
— RPE — short for "Rate of Perceived Exertion." It just means: on a scale
  of 1 to 10, how hard did that feel? 10 is an all-out sprint, 1 is a
  gentle stroll.
— Heart rate zone — if you track your heart rate, a number from 1 (very
  easy) to 5 (maximum effort).
Neither is "more correct" — pick whichever one you actually pay attention
to while training.`,
  },
  {
    title: 'Routines — your workout plans',
    body: `A routine is just a saved plan — a specific list of exercises you
do together, like "Push Day" or "Leg Day." You build it once, then reuse
it every time you do that workout instead of picking exercises from
scratch each session.

To build one: give it a name, pick a category (Strength, Mobility, or
Cardio), then add exercises to it — either from your own list, or tap
"Browse library" to pull more in from the shared list without leaving the
page. For each exercise you can set a target — like "3 sets of 10 reps" —
that's just a goal to aim for, not a strict rule; you can always log
something different on the day.

Didn't find the exercise you wanted? "Can't find it? Create a custom
exercise" lets you add a brand new one without losing the routine you're
in the middle of building.`,
  },
  {
    title: 'Logging a workout — the actual training screen',
    body: `Tap "Start session" on a routine (or "log a freestyle session" to
train without a plan). For each exercise you'll see rows for each set.

The − and + buttons next to each number let you nudge the weight or reps
up or down without having to type — tap the number itself if you'd rather
type it directly.

If you see "Previously: 60kg × 8" under an exercise name, that's exactly
what you did last time you trained it — handy for knowing what to aim to
beat.

The small clock icon on the first set fills in your last numbers for you
automatically. If your last two sessions weren't identical (say you go
heavy then light, or light then heavy), tapping it gives you a choice
between "last set done" and "top set done" — pick whichever matches how
you train.

The little sticky-note icon lets you jot something down about that
specific exercise that day — "used the other machine," "felt off today,"
whatever's useful to remember later.

At the bottom of the screen there's a rest timer — tap 60/90/120/180 to
start a countdown between sets, it'll beep and buzz your phone when time's
up.

When you're done, hit "Finish & save session" at the bottom. That's the
only step that actually saves it permanently — everything before that is
just a working draft.`,
  },
  {
    title: 'History — everything you\'ve logged',
    body: `Every finished workout lives here, most recent first. Tap one to
see the full breakdown, set by set. Made a mistake typing a number? Open
that session and tap "Edit" to fix it — no need to delete and redo the
whole thing.

You can search by exercise name, routine name, or anything you wrote in
your notes, and filter by date range or category (Strength / Mobility /
Cardio) using the tabs.`,
  },
  {
    title: 'Stats — how you\'re progressing',
    body: `This turns your history into a picture of your progress:
personal records (your best-ever weight or reps on each exercise),
progress charts you can pick per exercise, how many weeks in a row you've
trained, and if you do cardio, your total minutes.`,
  },
  {
    title: 'Weight — tracking your body weight',
    body: `Separate from exercises — this is just for logging your own
body weight over time if you want to, with a simple chart. Totally
optional.`,
  },
  {
    title: 'Summary — exporting your training',
    body: `If you (or your trainer) want a written report of a week, month,
year, or custom date range, this page builds one you can copy or download.
There's also a "Download everything" button that backs up literally
everything you've ever logged into one file, if you ever want a full
copy for yourself.`,
  },
  {
    title: 'If something looks wrong or the app gets stuck',
    body: `Try reloading the page first — most odd glitches clear up with a
simple refresh, and thanks to the autosave, you won't lose an in-progress
workout by doing this. If something still seems broken, reach out to
whoever set your account up for you.`,
  },
]

export default function Help() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <div className="eyebrow mb-1 flex items-center gap-1.5">
          <HelpCircle size={13} /> Guide
        </div>
        <h1 className="text-3xl">How Ironlog works</h1>
        <p className="text-chalkdim text-sm mt-1">
          Tap any question below to open it. Written in plain language — no fitness-app experience assumed.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {SECTIONS.map((s, i) => (
          <Card key={i} className="!p-0 overflow-hidden">
            <button
              onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-start hover:bg-surface2"
            >
              <span className="text-chalk">{s.title}</span>
              <ChevronDown
                size={16}
                className={`text-chalkdim shrink-0 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
              />
            </button>
            {openIndex === i && (
              <div className="px-4 pb-4 text-chalkdim text-sm leading-relaxed whitespace-pre-line border-t border-line pt-3">
                {s.body}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
