import { renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Item } from '../../platform/api'
import { useRowKeys } from './rowKeys'

const task = { id: 'T1', kind: 'task', title: 'Pick tile', status: 'todo' } as Item

function setup() {
  document.body.innerHTML = `
    <main>
      <div data-item="T1" tabindex="0" id="row">
        <button id="status" aria-label="Status">o</button>
        <span>Pick tile</span>
      </div>
      <div data-item="T2" tabindex="0" id="next"></div>
    </main>`
  const handlers = {
    byId: new Map([[task.id, task]]),
    open: vi.fn(),
    select: vi.fn(),
    selectedId: null,
    cycleStatus: vi.fn(),
    trash: vi.fn().mockResolvedValue(undefined),
  }
  renderHook(() => useRowKeys(handlers))
  return handlers
}

describe('row keys', () => {
  it('Enter on a row opens it', async () => {
    const h = setup()
    document.getElementById('row')!.focus()
    await userEvent.keyboard('{Enter}')
    expect(h.select).toHaveBeenCalledWith('T1')
  })

  it("Enter on a button inside the row is the button's own, not 'open the row'", async () => {
    const h = setup()
    const clicked = vi.fn()
    document.getElementById('status')!.addEventListener('click', clicked)
    document.getElementById('status')!.focus()
    await userEvent.keyboard('{Enter}')
    expect(h.select).not.toHaveBeenCalled()
    expect(h.open).not.toHaveBeenCalled()
    expect(clicked).toHaveBeenCalledTimes(1) // the browser's own activation went through
  })

  it('S and Delete still work from a button inside the row', async () => {
    const h = setup()
    document.getElementById('status')!.focus()
    await userEvent.keyboard('s')
    expect(h.cycleStatus).toHaveBeenCalledWith(task)
    await userEvent.keyboard('{Delete}')
    expect(h.trash).toHaveBeenCalledWith(task)
  })

  it('leaves keys alone in a text field or the editor', async () => {
    const h = setup()
    const editor = document.createElement('div')
    editor.contentEditable = 'true'
    document.getElementById('row')!.append(editor)
    editor.focus()
    await userEvent.keyboard('s{Delete}{Enter}')
    expect(h.cycleStatus).not.toHaveBeenCalled()
    expect(h.trash).not.toHaveBeenCalled()
    expect(h.select).not.toHaveBeenCalled()
  })
})
