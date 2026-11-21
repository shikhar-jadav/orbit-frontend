import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from './Icon'
import type { AdminUserSummary, AuthUser, UserSessionItem } from './types'
import {
  AVATAR_SWATCHES,
  computeInitials,
  downloadTextFile,
  forgetRecentAccount,
  formatIsoDate,
  passwordStrength,
} from './userUtils'
import './AccountPanel.css'

type AccountTab = 'profile' | 'security' | 'sessions' | 'users'

type AccountPanelProps = {
  user: AuthUser
  unusedRecoveryCodes: number
  onUserUpdated: (user: AuthUser) => void
  onRecoveryCodesCountUpdated: (count: number) => void
  onLoggedOut: (notice?: string, options?: { forgetUser?: boolean; revokeAll?: boolean }) => void
  onUnauthorized: () => void
  onClose?: () => void
  embedded?: boolean
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string }
    if (data?.detail) return data.detail
  } catch {
    // ignore parse failure
  }
  return fallback
}

export function AccountPanel({
  user,
  unusedRecoveryCodes,
  onUserUpdated,
  onRecoveryCodesCountUpdated,
  onLoggedOut,
  onUnauthorized,
  onClose,
  embedded = false,
}: AccountPanelProps) {
  const [activeTab, setActiveTab] = useState<AccountTab>('profile')
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  // Profile tab
  const [displayName, setDisplayName] = useState(user.display_name)
  const [email, setEmail] = useState(user.email)
  const [avatarColor, setAvatarColor] = useState(user.avatar_color)
  const [emailConfirmPassword, setEmailConfirmPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // Security tab: password + recovery codes + delete
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [revokeOthersOnPwChange, setRevokeOthersOnPwChange] = useState(true)
  const [savingPassword, setSavingPassword] = useState(false)

  const [regenPassword, setRegenPassword] = useState('')
  const [regeneratingCodes, setRegeneratingCodes] = useState(false)
  const [freshCodes, setFreshCodes] = useState<string[]>([])
  const [codesCopied, setCodesCopied] = useState(false)

  const [deletePassword, setDeletePassword] = useState('')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)

  // Sessions tab
  const [sessions, setSessions] = useState<UserSessionItem[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)

  // Admin Users tab
  const [adminUsers, setAdminUsers] = useState<AdminUserSummary[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [issuedAdminCode, setIssuedAdminCode] = useState<{
    email: string
    code: string
  } | null>(null)

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const response = await fetch('/auth/sessions')
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) throw new Error(await readErrorMessage(response, 'Failed to load sessions.'))
      const data = (await response.json()) as { sessions: UserSessionItem[] }
      setSessions(data.sessions || [])
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to load active sessions.',
      })
    } finally {
      setLoadingSessions(false)
    }
  }, [onUnauthorized])

  const loadAdminUsers = useCallback(async () => {
    if (user.role !== 'admin') return
    setLoadingUsers(true)
    try {
      const response = await fetch('/auth/admin/users')
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) throw new Error(await readErrorMessage(response, 'Failed to load users.'))
      const data = (await response.json()) as { users: AdminUserSummary[] }
      setAdminUsers(data.users || [])
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to load workspace users.',
      })
    } finally {
      setLoadingUsers(false)
    }
  }, [onUnauthorized, user.role])

  function selectTab(nextTab: AccountTab) {
    setActiveTab(nextTab)
    setFeedback(null)
    if (nextTab === 'sessions') {
      void loadSessions()
    } else if (nextTab === 'users' && user.role === 'admin') {
      void loadAdminUsers()
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setFeedback(null)
    setSavingProfile(true)
    const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase()
    try {
      const response = await fetch('/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          email,
          avatar_color: avatarColor,
          current_password: emailChanged ? emailConfirmPassword : undefined,
        }),
      })
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) {
        setFeedback({ kind: 'error', text: await readErrorMessage(response, 'Could not update profile.') })
        return
      }
      const data = (await response.json()) as { user: AuthUser }
      onUserUpdated(data.user)
      setEmailConfirmPassword('')
      setFeedback({ kind: 'success', text: 'Profile updated.' })
    } catch {
      setFeedback({ kind: 'error', text: 'Network error while saving profile.' })
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    setFeedback(null)
    if (newPassword.length < 8) {
      setFeedback({ kind: 'error', text: 'New password must be at least 8 characters long.' })
      return
    }
    if (newPassword !== confirmNewPassword) {
      setFeedback({ kind: 'error', text: 'New passwords do not match.' })
      return
    }
    setSavingPassword(true)
    try {
      const response = await fetch('/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          revoke_other_sessions: revokeOthersOnPwChange,
        }),
      })
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) {
        setFeedback({ kind: 'error', text: await readErrorMessage(response, 'Could not change password.') })
        return
      }
      const data = (await response.json()) as { revoked_other_sessions: number }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setFeedback({
        kind: 'success',
        text: data.revoked_other_sessions
          ? `Password updated and ${data.revoked_other_sessions} other session(s) signed out.`
          : 'Password updated successfully.',
      })
    } catch {
      setFeedback({ kind: 'error', text: 'Network error while updating password.' })
    } finally {
      setSavingPassword(false)
    }
  }

  async function regenerateCodes(event: FormEvent) {
    event.preventDefault()
    setFeedback(null)
    setRegeneratingCodes(true)
    try {
      const response = await fetch('/auth/recovery-codes/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: regenPassword }),
      })
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) {
        setFeedback({ kind: 'error', text: await readErrorMessage(response, 'Could not regenerate recovery codes.') })
        return
      }
      const data = (await response.json()) as {
        recovery_codes: string[]
        unused_recovery_codes: number
      }
      setFreshCodes(data.recovery_codes)
      onRecoveryCodesCountUpdated(data.unused_recovery_codes)
      setRegenPassword('')
      setFeedback({
        kind: 'success',
        text: 'Generated 8 new single-use recovery codes. Previous codes are now invalid.',
      })
    } catch {
      setFeedback({ kind: 'error', text: 'Network error while regenerating codes.' })
    } finally {
      setRegeneratingCodes(false)
    }
  }

  async function revokeSingleSession(sessionId: string) {
    setFeedback(null)
    try {
      const response = await fetch(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      })
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) {
        setFeedback({ kind: 'error', text: await readErrorMessage(response, 'Could not revoke session.') })
        return
      }
      const data = (await response.json()) as { is_current: boolean }
      if (data.is_current) {
        onLoggedOut('Current session signed out.')
        return
      }
      setSessions((prev) => prev.filter((item) => item.session_id !== sessionId))
      setFeedback({ kind: 'success', text: 'Session revoked.' })
    } catch {
      setFeedback({ kind: 'error', text: 'Network error while revoking session.' })
    }
  }

  async function revokeAllOtherSessions(keepCurrent: boolean) {
    setFeedback(null)
    try {
      const response = await fetch('/auth/logout-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_current: keepCurrent }),
      })
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) {
        setFeedback({ kind: 'error', text: await readErrorMessage(response, 'Could not revoke sessions.') })
        return
      }
      const data = (await response.json()) as { revoked_count: number; signed_out_current: boolean }
      if (data.signed_out_current) {
        onLoggedOut('Signed out from all active devices.', { revokeAll: true })
        return
      }
      setSessions((prev) => prev.filter((s) => s.is_current))
      setFeedback({
        kind: 'success',
        text: `Signed out of ${data.revoked_count} other session(s).`,
      })
    } catch {
      setFeedback({ kind: 'error', text: 'Network error while signing out sessions.' })
    }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault()
    setFeedback(null)
    setDeletingAccount(true)
    try {
      const response = await fetch('/auth/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) {
        setFeedback({ kind: 'error', text: await readErrorMessage(response, 'Could not delete account.') })
        return
      }
      forgetRecentAccount(user.email)
      onLoggedOut(
        'Your account and all personal workspace data have been permanently deleted.',
        { forgetUser: true },
      )
    } catch {
      setFeedback({ kind: 'error', text: 'Network error while deleting account.' })
    } finally {
      setDeletingAccount(false)
    }
  }

  async function updateAdminUser(
    targetUserId: string,
    patch: { role?: 'admin' | 'member'; is_active?: boolean },
  ) {
    setFeedback(null)
    try {
      const response = await fetch(`/auth/admin/users/${encodeURIComponent(targetUserId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) {
        setFeedback({ kind: 'error', text: await readErrorMessage(response, 'Could not update user.') })
        return
      }
      const data = (await response.json()) as { user: AuthUser }
      setAdminUsers((prev) =>
        prev.map((u) => (u.user_id === targetUserId ? { ...u, ...data.user } : u)),
      )
      setFeedback({ kind: 'success', text: `Updated ${data.user.display_name}.` })
    } catch {
      setFeedback({ kind: 'error', text: 'Network error while updating user.' })
    }
  }

  async function issueAdminResetCode(targetUserId: string) {
    setFeedback(null)
    try {
      const response = await fetch(`/auth/admin/users/${encodeURIComponent(targetUserId)}/reset-code`, {
        method: 'POST',
      })
      if (response.status === 401) {
        onUnauthorized()
        return
      }
      if (!response.ok) {
        setFeedback({ kind: 'error', text: await readErrorMessage(response, 'Could not generate reset code.') })
        return
      }
      const data = (await response.json()) as { email: string; recovery_code: string }
      setIssuedAdminCode({ email: data.email, code: data.recovery_code })
    } catch {
      setFeedback({ kind: 'error', text: 'Network error while generating reset code.' })
    }
  }

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase()
  const strength = passwordStrength(newPassword)

  return (
    <div className={embedded ? 'account-container account-embedded' : 'account-container'}>
      <div className="account-shell">
        <div className="account-header">
          <div className="account-header-left">
            <div className="account-hero-avatar" style={{ background: user.avatar_color }}>
              {computeInitials(user.display_name)}
            </div>
            <div>
              <h2>
                <span>{user.display_name}</span>
                <span className={`account-role-badge ${user.role}`}>
                  {user.role === 'admin' ? 'Admin' : 'Member'}
                </span>
              </h2>
              <p className="account-subtitle">{user.email}</p>
            </div>
          </div>

          <div className="account-header-actions">
            <button
              type="button"
              className="account-secondary-btn"
              onClick={() => void onLoggedOut()}
            >
              <Icon name="logOut" size={14} />
              <span>Sign Out</span>
            </button>
            {!embedded && onClose && (
              <button className="icon-btn" onClick={onClose} title="Back to workspace" aria-label="Close account panel">
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="account-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'profile'}
            className={`account-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => selectTab('profile')}
          >
            <Icon name="user" size={14} />
            <span>Profile</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'security'}
            className={`account-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => selectTab('security')}
          >
            <Icon name="shield" size={14} />
            <span>Password &amp; Recovery</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'sessions'}
            className={`account-tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => selectTab('sessions')}
          >
            <Icon name="key" size={14} />
            <span>Active Sessions</span>
          </button>
          {user.role === 'admin' && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'users'}
              className={`account-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => selectTab('users')}
            >
              <Icon name="users" size={14} />
              <span>Workspace Users</span>
            </button>
          )}
        </div>

        {feedback && (
          <div
            className={`auth-banner ${
              feedback.kind === 'error' ? 'auth-banner-error' : 'auth-banner-success'
            }`}
            role={feedback.kind === 'error' ? 'alert' : 'status'}
          >
            <Icon name={feedback.kind === 'error' ? 'alertTriangle' : 'checkCircle'} size={16} />
            <span>{feedback.text}</span>
          </div>
        )}

        {/* ==================== TAB 1: PROFILE ==================== */}
        {activeTab === 'profile' && (
          <>
            <form className="account-card" onSubmit={(e) => void saveProfile(e)}>
              <div className="account-card-header">
                <div>
                  <h3 className="account-card-title">Personal Profile</h3>
                  <p className="account-card-desc">
                    Update how your profile appears across Orbit Agent Studio.
                  </p>
                </div>
              </div>

              <div className="account-form-grid">
                <div className="auth-field">
                  <label className="auth-label" htmlFor="acct-name">Display Name</label>
                  <input
                    id="acct-name"
                    className="auth-input"
                    type="text"
                    required
                    maxLength={64}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="acct-email">Email Address</label>
                  <input
                    id="acct-email"
                    className="auth-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="auth-field account-form-full">
                  <span className="auth-label">Avatar Color</span>
                  <div className="auth-avatar-row">
                    <div className="auth-avatar-preview" style={{ background: avatarColor }}>
                      {computeInitials(displayName)}
                    </div>
                    <div className="auth-swatch-list">
                      {AVATAR_SWATCHES.map((color) => (
                        <button
                          type="button"
                          key={color}
                          className={`auth-swatch ${avatarColor === color ? 'selected' : ''}`}
                          style={{ background: color }}
                          aria-label={`Choose color ${color}`}
                          onClick={() => setAvatarColor(color)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {emailChanged && (
                  <div className="auth-field account-form-full">
                    <label className="auth-label" htmlFor="acct-email-pw">
                      Current Password (required to change email)
                    </label>
                    <input
                      id="acct-email-pw"
                      className="auth-input"
                      type="password"
                      required
                      placeholder="Confirm your current password"
                      value={emailConfirmPassword}
                      onChange={(e) => setEmailConfirmPassword(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="account-btn-row">
                <button type="submit" className="account-primary-btn" disabled={savingProfile}>
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>

            <div className="account-card">
              <h3 className="account-card-title">Account Summary</h3>
              <div className="account-meta-grid">
                <div className="account-meta-tile">
                  <span className="account-meta-label">Account Role</span>
                  <span className="account-meta-value">
                    {user.role === 'admin' ? 'Administrator' : 'Member'}
                  </span>
                </div>
                <div className="account-meta-tile">
                  <span className="account-meta-label">Created</span>
                  <span className="account-meta-value">{formatIsoDate(user.created_at)}</span>
                </div>
                <div className="account-meta-tile">
                  <span className="account-meta-label">Last Sign In</span>
                  <span className="account-meta-value">{formatIsoDate(user.last_login_at)}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ==================== TAB 2: SECURITY & RECOVERY ==================== */}
        {activeTab === 'security' && (
          <>
            <form className="account-card" onSubmit={(e) => void changePassword(e)}>
              <div>
                <h3 className="account-card-title">Change Password</h3>
                <p className="account-card-desc">
                  Choose a strong password of at least 8 characters.
                </p>
              </div>

              <div className="account-form-grid">
                <div className="auth-field account-form-full">
                  <label className="auth-label" htmlFor="sec-cur-pw">Current Password</label>
                  <input
                    id="sec-cur-pw"
                    className="auth-input"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="sec-new-pw">New Password</label>
                  <input
                    id="sec-new-pw"
                    className="auth-input"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <div className="auth-strength-bar" aria-hidden="true">
                    {[1, 2, 3].map((idx) => (
                      <span
                        key={idx}
                        className={`auth-strength-segment ${
                          strength.score >= idx ? strength.tone : ''
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="sec-confirm-pw">Confirm New Password</label>
                  <input
                    id="sec-confirm-pw"
                    className="auth-input"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                  />
                </div>
              </div>

              <label className="auth-checkbox-row">
                <input
                  type="checkbox"
                  checked={revokeOthersOnPwChange}
                  onChange={(e) => setRevokeOthersOnPwChange(e.target.checked)}
                />
                <span>Sign out all other active devices after changing password</span>
              </label>

              <div className="account-btn-row">
                <button type="submit" className="account-primary-btn" disabled={savingPassword}>
                  {savingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>

            <form className="account-card" onSubmit={(e) => void regenerateCodes(e)}>
              <div className="account-card-header">
                <div>
                  <h3 className="account-card-title">Backup Recovery Codes</h3>
                  <p className="account-card-desc">
                    Used for offline password recovery. You currently have{' '}
                    <strong>{unusedRecoveryCodes}</strong> unused recovery code(s).
                  </p>
                </div>
              </div>

              {freshCodes.length > 0 && (
                <>
                  <div className="recovery-codes-grid">
                    {freshCodes.map((code) => (
                      <code className="recovery-code-item" key={code}>
                        {code}
                      </code>
                    ))}
                  </div>
                  <div className="recovery-actions-row">
                    <button
                      type="button"
                      className="account-secondary-btn"
                      onClick={async () => {
                        await navigator.clipboard.writeText(freshCodes.join('\n')).catch(() => {})
                        setCodesCopied(true)
                        window.setTimeout(() => setCodesCopied(false), 1800)
                      }}
                    >
                      <Icon name={codesCopied ? 'check' : 'copy'} size={14} />
                      <span>{codesCopied ? 'Copied!' : 'Copy codes'}</span>
                    </button>
                    <button
                      type="button"
                      className="account-secondary-btn"
                      onClick={() =>
                        downloadTextFile(
                          'orbit-recovery-codes.txt',
                          `Orbit Agent Studio Recovery Codes (${user.email})\n\n${freshCodes.join('\n')}\n`,
                        )
                      }
                    >
                      <Icon name="download" size={14} />
                      <span>Download .txt</span>
                    </button>
                  </div>
                </>
              )}

              <div className="account-form-grid">
                <div className="auth-field account-form-full">
                  <label className="auth-label" htmlFor="regen-pw">
                    Confirm Current Password to Generate New Codes
                  </label>
                  <input
                    id="regen-pw"
                    className="auth-input"
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="Enter password to replace old backup codes"
                    value={regenPassword}
                    onChange={(e) => setRegenPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="account-btn-row">
                <button type="submit" className="account-secondary-btn" disabled={regeneratingCodes}>
                  <Icon name="refresh" size={14} />
                  <span>{regeneratingCodes ? 'Generating...' : 'Regenerate 8 Recovery Codes'}</span>
                </button>
              </div>
            </form>

            <div className="account-card account-card-danger">
              <div>
                <h3 className="account-card-title">Danger Zone — Delete Account</h3>
                <p className="account-card-desc">
                  Permanently removes your account, conversations, uploaded files, workspaces, and connector credentials. This cannot be undone.
                </p>
              </div>

              {!confirmDeleteOpen ? (
                <div>
                  <button
                    type="button"
                    className="account-danger-btn"
                    onClick={() => setConfirmDeleteOpen(true)}
                  >
                    <Icon name="trash" size={14} />
                    <span>Delete My Account</span>
                  </button>
                </div>
              ) : (
                <form className="auth-form" onSubmit={(e) => void deleteAccount(e)}>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="delete-pw">
                      Enter Password to Confirm Permanent Deletion
                    </label>
                    <input
                      id="delete-pw"
                      className="auth-input"
                      type="password"
                      autoComplete="current-password"
                      required
                      placeholder="Current password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                    />
                  </div>
                  <div className="account-btn-row">
                    <button
                      type="submit"
                      className="account-danger-btn"
                      disabled={deletingAccount}
                    >
                      {deletingAccount ? 'Deleting...' : 'Permanently Delete Account'}
                    </button>
                    <button
                      type="button"
                      className="account-secondary-btn"
                      onClick={() => {
                        setConfirmDeleteOpen(false)
                        setDeletePassword('')
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}

        {/* ==================== TAB 3: ACTIVE SESSIONS ==================== */}
        {activeTab === 'sessions' && (
          <div className="account-card">
            <div className="account-card-header">
              <div>
                <h3 className="account-card-title">Active Login Sessions</h3>
                <p className="account-card-desc">
                  Devices currently signed into your Orbit account.
                </p>
              </div>
              <div className="account-btn-row">
                <button
                  type="button"
                  className="account-secondary-btn"
                  onClick={() => void revokeAllOtherSessions(true)}
                >
                  Sign Out Other Devices
                </button>
                <button
                  type="button"
                  className="account-danger-btn"
                  onClick={() => void revokeAllOtherSessions(false)}
                >
                  Sign Out Everywhere
                </button>
              </div>
            </div>

            {loadingSessions ? (
              <p className="account-card-desc">Loading active sessions...</p>
            ) : sessions.length === 0 ? (
              <p className="account-card-desc">No active sessions found.</p>
            ) : (
              <div className="account-list">
                {sessions.map((session) => (
                  <div className="session-item-row" key={session.session_id}>
                    <div className="session-item-main">
                      <div className="session-title-row">
                        <span className="session-device">{session.device_label}</span>
                        {session.is_current && <span className="session-pill">Current Session</span>}
                        <span className="session-pill session-pill-muted">
                          {session.remember_me ? '30-day session' : '24h session'}
                        </span>
                      </div>
                      <span className="session-meta">
                        IP: {session.ip_address || 'local'} · Last seen: {formatIsoDate(session.last_seen_at)} · Expires: {formatIsoDate(session.expires_at)}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="account-secondary-btn"
                      onClick={() => void revokeSingleSession(session.session_id)}
                    >
                      {session.is_current ? 'Sign Out' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 4: ADMIN USERS ==================== */}
        {activeTab === 'users' && user.role === 'admin' && (
          <div className="account-card">
            <div className="account-card-header">
              <div>
                <h3 className="account-card-title">Workspace Accounts Directory</h3>
                <p className="account-card-desc">
                  Manage local user roles, account status, and issue offline recovery codes.
                </p>
              </div>
              <button
                type="button"
                className="account-secondary-btn"
                onClick={() => void loadAdminUsers()}
              >
                <Icon name="refresh" size={14} />
                <span>Refresh</span>
              </button>
            </div>

            {issuedAdminCode && (
              <div className="admin-reset-box">
                <div>
                  <strong>Temporary recovery code for {issuedAdminCode.email}:</strong>
                  <div style={{ marginTop: 4 }}>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {issuedAdminCode.code}
                    </code>
                  </div>
                </div>
                <div className="account-btn-row">
                  <button
                    type="button"
                    className="account-secondary-btn"
                    onClick={() => void navigator.clipboard.writeText(issuedAdminCode.code).catch(() => {})}
                  >
                    <Icon name="copy" size={13} />
                    <span>Copy</span>
                  </button>
                  <button
                    type="button"
                    className="account-secondary-btn"
                    onClick={() => setIssuedAdminCode(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {loadingUsers ? (
              <p className="account-card-desc">Loading workspace users...</p>
            ) : (
              <div className="account-list">
                {adminUsers.map((member) => {
                  const isSelf = member.user_id === user.user_id
                  return (
                    <div className="admin-user-row" key={member.user_id}>
                      <div className="admin-user-main">
                        <div className="admin-user-title-row">
                          <span className="session-device">{member.display_name}</span>
                          {isSelf && <span className="session-pill">You</span>}
                          <span
                            className={`session-pill ${member.is_active ? '' : 'session-pill-muted'}`}
                          >
                            {member.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <span className="session-meta">
                          {member.email} · {member.thread_count} thread(s) · Last login: {formatIsoDate(member.last_login_at)}
                        </span>
                      </div>

                      <div className="admin-controls">
                        <select
                          aria-label={`Role for ${member.email}`}
                          className="admin-role-select"
                          disabled={isSelf}
                          value={member.role}
                          onChange={(e) =>
                            void updateAdminUser(member.user_id, {
                              role: e.target.value as 'admin' | 'member',
                            })
                          }
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>

                        {!isSelf && (
                          <button
                            type="button"
                            className="account-secondary-btn"
                            onClick={() =>
                              void updateAdminUser(member.user_id, {
                                is_active: !member.is_active,
                              })
                            }
                          >
                            {member.is_active ? 'Disable' : 'Enable'}
                          </button>
                        )}

                        <button
                          type="button"
                          className="account-secondary-btn"
                          onClick={() => void issueAdminResetCode(member.user_id)}
                        >
                          Reset Code
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
