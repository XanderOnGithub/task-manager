// On a phone, GitHub's page covers the whole screen. If Moss opened it the moment
// you tapped "Sign in", you would land on a page asking for a code you never saw.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const flags = vi.hoisted(() => ({ android: true }))
const api = vi.hoisted(() => ({
  githubLoginStart: vi.fn(async () => ({
    deviceCode: 'dev',
    userCode: 'WDJB-MJHT',
    verificationUri: 'https://github.com/login/device',
    interval: 600,
    expiresIn: 900,
  })),
  githubLoginPoll: vi.fn(async () => 'waiting'),
}))
const openUrl = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => vi.fn())

vi.mock('../../platform/api', () => ({ ...api }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }))
vi.mock('../../shared/toast/toast', () => ({ useToast: () => toast }))
vi.mock('../../platform/os', () => ({
  get isAndroid() {
    return flags.android
  },
  isMac: false,
  keys: (k: string) => k,
}))

import { SignIn } from './SyncSettings'

describe('SignIn', () => {
  const written: string[] = []
  beforeEach(() => {
    written.length = 0
    openUrl.mockReset()
    toast.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    })
  })

  it('on Android shows and copies the code first, and opens GitHub only when asked', async () => {
    flags.android = true
    render(<SignIn available />)
    await userEvent.click(screen.getByRole('button', { name: /sign in with github/i }))
    expect(await screen.findByText('WDJB-MJHT')).toBeTruthy()
    expect(written).toEqual(['WDJB-MJHT'])
    expect(toast).toHaveBeenCalledWith({ message: 'Code copied. Paste it on GitHub.' })
    expect(openUrl).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Copy code and open GitHub' }))
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://github.com/login/device'))
  })

  it('on a computer opens GitHub at once, beside the app', async () => {
    flags.android = false
    render(<SignIn available />)
    await userEvent.click(screen.getByRole('button', { name: /sign in with github/i }))
    await screen.findByText('WDJB-MJHT')
    expect(openUrl).toHaveBeenCalledWith('https://github.com/login/device')
    expect(written).toEqual([])
  })
})
