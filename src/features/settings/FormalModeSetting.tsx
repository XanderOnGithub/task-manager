// Settings → Formal mode: agile words everywhere (domain/vocab.ts).

import { useWording } from '../../domain/vocab'
import { Switch } from '../../shared/controls'

/** Swaps Moss's words for agile ones. Only the words change; files stay the same. */
export function FormalModeSetting() {
  const [wording, setWording] = useWording()
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-meta text-fg-2">Formal mode</span>
        <span className="text-meta font-normal text-fg-3">
          Agile terms: Unsorted becomes Backlog, areas Initiatives, projects Epics, milestones Sprints and tasks Stories.
          Files stay the same.
        </span>
      </div>
      <Switch label="Formal mode" checked={wording === 'agile'} onChange={(on) => setWording(on ? 'agile' : 'plain')} />
    </div>
  )
}
