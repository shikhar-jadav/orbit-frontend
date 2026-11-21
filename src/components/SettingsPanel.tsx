import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { AccountPanel } from './AccountPanel'
import { CapabilitiesSection } from './CapabilitiesSection'
import type { AuthUser, SettingsSection, UserPreferences } from './types'
import './SettingsPanel.css'

type SettingsPanelProps = {
  user: AuthUser
  unusedRecoveryCodes: number
  preferences: UserPreferences
  onPreferencesUpdated: (prefs: UserPreferences) => void
  onClose: () => void
  onUserUpdated: (user: AuthUser) => void
  onRecoveryCodesCountUpdated: (count: number) => void
  onLoggedOut: (notice?: string, opts?: { revokeAll?: boolean; forgetUser?: boolean }) => void
  onUnauthorized: () => void
  onNavigateMarketplace?: () => void
  initialSection?: SettingsSection
}

type NavEntry = {
  id: SettingsSection
  label: string
  iconName: 'settings' | 'palette' | 'shield' | 'puzzle' | 'zap'
  keywords: string
}

const NAV_ENTRIES: NavEntry[] = [
  {
    id: 'general',
    label: 'General',
    iconName: 'settings',
    keywords: 'general language send shortcut enter ctrl keyboard chat',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    iconName: 'palette',
    keywords: 'appearance theme dark oled surface contrast colors',
  },
  {
    id: 'account',
    label: 'Account & Security',
    iconName: 'shield',
    keywords: 'account security login profile avatar email password recovery codes sessions users delete',
  },
  {
    id: 'capabilities',
    label: 'Capabilities',
    iconName: 'puzzle',
    keywords: 'capabilities skills connectors mcp tools plugins upload create custom',
  },
]

export function SettingsPanel({
  user,
  unusedRecoveryCodes,
  preferences,
  onPreferencesUpdated,
  onClose,
  onUserUpdated,
  onRecoveryCodesCountUpdated,
  onLoggedOut,
  onUnauthorized,
  onNavigateMarketplace,
  initialSection = 'general',
}: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection)
  const [navSearch, setNavSearch] = useState('')
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsSavedNotice, setPrefsSavedNotice] = useState('')
  const [childModalOpen, setChildModalOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !childModalOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, childModalOpen])

  async function savePreferences(patch: Partial<UserPreferences>) {
    const optimistic = { ...preferences, ...patch }
    onPreferencesUpdated(optimistic)
    setSavingPrefs(true)
    setPrefsSavedNotice('')
    try {
      const res = await fetch('/settings/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (res.status === 401) {
        onUnauthorized()
        return
      }
      if (res.ok) {
        const saved = (await res.json()) as UserPreferences
        onPreferencesUpdated(saved)
        setPrefsSavedNotice('Saved')
        window.setTimeout(() => setPrefsSavedNotice(''), 1800)
      }
    } catch {
      // keep optimistic update
    } finally {
      setSavingPrefs(false)
    }
  }

  const query = navSearch.trim().toLowerCase()
  const filteredNav = NAV_ENTRIES.filter(
    (item) =>
      !query ||
      item.label.toLowerCase().includes(query) ||
      item.keywords.includes(query),
  )

  return (
    <div className="sp-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <aside className="sp-sidebar" aria-label="Settings navigation">
        <div className="sp-sidebar-top">
          <button type="button" className="sp-back-btn" onClick={onClose}>
            <Icon name="chevronLeft" size={16} />
            <span>Back to app</span>
          </button>
        </div>

        <div className="sp-nav-search-wrap">
          <Icon name="search" size={13} />
          <input
            className="sp-nav-search"
            placeholder="Search"
            aria-label="Search settings"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
          />
          {navSearch && (
            <button
              type="button"
              className="sp-search-clear"
              onClick={() => setNavSearch('')}
              aria-label="Clear settings search"
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>

        <div className="sp-nav-group-label">Personal</div>
        <nav className="sp-nav" role="navigation">
          {filteredNav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sp-nav-item${activeSection === item.id ? ' active' : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              <span className="sp-nav-icon">
                <Icon name={item.iconName} size={16} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="sp-content">
        {activeSection === 'general' && (
          <div className="sp-section-content sp-section-narrow">
            <div className="sp-section-header-row">
              <h2 className="sp-section-title">General</h2>
              {prefsSavedNotice && (
                <span className="sp-saved-pill">
                  <Icon name="check" size={12} />
                  <span>{prefsSavedNotice}</span>
                </span>
              )}
            </div>

            <div className="sp-settings-group">
              <h3 className="sp-group-title">General</h3>
              <div className="sp-card-stack">
                <div className="sp-card-row">
                  <div className="sp-setting-text">
                    <strong>Language</strong>
                    <p>Language for the app UI</p>
                  </div>
                  <select
                    aria-label="Language"
                    className="sp-pill-select"
                    disabled={savingPrefs}
                    value={preferences.language}
                    onChange={(e) => void savePreferences({ language: e.target.value })}
                  >
                    <option value="auto">Auto detect</option>
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="ja">Japanese</option>
                  </select>
                </div>

                <div className="sp-card-row">
                  <div className="sp-setting-text">
                    <strong>Send shortcut</strong>
                    <p>Choose when Enter sends a prompt or inserts a new line</p>
                  </div>
                  <select
                    aria-label="Send shortcut"
                    className="sp-pill-select"
                    disabled={savingPrefs}
                    value={preferences.send_shortcut}
                    onChange={(e) =>
                      void savePreferences({
                        send_shortcut: e.target.value as 'enter' | 'ctrl_enter',
                      })
                    }
                  >
                    <option value="enter">Enter</option>
                    <option value="ctrl_enter">Ctrl + Enter</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'appearance' && (
          <div className="sp-section-content sp-section-narrow">
            <div className="sp-section-header-row">
              <h2 className="sp-section-title">Appearance</h2>
              {prefsSavedNotice && (
                <span className="sp-saved-pill">
                  <Icon name="check" size={12} />
                  <span>{prefsSavedNotice}</span>
                </span>
              )}
            </div>

            <div className="sp-settings-group">
              <h3 className="sp-group-title">Surface</h3>
              <div className="sp-card-stack">
                <div className="sp-card-row">
                  <div className="sp-setting-text">
                    <strong>Theme surface</strong>
                    <p>Adjust workspace background contrast across Orbit Agent Studio</p>
                  </div>
                  <select
                    aria-label="Theme surface"
                    className="sp-pill-select"
                    disabled={savingPrefs}
                    value={preferences.appearance}
                    onChange={(e) =>
                      void savePreferences({
                        appearance: e.target.value as 'dark' | 'midnight',
                      })
                    }
                  >
                    <option value="dark">Cosmic Charcoal</option>
                    <option value="midnight">Midnight OLED</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'account' && (
          <div className="sp-section-content">
            <h2 className="sp-section-title">Account &amp; Security</h2>
            <AccountPanel
              key={user.user_id}
              user={user}
              unusedRecoveryCodes={unusedRecoveryCodes}
              onUserUpdated={onUserUpdated}
              onRecoveryCodesCountUpdated={onRecoveryCodesCountUpdated}
              onLoggedOut={onLoggedOut}
              onUnauthorized={onUnauthorized}
              embedded
            />
          </div>
        )}

        {activeSection === 'capabilities' && (
          <div className="sp-section-content sp-section-wide">
            <h2 className="sp-section-title">Capabilities</h2>
            <CapabilitiesSection
              onNavigateMarketplace={onNavigateMarketplace}
              onCloseSettings={onClose}
              onModalOpenChange={setChildModalOpen}
            />
          </div>
        )}
      </main>
    </div>
  )
}
