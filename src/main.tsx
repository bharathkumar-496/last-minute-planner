import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { clearState } from './lib/storage'

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
        <p className="font-display text-3xl">Something broke.</p>
        <p className="text-lg">Not you. Us. Your exam is still on, sadly.</p>
        <button
          type="button"
          className="min-h-12 rounded-xl border-[3px] border-ink bg-note px-5 font-bold text-note-ink"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
        <button
          type="button"
          className="min-h-11 font-bold underline"
          onClick={() => {
            clearState()
            window.location.reload()
          }}
        >
          Reset everything
        </button>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
