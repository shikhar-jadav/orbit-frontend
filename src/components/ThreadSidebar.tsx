import { useEffect, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { Icon } from './Icon'
import { Tooltip } from './Tooltip'
import type { AuthUser, SettingsSection, SidebarThread, Thread } from './types'
import { computeInitials } from './userUtils'
import './ThreadSidebar.css'

type ThreadSidebarProps = {
  user: AuthUser
  sidebarExpanded: boolean
  navigateHome: () => void
  searchOpen: boolean
  setSearchOpen: Dispatch<SetStateAction<boolean>>
  setSidebarOpen: Dispatch<SetStateAction<boolean>>
  searchInputRef: RefObject<HTMLInputElement | null>
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  visibleThreads: SidebarThread[]
  hasMoreThreads: boolean
  loadingMoreThreads: boolean
  onLoadMoreThreads: () => void
  activeThreadId: string | null
  renamingThreadId: string | null
  setRenamingThreadId: Dispatch<SetStateAction<string | null>>
  renameValue: string
  setRenameValue: Dispatch<SetStateAction<string>>
  renameThread: (threadId: string, title: string) => Promise<void>
  threadMenuId: string | null
  setThreadMenuId: Dispatch<SetStateAction<string | null>>
  navigateThread: (threadId: string) => void
  setDeletingThread: Dispatch<SetStateAction<Thread | null>>
  navigateSettings: (section?: SettingsSection) => void
  navigateMarketplace: () => void
  onOpenRoutines: () => void
  unreadRoutinesCount: number
  onRequestLogout: () => void
  onRequestLogoutAll: () => void
  onRequestSwitchAccount: () => void
  onPreloadSettings?: () => void
  onPreloadMarketplace?: () => void
  onPreloadRoutines?: () => void
}

export function ThreadSidebar(props: ThreadSidebarProps) {
  const {
    user,
    sidebarExpanded,
    navigateHome,
    searchOpen,
    setSearchOpen,
    setSidebarOpen,
    searchInputRef,
    search,
    setSearch,
    visibleThreads,
    hasMoreThreads,
    loadingMoreThreads,
    onLoadMoreThreads,
    activeThreadId,
    renamingThreadId,
    setRenamingThreadId,
    renameValue,
    setRenameValue,
    renameThread,
    threadMenuId,
    setThreadMenuId,
    navigateThread,
    setDeletingThread,
    navigateSettings,
    navigateMarketplace,
    onOpenRoutines,
    unreadRoutinesCount,
    onRequestLogout,
    onRequestLogoutAll,
    onRequestSwitchAccount,
    onPreloadSettings,
    onPreloadMarketplace,
    onPreloadRoutines,
  } = props

  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const initials = computeInitials(user.display_name)

  useEffect(() => {
    if (!profileMenuOpen) return
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.sidebar-footer, .rail-bottom')) {
        setProfileMenuOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [profileMenuOpen])
  return (
    <>
      {sidebarExpanded ? (
        <aside className="sidebar sidebar-full" aria-label="Conversation sidebar">
          <div className="sidebar-header">
            <button className="orbit-brand" onClick={navigateHome} title="Orbit Home">
              <div className="orbit-brand-mark">
                <Icon name="orbit" size={20} />
              </div>
              <div className="orbit-brand-info">
                <span className="orbit-brand-name">Orbit</span>
                <span className="orbit-brand-pill">STUDIO</span>
              </div>
            </button>
            <div className="sidebar-header-actions">
              <Tooltip content="Search sessions">
                <button
                  className="icon-btn"
                  onClick={() => {
                    setSearchOpen((prev) => !prev)
                    window.setTimeout(() => searchInputRef.current?.focus(), 50)
                  }}
                  aria-label="Search sessions"
                >
                  <Icon name="search" size={16} />
                </button>
              </Tooltip>
              <Tooltip content="Collapse sidebar">
                <button
                  className="icon-btn"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Collapse sidebar"
                >
                  <Icon name="panel" size={16} />
                </button>
              </Tooltip>
            </div>
          </div>

          {searchOpen && (
            <div className="search-box">
              <Icon name="search" size={14} />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sessions..."
                aria-label="Search sessions"
              />
              {search && (
                <button className="search-clear-btn" onClick={() => setSearch('')}>
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          )}

          <div className="nav-menu">
            <button className="nav-item nav-primary-item" onClick={navigateHome}>
              <Icon name="plus" size={16} />
              <span>New</span>
              <kbd className="nav-shortcut">Ctrl K</kbd>
            </button>
            <button
              className="nav-item"
              onClick={navigateMarketplace}
              onPointerEnter={onPreloadMarketplace}
              onFocus={onPreloadMarketplace}
              title="Skills & Connectors Marketplace"
            >
              <Icon name="store" size={16} />
              <span>Marketplace</span>
            </button>
            <button
              className="nav-item"
              onClick={onOpenRoutines}
              onPointerEnter={onPreloadRoutines}
              onFocus={onPreloadRoutines}
              title="Scheduled Routines & Reminders"
            >
              <Icon name="clock" size={16} />
              <span>Routines</span>
              {unreadRoutinesCount > 0 && (
                <span className="nav-count-badge">{unreadRoutinesCount}</span>
              )}
            </button>
          </div>

          <div className="sidebar-section-divider">
            <span className="section-label">Sessions</span>
          </div>

          <div className="recents-scroll">
            {visibleThreads.length ? (
              visibleThreads.map((thread) => (
                <div
                  className={`recent-item ${thread.depth ? 'branch-thread' : ''} ${
                    thread.thread_id === activeThreadId ? 'selected' : ''
                  } ${
                    renamingThreadId === thread.thread_id ? 'renaming' : ''
                  }`}
                  key={thread.thread_id}
                  style={{ paddingLeft: `${2 + Math.min(thread.depth, 3) * 14}px` }}
                >
                  {renamingThreadId === thread.thread_id ? (
                    <form
                      className="thread-rename-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void renameThread(thread.thread_id, renameValue)
                      }}
                    >
                      <input
                        autoFocus
                        aria-label="Conversation name"
                        maxLength={72}
                        required
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            setRenamingThreadId(null)
                            setRenameValue('')
                          }
                        }}
                      />
                      <button type="submit" className="rename-confirm-btn" title="Save name" aria-label="Save name">
                        <Icon name="check" size={14} />
                      </button>
                      <button
                        type="button"
                        className="rename-cancel-btn"
                        title="Cancel"
                        aria-label="Cancel rename"
                        onClick={() => {
                          setRenamingThreadId(null)
                          setRenameValue('')
                        }}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        className="recent-link"
                        onClick={() => navigateThread(thread.thread_id)}
                        title={thread.title?.trim() || 'New chat'}
                      >
                        {thread.parent_thread_id && (
                          <Icon name="branch" size={13} className="branch-thread-icon" />
                        )}
                        <span className="recent-title">{thread.title?.trim() || thread.preview?.trim() || 'New chat'}</span>
                      </button>
                      <div className="thread-actions">
                        <button
                          className="thread-menu-toggle"
                          aria-label={`Options for ${thread.title}`}
                          title="Conversation options"
                          aria-haspopup="menu"
                          aria-expanded={threadMenuId === thread.thread_id}
                          onClick={(event) => {
                            event.stopPropagation()
                            setThreadMenuId((openId) =>
                              openId === thread.thread_id ? null : thread.thread_id,
                            )
                          }}
                        >
                          <Icon name="more" size={16} />
                        </button>
                        {threadMenuId === thread.thread_id && (
                          <div className="thread-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setRenameValue(thread.title)
                                setRenamingThreadId(thread.thread_id)
                                setThreadMenuId(null)
                              }}
                            >
                              <Icon name="edit" size={14} />
                              <span>Rename</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="thread-menu-delete"
                              onClick={() => {
                                setThreadMenuId(null)
                                setDeletingThread(thread)
                              }}
                            >
                              <Icon name="trash" size={14} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))
            ) : (
              <p className="empty-recents">{search ? 'No matching sessions.' : 'No sessions recorded yet.'}</p>
            )}
            {hasMoreThreads && !search && (
              <button
                type="button"
                className="sidebar-load-more"
                onClick={onLoadMoreThreads}
                disabled={loadingMoreThreads}
              >
                {loadingMoreThreads ? 'Loading more sessions…' : 'Load more sessions'}
              </button>
            )}
          </div>

          <div className="sidebar-footer">
            {profileMenuOpen && (
              <div className="profile-menu" role="menu" aria-label="Account menu">
                <div className="profile-menu-header">
                  <div className="profile-menu-name">{user.display_name}</div>
                  <div className="profile-menu-email">{user.email}</div>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onPointerEnter={onPreloadSettings}
                  onFocus={onPreloadSettings}
                  onClick={() => {
                    setProfileMenuOpen(false)
                    navigateSettings('general')
                  }}
                >
                  <Icon name="settings" size={14} />
                  <span>Settings</span>
                </button>
                <div className="profile-menu-divider" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    onRequestSwitchAccount()
                  }}
                >
                  <Icon name="users" size={14} />
                  <span>Switch account</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    onRequestLogoutAll()
                  }}
                >
                  <Icon name="shield" size={14} />
                  <span>Log out all devices</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="profile-menu-logout"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    onRequestLogout()
                  }}
                >
                  <Icon name="logOut" size={14} />
                  <span>Log out</span>
                </button>
              </div>
            )}
            <button
              className="profile-row"
              onClick={() => setProfileMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              title="Account & workspace menu"
            >
              <div className="avatar-circle" style={{ background: user.avatar_color }}>
                {initials}
              </div>
              <div className="profile-info">
                <span className="profile-name">{user.display_name}</span>
                <span className="profile-tier">{user.email}</span>
              </div>
              <Icon name="chevron" size={14} className="footer-settings-icon" />
            </button>
          </div>
        </aside>
      ) : (
        /* -------------------- COLLAPSED RAIL -------------------- */
        <aside className="sidebar sidebar-rail" aria-label="Collapsed sidebar">
          <div className="rail-top">
            <Tooltip side="right" content="Expand Orbit sidebar">
              <button className="rail-btn rail-brand-btn" onClick={() => setSidebarOpen(true)} aria-label="Expand Orbit sidebar">
                <Icon name="orbit" size={22} />
              </button>
            </Tooltip>
            <Tooltip side="right" content="New session (⌘K)">
              <button className="rail-btn" onClick={navigateHome} aria-label="New session (⌘K)">
                <Icon name="newchat" size={17} />
              </button>
            </Tooltip>
            <Tooltip side="right" content="Marketplace & Skills">
              <button
                className="rail-btn"
                onClick={navigateMarketplace}
                onPointerEnter={onPreloadMarketplace}
                onFocus={onPreloadMarketplace}
                aria-label="Marketplace & Skills"
              >
                <Icon name="store" size={17} />
              </button>
            </Tooltip>
            <Tooltip side="right" content="Scheduled Routines & Reminders">
              <button
                className={`rail-btn ${unreadRoutinesCount > 0 ? 'rail-btn-unread' : ''}`}
                onClick={onOpenRoutines}
                onPointerEnter={onPreloadRoutines}
                onFocus={onPreloadRoutines}
                aria-label="Scheduled Routines & Reminders"
              >
                <Icon name="clock" size={17} />
              </button>
            </Tooltip>
            <Tooltip side="right" content="Search sessions">
              <button
                className="rail-btn"
                onClick={() => {
                  setSidebarOpen(true)
                  setSearchOpen(true)
                  window.setTimeout(() => searchInputRef.current?.focus(), 50)
                }}
                aria-label="Search sessions"
              >
                <Icon name="search" size={17} />
              </button>
            </Tooltip>
            <Tooltip side="right" content="Sessions history">
              <button className="rail-btn" onClick={() => setSidebarOpen(true)} aria-label="Sessions history">
                <Icon name="chat" size={17} />
              </button>
            </Tooltip>
          </div>
          <div className="rail-bottom">
            <Tooltip side="right" content="Settings">
              <button
                className="rail-btn"
                onClick={() => navigateSettings('general')}
                onPointerEnter={onPreloadSettings}
                onFocus={onPreloadSettings}
                aria-label="Settings"
              >
                <Icon name="settings" size={16} />
              </button>
            </Tooltip>
            <Tooltip side="right" content="Log out">
              <button className="rail-btn" onClick={onRequestLogout} aria-label="Log out">
                <Icon name="logOut" size={16} />
              </button>
            </Tooltip>
            <Tooltip side="right" content={`${user.display_name} — Settings & Account`}>
              <button
                className="rail-btn rail-avatar"
                onClick={() => navigateSettings('account')}
                onPointerEnter={onPreloadSettings}
                onFocus={onPreloadSettings}
                aria-label={`${user.display_name} — Settings & Account`}
              >
                <div className="avatar-circle-sm" style={{ background: user.avatar_color }}>
                  {initials}
                </div>
              </button>
            </Tooltip>
          </div>
        </aside>
      )}
    </>
  )
}
