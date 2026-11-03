import { useState } from 'react'
import { MIN_SLEEP, MAX_SLEEP, NICE_TRY, maxStudyHours, validateSetup, type ExamSetup, type SetupErrors } from '../lib/planner'
import { haptic } from '../lib/device'
import { Button, Card, Stepper } from './ui'
import { ScreenHeader } from './ScreenHeader'

export function SetupScreen({
  setup,
  onChange,
  onBack,
  onNext,
}: {
  setup: ExamSetup
  onChange: (s: ExamSetup) => void
  onBack: () => void
  onNext: () => void
}) {
  const [errors, setErrors] = useState<SetupErrors>({})
  const [sleepNag, setSleepNag] = useState(0)
  const [hoursNag, setHoursNag] = useState(0)
  const maxHours = maxStudyHours(setup.sleepHours)

  const update = (patch: Partial<ExamSetup>) => {
    const next = { ...setup, ...patch }
    onChange(next)
    if (Object.keys(errors).length) setErrors(validateSetup(next, Date.now()))
  }

  const submit = () => {
    const e = validateSetup(setup, Date.now())
    setErrors(e)
    if (Object.keys(e).length === 0) onNext()
    else haptic([30, 40, 30])
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4">
      <ScreenHeader step={1} onBack={onBack} title="The enemy" />
      <form
        className="flex flex-1 flex-col gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Card className="flex flex-col gap-5 p-5">
          <div>
            <label htmlFor="subject" className="mb-1 block font-bold">
              Subject
            </label>
            <input
              id="subject"
              value={setup.subject}
              onChange={(e) => update({ subject: e.target.value })}
              placeholder="e.g. Organic Chemistry"
              autoComplete="off"
              aria-invalid={!!errors.subject}
              aria-describedby={errors.subject ? 'subject-error' : undefined}
              className="min-h-12 w-full rounded-lg border-[3px] border-ink bg-card px-3 text-lg text-ink placeholder:text-muted"
            />
            {errors.subject && (
              <p id="subject-error" role="alert" className="mt-1 font-bold text-stamp">
                {errors.subject}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="examAt" className="mb-1 block font-bold">
              Exam date & time
            </label>
            <input
              id="examAt"
              type="datetime-local"
              value={setup.examAt}
              onChange={(e) => update({ examAt: e.target.value })}
              aria-invalid={!!errors.examAt}
              aria-describedby={errors.examAt ? 'exam-error' : undefined}
              className="min-h-12 w-full rounded-lg border-[3px] border-ink bg-card px-3 text-base text-ink sm:text-lg"
            />
            {errors.examAt && (
              <p id="exam-error" role="alert" className="mt-1 font-bold text-stamp">
                {errors.examAt}
              </p>
            )}
          </div>
        </Card>

        <Card tone="note" className="flex flex-col gap-6 p-5">
          <Stepper
            key={`h${hoursNag}`}
            label="Study hours per day"
            unit="h"
            value={setup.hoursPerDay}
            step={0.5}
            min={0.5}
            max={maxHours}
            onChange={(v) => update({ hoursPerDay: v })}
            onBlocked={(dir) => {
              haptic([30, 40, 30])
              setHoursNag((n) => n + 1)
              setErrors((e) => ({
                ...e,
                hoursPerDay: dir === 'up' ? NICE_TRY : '0 hours a day? Even the backbench friend does 30 minutes.',
              }))
            }}
            error={errors.hoursPerDay}
            hint={`Max ${maxHours}h. You still need to eat and exist.`}
          />
          <Stepper
            key={`s${sleepNag}`}
            label="Sleep protection"
            unit="h/night"
            value={setup.sleepHours}
            step={0.5}
            min={MIN_SLEEP}
            max={MAX_SLEEP}
            onChange={(v) => {
              const hoursPerDay = Math.min(setup.hoursPerDay, maxStudyHours(v))
              update({ sleepHours: v, hoursPerDay })
            }}
            onBlocked={(dir) => {
              haptic([30, 40, 30])
              setSleepNag((n) => n + 1)
              if (dir === 'down') setErrors((e) => ({ ...e, sleepHours: NICE_TRY }))
            }}
            error={errors.sleepHours}
            hint="Sleep is when your brain saves the file. We don't touch it."
          />
        </Card>

        <div className="flex-1" />
        <div className="sticky bottom-0 bg-gradient-to-t from-paper from-70% to-transparent pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button type="submit" variant="primary" big className="w-full">
            Next: what's on the paper →
          </Button>
        </div>
      </form>
    </div>
  )
}
