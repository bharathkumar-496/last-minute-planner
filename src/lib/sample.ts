import type { ExamSetup, Topic } from './planner'

const local = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** A realistic "I have a day and a half" engineering maths exam. */
export function sampleExam(now = Date.now()): { setup: ExamSetup; topics: Topic[] } {
  const exam = new Date(now + 36 * 3600_000)
  exam.setMinutes(0, 0, 0)
  const raw: Array<[string, number, number, Topic['confidence']]> = [
    ['Unit 1: Matrices & Eigenvalues', 15, 1.5, 4],
    ['Unit 2: Differential Calculus', 20, 2, 3],
    ['Unit 3: Multiple Integrals', 20, 2.5, 2],
    ['Unit 4: Vector Calculus', 25, 3, 1],
    ['Unit 5: Laplace Transforms', 20, 2, 2],
    ['Fourier Series (short notes)', 10, 1, 3],
    ['Probability basics', 10, 1.5, 5],
  ]
  return {
    setup: { subject: 'Engineering Maths II', examAt: local(exam.getTime()), hoursPerDay: 6, sleepHours: 7 },
    topics: raw.map(([name, marks, hours, confidence], i) => ({
      id: `sample-${i}`,
      name,
      marks,
      hours,
      confidence,
      done: false,
    })),
  }
}
