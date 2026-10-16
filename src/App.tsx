// TEMPORARY: a smoke test that proves the Rust core and the UI are connected.
// It loads the data folder and lists what it found. Replace it with the real
// app shell in M2 (sidebar, panels; see the design canvas linked in CLAUDE.md).

import { useCallback, useEffect, useState } from 'react'
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

  return (
    <main style={{ padding: '48px 32px', height: '100%' }}>
      <div
        data-tauri-drag-region
        style={{ position: 'fixed', inset: '0 0 auto 0', height: 40 }}
      />
      <section
        style={{
          maxWidth: 560,
          padding: 24,
          borderRadius: 'var(--radius-panel)',
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, font: 'var(--text-title)', letterSpacing: 'var(--tracking-tight)' }}>
          Task Manager
        </h1>

        {error && <p style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>}

        {snapshot && (
          <>
            <p style={{ margin: 0, color: 'var(--text-2)' }}>
              {count('area')} areas · {count('project')} projects · {count('milestone')} milestones ·{' '}
              {count('task')} tasks · {count('note')} notes
            </p>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} strokeWidth={1.75} />
              Unsorted: {snapshot.unsorted.length}
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)' }}>
              {childrenOf(snapshot.items, null).map((area) => (
                <li key={area.id}>{area.title}</li>
              ))}
            </ul>
            {snapshot.issues.length > 0 && (
              <p style={{ margin: 0, color: 'var(--due-soon)' }}>{snapshot.issues.length} issues found</p>
            )}
            <p style={{ margin: 0, font: 'var(--text-mono)', color: 'var(--text-3)' }}>{snapshot.dataFolder}</p>
          </>
        )}
      </section>
    </main>
  )
}
