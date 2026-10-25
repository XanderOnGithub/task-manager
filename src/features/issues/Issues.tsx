// Issues: things in the data folder Moss couldn't make sense of.
//
// Your files can be edited by anything (Finder, a text editor, a sync), so
// Moss never refuses to open over a problem: it notes it here and carries on.
// Moss repairs the harmless ones (a missing id) by itself while loading. What
// is left needs a person: a name Windows can't store, a details block that was
// never closed, a file in a folder where only folders belong.

import { ArrowUpRight, CircleAlert, FolderOpen } from 'lucide-react'
import { revealPath, type Issue } from '../../platform/api'
import { useToast } from '../../shared/toast/toast'
import { Panel, PanelHeader } from '../../shared/ui'

export function IssuesView({ issues, onOpen }: { issues: Issue[]; onOpen?: (id: string) => void }) {
  const toast = useToast()
  const reveal = (path: string) => revealPath(path).catch((e) => toast({ message: String(e), tone: 'error' }))

  return (
    <Panel label="Issues" className="flex-1">
      <PanelHeader>
        <span className="flex-1 truncate text-fg">Issues</span>
      </PanelHeader>
      <div className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-7 py-6 max-md:px-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-title">Issues</h1>
          <span className="text-meta font-normal text-fg-3">
            Moss found these in your files. It opened anyway; fix them in Finder or a text editor.
          </span>
        </div>
        {issues.length === 0 ? (
          <p className="text-fg-3">No issues</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {issues.map((issue) => (
              <li
                key={`${issue.type}:${issue.path}`}
                className="group flex min-h-row items-center gap-2.5 rounded-row py-1.5 pr-1.5 pl-2.5 transition-colors duration-100 hover:bg-hover"
              >
                <CircleAlert size={15} strokeWidth={1.75} className="shrink-0 text-due-soon" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-fg">{issue.name}</span>
                  <span className="text-meta font-normal text-fg-3">{issue.message}</span>
                </span>
                {issue.itemId && onOpen && (
                  <button
                    onClick={() => onOpen(issue.itemId!)}
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-control px-2 text-fg-2 transition-colors duration-100 hover:bg-raised hover:text-fg"
                  >
                    <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
                    <span>Open</span>
                    <span className="sr-only"> {issue.name}</span>
                  </button>
                )}
                <button
                  onClick={() => void reveal(issue.path)}
                  className="flex h-7 shrink-0 items-center gap-1.5 rounded-control px-2 text-fg-2 transition-colors duration-100 hover:bg-raised hover:text-fg"
                >
                  <FolderOpen size={13} strokeWidth={2} aria-hidden="true" />
                  <span>Reveal</span>
                  <span className="sr-only"> {issue.name} in the file manager</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
