export function ScreenHeader({ step, title, onBack }: { step: 1 | 2 | 3; title: string; onBack: () => void }) {
  return (
    <header className="flex items-center gap-3 py-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="Go back"
        className="press grid size-11 place-items-center rounded-xl border-[3px] border-ink bg-card text-xl font-bold hard-shadow-sm"
      >
        ←
      </button>
      <div className="flex-1">
        <p className="text-xs font-bold tracking-widest text-muted uppercase">Step {step} of 3</p>
        <h1 className="font-display text-2xl leading-tight">{title}</h1>
      </div>
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-3 w-6 rounded-full border-2 border-ink ${i <= step ? 'bg-stamp' : 'bg-card'}`} />
        ))}
      </div>
    </header>
  )
}
