// Settings → Board lanes: the optional Later and Waiting lanes.

import { LANES, OPTIONAL, useOptionalLanes } from '../../domain/lanes'
import { StatusIcon } from '../../shared/ui'
import { Switch } from '../../shared/controls'
import { useVocab } from '../../domain/vocab'

/** Extra task lanes: Later and Waiting, on top of Todo, Doing and Done. */
export function LanesSetting() {
  const [on, setOn] = useOptionalLanes()
  const words = useVocab()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-meta text-fg-2">Board lanes</span>
        <span className="text-meta font-normal text-fg-3">{`${words.status('todo')}, ${words.status('doing')} and ${words.status('done')} are always on. Add these as you need them.`}</span>
      </div>
      {LANES.filter((lane) => OPTIONAL.includes(lane.status)).map((lane) => (
        <div key={lane.status} className="flex items-center gap-3">
          <StatusIcon status={lane.status} size={15} />
          <div className="flex flex-1 flex-col">
            <span className="text-fg">{words.status(lane.status)}</span>
            <span className="text-label font-normal text-fg-3">{lane.status === 'later' ? `Not up next. Keeps ${words.status('todo')} short.` : lane.hint}</span>
          </div>
          <Switch
            label={words.status(lane.status)}
            checked={on.includes(lane.status)}
            onChange={(checked) => setOn(checked ? [...on, lane.status] : on.filter((s) => s !== lane.status))}
          />
        </div>
      ))}
    </div>
  )
}
