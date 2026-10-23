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

describe('SignIn while waiting for approval', () => {
  it('keeps waiting through a network failure, and asks again when the app comes back', async () => {
    flags.android = true
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } })
    api.githubLoginPoll.mockReset()
    api.githubLoginPoll
      .mockRejectedValueOnce('Couldn\'t reach GitHub (failed to lookup address information: No address associated with hostname). Check the connection.')
      .mockResolvedValue('waiting')
    render(<SignIn available />)
    await userEvent.click(screen.getByRole('button', { name: /sign in with github/i }))
    await screen.findByText('WDJB-MJHT')

    // Back from the browser: it asks at once. The first answer is a network failure.
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(api.githubLoginPoll).toHaveBeenCalledTimes(1))
    // The code is still there, nothing went red, and it asks again.
    expect(screen.getByText('WDJB-MJHT')).toBeTruthy()
    expect(screen.queryByText(/couldn't reach/i)).toBeNull()
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(api.githubLoginPoll).toHaveBeenCalledTimes(2))
  })

  it('stops when GitHub says the code expired', async () => {
    flags.android = true
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } })
    api.githubLoginPoll.mockReset()
    api.githubLoginPoll.mockRejectedValue('The code expired. Sign in again.')
    render(<SignIn available />)
    await userEvent.click(screen.getByRole('button', { name: /sign in with github/i }))
    await screen.findByText('WDJB-MJHT')
    window.dispatchEvent(new Event('focus'))
    expect(await screen.findByText('The code expired. Sign in again.')).toBeTruthy()
    expect(screen.queryByText('WDJB-MJHT')).toBeNull()
  })
})
