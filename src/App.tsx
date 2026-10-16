// TEMPORARY: a smoke test that proves the Rust core and the UI are connected.
// It loads the data folder and lists what it found. Replace it with the real
// app shell in M2 (sidebar, panels; see the design canvas linked in CLAUDE.md).

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Layers } from 'lucide-react'
import { childrenOf, loadLibrary, onDataChanged, type Snapshot } from './lib/api'

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    loadLibrary()
      .then((s) => {
        setSnapshot(s)
        setError(null)
      })
      .catch((e: unknown) => setError(String(e)))
  }, [])

  // Load once, then again whenever files change outside the app.
  useEffect(() => {
    reload()
    const stop = onDataChanged(reload)
    return () => {
      stop.then((unlisten) => unlisten())
    }
  }, [reload])

  const count = (kind: string) => snapshot?.items.filter((i) => i.kind === kind).length ?? 0
  const milestones = snapshot?.items.filter((i) => i.kind === 'milestone') ?? []

  return (
    <main className="h-full px-8 py-12">
      <div data-tauri-drag-region className="fixed inset-x-0 top-0 h-10" />

      <section className="flex max-w-[560px] animate-fade-in flex-col gap-4 rounded-panel border border-border bg-panel p-6">
        <h1 className="text-title">Task Manager</h1>

        {error && <p className="text-danger">{error}</p>}

        {snapshot && (
          <>
            <p className="text-fg-2">
              {count('area')} areas · {count('project')} projects · {count('milestone')} milestones ·{' '}
              {count('task')} tasks · {count('note')} notes
            </p>

            <p className="flex items-center gap-2">
              <Layers size={16} strokeWidth={1.75} />
              Unsorted: {snapshot.unsorted.length}
            </p>

            <ul className="list-disc pl-5 text-fg-2">
              {childrenOf(snapshot.items, null).map((area) => (
                <li key={area.id}>{area.title}</li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              {milestones.map((m) => (
                <span
                  key={m.id}
                  className="milestone-chip"
                  style={{ '--ms': `var(--color-ms-${m.color ?? 'sand'})` } as CSSProperties}
                >
                  {m.title}
                </span>
              ))}
            </div>

            {snapshot.issues.length > 0 && (
              <p className="text-due-soon">{snapshot.issues.length} issues found</p>
            )}

            <p className="font-mono text-meta font-normal text-fg-3">{snapshot.dataFolder}</p>
          </>
        )}
      </section>
    </main>
  )
}
