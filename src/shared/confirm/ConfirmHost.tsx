// The "Are you sure?" dialog. One of these is mounted in App.tsx; anything can ask with `confirm()`.

import { Modal } from '../controls'
import { useConfirmRequest } from './confirm'

/** The "Are you sure?" dialog (see confirm.ts). Enter goes ahead, Escape cancels. */
export function ConfirmHost() {
  const request = useConfirmRequest()
  if (!request) return null
  return (
    <Modal label={request.title} onClose={() => request.answer(false)} width="w-[400px]">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          request.answer(true)
        }}
      >
        <div className="flex flex-col gap-1.5">
          <h2 className="text-heading">{request.title}</h2>
          <p className="text-fg-2">{request.body}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => request.answer(false)}
            className="flex h-8 items-center rounded-row px-3 text-fg-2 transition-colors duration-100 hover:bg-hover hover:text-fg"
          >
            Cancel
          </button>
          <button
            autoFocus
            type="submit"
            className={`flex h-8 items-center rounded-row px-3.5 font-medium transition-[filter,transform] duration-100 hover:brightness-110 active:scale-[0.97] ${
              request.danger ? 'bg-danger text-on-accent' : 'bg-accent text-on-accent'
            }`}
          >
            {request.action}
          </button>
        </div>
      </form>
    </Modal>
  )
}
