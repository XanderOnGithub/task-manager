// Settings: General, Sync, Backups, Sounds and Fun in one dialog. (First launch is in features/onboarding.)

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Modal, Segmented } from '../../shared/controls'
import { spring } from '../../shared/motion/springs'
import { SyncTab } from '../sync/SyncSettings'
import { GeneralTab } from './GeneralTab'
import { BackupTab } from './BackupTab'
import { FunTab } from './FunTab'
import { SoundsTab } from './SoundsTab'
import { VersionInfo } from './VersionInfo'

export function Settings({
  dataFolder,
  onClose,
  onFolderChanged,
}: {
  dataFolder: string | null
  onClose: () => void
  onFolderChanged: () => Promise<void>
}) {
  const [tab, setTab] = useState<'general' | 'sync' | 'backup' | 'sounds' | 'fun'>('general')
  return (
    <Modal label="Settings" onClose={onClose} width="w-[520px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-5">
        <h2 className="flex-1 text-heading">Settings</h2>
        <Segmented<'general' | 'sync' | 'backup' | 'sounds' | 'fun'>
          label="Settings section"
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'general', label: 'General' },
            { value: 'sync', label: 'Sync' },
            { value: 'backup', label: 'Backups' },
            { value: 'sounds', label: 'Sounds' },
            { value: 'fun', label: 'Fun' },
          ]}
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {tab === 'fun' ? (
          <motion.div key="fun" {...tabMotion(1)}>
            <FunTab />
          </motion.div>
        ) : tab === 'sounds' ? (
          <motion.div key="sounds" {...tabMotion(1)}>
            <SoundsTab />
          </motion.div>
        ) : tab === 'backup' ? (
          <motion.div key="backup" {...tabMotion(1)}>
            <BackupTab />
          </motion.div>
        ) : tab === 'sync' ? (
          <motion.div key="sync" {...tabMotion(1)}>
            <SyncTab />
          </motion.div>
        ) : (
          <motion.div key="general" {...tabMotion(-1)} className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto p-5">
            <GeneralTab dataFolder={dataFolder} onFolderChanged={onFolderChanged} />
          </motion.div>
        )}
      </AnimatePresence>
      <VersionInfo />
    </Modal>
  )
}

/** Tabs slide a little toward the side they come from. */
const tabMotion = (side: number) => ({
  initial: { opacity: 0, x: 10 * side },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 * side },
  transition: spring.snappy,
})
