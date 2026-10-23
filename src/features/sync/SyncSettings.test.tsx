import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  githubRepos: vi.fn(),
  githubInstallUrl: vi.fn(async () => 'https://github.com/apps/moss/installations/new'),
}))
const openUrl = vi.hoisted(() => vi.fn())

vi.mock('../../platform/api', () => ({ ...api }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }))

import { ExistingRepo } from './SyncSettings'

const repo = {
  fullName: 'me/moss-data',
  private: true,
  defaultBranch: 'main',
  cloneUrl: 'https://github.com/me/moss-data.git',
  empty: true,
}

describe('ExistingRepo', () => {
  beforeEach(() => {
    api.githubRepos.mockReset()
    openUrl.mockReset()
  })

  it('sends you to GitHub to choose repositories when none are chosen yet', async () => {
    api.githubRepos.mockResolvedValue([])
    render(<ExistingRepo onUse={async () => {}} />)
    const choose = await screen.findByRole('button', { name: /choose repositories on github/i })
    expect(screen.getByText(/nothing else/i)).toBeTruthy()
    await userEvent.click(choose)
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://github.com/apps/moss/installations/new'))
  })

  it('lists only what GitHub returned and connects the one you pick', async () => {
    api.githubRepos.mockResolvedValue([repo])
    const onUse = vi.fn(async () => {})
    render(<ExistingRepo onUse={onUse} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Use' }))
    expect(onUse).toHaveBeenCalledWith(repo)
  })
})
