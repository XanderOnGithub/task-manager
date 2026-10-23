// In the phone layout every panel header starts with a button that opens the
// sidebar drawer. App provides the way to open it; `PanelHeader` reads it. On a
// wide window there is no provider, so no button shows.

import { createContext, useContext } from 'react'

export const CompactNavContext = createContext<{ openMenu: () => void } | null>(null)

export const useCompactNav = () => useContext(CompactNavContext)
