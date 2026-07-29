import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Settings, UserProfile } from '../types'
import { DEFAULT_SETTINGS } from '../db/schema'
import { getProfile, getSettings, saveProfile, saveSettings } from '../db/repo'

interface AppContextValue {
  settings: Settings
  profile?: UserProfile
  loading: boolean
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement
  // On "system", an explicit data-theme on the root wins over the OS
  // preference — that is how an embedding host signals its own theme.
  const hostTheme = root.dataset.theme
  const prefersDark =
    hostTheme === 'dark' ||
    (hostTheme !== 'light' &&
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false))
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  root.classList.toggle('dark', dark)
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [profile, setProfile] = useState<UserProfile | undefined>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const [s, p] = await Promise.all([getSettings(), getProfile()])
      setSettings(s)
      setProfile(p)
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    applyTheme(settings.theme)
    if (settings.theme !== 'system') return

    // Follow the OS while set to "system", not just at load.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)

    // And follow a host that flips data-theme on the root element.
    const observer = new MutationObserver(() => applyTheme('system'))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => {
      mq.removeEventListener('change', onChange)
      observer.disconnect()
    }
  }, [settings.theme])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await saveSettings(patch))
  }, [])

  const updateProfile = useCallback(async (patch: Partial<UserProfile>) => {
    setProfile(await saveProfile(patch))
  }, [])

  const refreshProfile = useCallback(async () => {
    setProfile(await getProfile())
  }, [])

  const value = useMemo(
    () => ({
      settings,
      profile,
      loading,
      updateSettings,
      updateProfile,
      refreshProfile,
    }),
    [settings, profile, loading, updateSettings, updateProfile, refreshProfile],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
