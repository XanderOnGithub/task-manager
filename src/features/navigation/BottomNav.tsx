// The bar along the bottom edge on a narrow window: the four main places and
// Quick capture in the middle. Everything else (areas, projects, Settings) is
// in the drawer the header's menu button opens.

import { CalendarCheck, FileText, Layers, ListChecks, Plus, type LucideIcon } from 'lucide-react'
import { icon } from '../../domain/items'
import type { Overview } from './Sidebar'

interface Props {
  overview: Overview | null
  unsortedCount: number
  dueCount: number
  onOverview: (overview: Overview) => void
  onQuickCapture: () => void
}

export function BottomNav({ overview, unsortedCount, dueCount, onOverview, onQuickCapture }: Props) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-window-solid pb-[env(safe-area-inset-bottom)]"
    >
      <Tab Icon={Layers} label="Unsorted" count={unsortedCount} active={overview === 'unsorted'} onClick={() => onOverview('unsorted')} />
      <Tab Icon={CalendarCheck} label="Today" count={dueCount} active={overview === 'today'} onClick={() => onOverview('today')} />
      <div className="flex flex-1 items-center justify-center">
        <button
          onClick={onQuickCapture}
          aria-label="Quick capture"
          className="flex size-12 items-center justify-center rounded-full bg-accent text-on-accent shadow-menu transition-transform duration-100 ease-pop active:scale-95"
        >
          <Plus size={22} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <Tab Icon={ListChecks} label="Tasks" active={overview === 'tasks'} onClick={() => onOverview('tasks')} />
      <Tab Icon={FileText} label="Pages" active={overview === 'pages'} onClick={() => onOverview('pages')} />
    </nav>
  )
}

function Tab({
  Icon,
  label,
  count = 0,
  active,
  onClick,
}: {
  Icon: LucideIcon
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  // The label comes before the count in the markup, so the name a screen reader
  // says ("Unsorted 3") contains exactly the words you can see. The badge is
  // moved over the icon's corner with CSS.
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-label transition-colors duration-100 ${
        active ? 'text-accent' : 'text-fg-3'
      }`}
    >
      <Icon {...icon} size={20} />
      {label}
      {count > 0 && (
        <span className="absolute top-1.5 left-1/2 ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-badge px-1 text-label text-fg">
          {count}
        </span>
      )}
    </button>
  )
}
