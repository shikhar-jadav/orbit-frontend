import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import type { AuthDiscoverResponse, AuthUser } from './types'
import {
  AVATAR_SWATCHES,
  computeInitials,
  downloadTextFile,
  forgetRecentAccount,
  getRecentAccounts,
  passwordStrength,
  type RecentAuthAccount,
} from './userUtils'
import './AuthScreen.css'
import './AuthExperience.css'

export type AuthViewMode = 'login' | 'signup' | 'recovery' | 'logged-out'

export type AuthScreenProps = {
  hasUsers: boolean
  emailOtpEnabled: boolean
  initialView?: AuthViewMode
  initialNotice?: string | null
  lastSignedOutUser?: RecentAuthAccount | null
  revokedAllDevices?: boolean
  onViewChange?: (view: AuthViewMode) => void
  onAuthenticated: (
    user: AuthUser,
    unusedRecoveryCodes: number,
    options?: { isFirstAdmin?: boolean },
  ) => void
}

type AuthStep =
  | 'identify'
  | 'login-password'
  | 'login-otp'
  | 'signup-details'
  | 'recovery'
  | 'backup-codes'
  | 'logged-out'

type RecoveryMethod = 'otp' | 'backup'

type PendingSignupResult = {
  user: AuthUser
  unusedRecoveryCodes: number
  isFirstAdmin: boolean
  recoveryCodes: string[]
}

const BACKEND_WAKE_RETRY_DELAYS_MS = [
  1500, 3000, 5000, 8000, 10000, 10000, 10000, 10000, 10000,
]

function isBackendGatewayUnavailable(response: Response): boolean {
  return response.status >= 502 && response.status <= 504
}

/**
 * Render's free backend can sleep while idle. A failed first request wakes it,
 * but the service can take around a minute to become ready. Poll the cheap
 * session endpoint rather than repeating the POST (which also avoids consuming
 * the email-discovery rate limit during a cold start).
 */
async function fetchAfterBackendWake(
  request: () => Promise<Response>,
  onWake: () => void,
): Promise<Response> {
  const initialResponse = await request()
  if (!isBackendGatewayUnavailable(initialResponse)) return initialResponse

  onWake()
  let lastUnavailableResponse = initialResponse

  for (const delayMs of BACKEND_WAKE_RETRY_DELAYS_MS) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))

    try {
      const healthResponse = await fetch('/auth/session', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      })

      if (
        healthResponse.ok &&
        (healthResponse.headers.get('content-type') || '').includes('application/json')
      ) {
        const retryResponse = await request()
        if (isBackendGatewayUnavailable(retryResponse)) {
          lastUnavailableResponse = retryResponse
          continue
        }
        return retryResponse
      }

      if (isBackendGatewayUnavailable(healthResponse)) {
        lastUnavailableResponse = healthResponse
        continue
      }

      if (!healthResponse.ok) return healthResponse
    } catch {
      // Keep polling through temporary proxy/network errors while the backend starts.
    }
  }

  return lastUnavailableResponse
}

async function readErrorDetail(res: Response, fallback: string): Promise<string> {
  if (isBackendGatewayUnavailable(res)) {
    return 'Orbit could not reach its backend after waiting for it to start. Please try again in a moment.'
  }
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string' && data.detail.trim()) {
      return data.detail
    }
  } catch {
    // Ignore non-JSON error responses
  }
  return fallback
}

function stepFromView(view: AuthViewMode | undefined, hasUsers: boolean): AuthStep {
  if (view === 'logged-out') return 'logged-out'
  if (view === 'signup') return 'signup-details'
  if (view === 'recovery') return 'recovery'
  if (!hasUsers && view !== 'login') return 'signup-details'
  return 'identify'
}

function OtpDigitInput({
  value,
  disabled,
  onChange,
  onComplete,
}: {
  value: string
  disabled?: boolean
  onChange: (next: string) => void
  onComplete?: (fullCode: string) => void
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length: 6 }, (_, idx) => value[idx] || '')

  const handleDigitChange = (idx: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, '')
    if (!cleaned) {
      const nextArr = [...digits]
      nextArr[idx] = ''
      onChange(nextArr.join(''))
      return
    }

    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, 6)
      onChange(pasted)
      const focusIdx = Math.min(5, pasted.length - 1)
      inputRefs.current[focusIdx]?.focus()
      if (pasted.length === 6 && onComplete) {
        onComplete(pasted)
      }
      return
    }

    const nextArr = [...digits]
    nextArr[idx] = cleaned[0]
    const joined = nextArr.join('')
    onChange(joined)
    if (idx < 5) {
      inputRefs.current[idx + 1]?.focus()
    }
    if (joined.length === 6 && !nextArr.includes('') && onComplete) {
      onComplete(joined)
    }
  }

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const nextArr = [...digits]
        nextArr[idx] = ''
        onChange(nextArr.join(''))
      } else if (idx > 0) {
        const nextArr = [...digits]
        nextArr[idx - 1] = ''
        onChange(nextArr.join(''))
        inputRefs.current[idx - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    } else if (e.key === 'ArrowRight' && idx < 5) {
      inputRefs.current[idx + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedDigits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pastedDigits) return
    e.preventDefault()
    onChange(pastedDigits)
    const focusIdx = Math.min(5, Math.max(0, pastedDigits.length - 1))
    inputRefs.current[focusIdx]?.focus()
    if (pastedDigits.length === 6 && onComplete) {
      onComplete(pastedDigits)
    }
  }

  return (
    <div className="auth-otp-grid" role="group" aria-label="6-digit verification code">
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => {
            inputRefs.current[idx] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          className="auth-otp-box"
          value={digit}
          autoFocus={idx === 0}
          disabled={disabled}
          aria-label={`Verification code digit ${idx + 1}`}
          onChange={(e) => handleDigitChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
        />
      ))}
    </div>
  )
}

function RecoveryCodeSegmentInput({
  seg1,
  seg2,
  disabled,
  onChangeSegments,
}: {
  seg1: string
  seg2: string
  disabled?: boolean
  onChangeSegments: (nextSeg1: string, nextSeg2: string) => void
}) {
  const seg2Ref = useRef<HTMLInputElement | null>(null)
  const seg1Ref = useRef<HTMLInputElement | null>(null)

  const parseFullRecovery = (raw: string): [string, string] | null => {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const trimmed = clean.startsWith('ORBIT') ? clean.slice(5) : clean
    if (trimmed.length >= 5) {
      return [trimmed.slice(0, 4), trimmed.slice(4, 8)]
    }
    return null
  }

  const handleSeg1Change = (raw: string) => {
    const parsed = parseFullRecovery(raw)
    if (parsed) {
      onChangeSegments(parsed[0], parsed[1])
      seg2Ref.current?.focus()
      return
    }
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
    onChangeSegments(clean, seg2)
    if (clean.length === 4) {
      seg2Ref.current?.focus()
    }
  }

  const handleSeg2Change = (raw: string) => {
    const parsed = parseFullRecovery(raw)
    if (parsed && raw.length > 4) {
      onChangeSegments(parsed[0], parsed[1])
      return
    }
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
    onChangeSegments(seg1, clean)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const parsed = parseFullRecovery(e.clipboardData.getData('text'))
    if (!parsed) return
    e.preventDefault()
    onChangeSegments(parsed[0], parsed[1])
    seg2Ref.current?.focus()
  }

  return (
    <div className="auth-recovery-segments">
      <span className="auth-recovery-prefix">ORBIT</span>
      <span className="auth-recovery-dash">-</span>
      <input
        ref={seg1Ref}
        type="text"
        size={4}
        className="auth-recovery-seg"
        placeholder="XXXX"
        maxLength={14}
        value={seg1}
        disabled={disabled}
        aria-label="Recovery code first segment"
        onChange={(e) => handleSeg1Change(e.target.value)}
        onPaste={handlePaste}
      />
      <span className="auth-recovery-dash">-</span>
      <input
        ref={seg2Ref}
        type="text"
        size={4}
        className="auth-recovery-seg"
        placeholder="XXXX"
        maxLength={14}
        value={seg2}
        disabled={disabled}
        aria-label="Recovery code second segment"
        onChange={(e) => handleSeg2Change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && !seg2) {
            seg1Ref.current?.focus()
          }
        }}
        onPaste={handlePaste}
      />
    </div>
  )
}

export function AuthScreen({
  hasUsers,
  emailOtpEnabled,
  initialView = 'login',
  initialNotice,
  lastSignedOutUser,
  revokedAllDevices = false,
  onViewChange,
  onAuthenticated,
}: AuthScreenProps) {
  const [step, setStep] = useState<AuthStep>(() => stepFromView(initialView, hasUsers))
  const [recentAccounts, setRecentAccounts] = useState<RecentAuthAccount[]>(() =>
    hasUsers ? getRecentAccounts() : [],
  )
  const [email, setEmail] = useState(() => lastSignedOutUser?.email || '')
  const [selectedAccount, setSelectedAccount] = useState<RecentAuthAccount | null>(
    () => lastSignedOutUser ?? null,
  )
  const [emailLockedInSignup, setEmailLockedInSignup] = useState(false)
  const [isFirstAccount, setIsFirstAccount] = useState(!hasUsers)
  const [serverOtpEnabled, setServerOtpEnabled] = useState(emailOtpEnabled)

  const [password, setPassword] = useState('')
  const [avatarColor] = useState<string>(AVATAR_SWATCHES[0])
  const rememberMe = true
  const [showPassword, setShowPassword] = useState(false)
  const [capsLockOn, setCapsLockOn] = useState(false)

  const [showAllOptions, setShowAllOptions] = useState(false)
  const [showSmtpGuide, setShowSmtpGuide] = useState(false)

  const [otpCode, setOtpCode] = useState('')
  const [otpCooldown, setOtpCooldown] = useState(0)

  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>(
    emailOtpEnabled ? 'otp' : 'backup',
  )
  const [recoveryOtpSent, setRecoveryOtpSent] = useState(false)
  const [recoverySeg1, setRecoverySeg1] = useState('')
  const [recoverySeg2, setRecoverySeg2] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  const [pendingSignup, setPendingSignup] = useState<PendingSignupResult | null>(null)
  const [codesCopied, setCodesCopied] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null)
  const otpAutoSubmittingRef = useRef(false)

  const effectiveOtpEnabled = serverOtpEnabled || emailOtpEnabled
  const visibleRecentAccounts = hasUsers ? recentAccounts : []
  const logoutTargetAccount =
    lastSignedOutUser ?? (visibleRecentAccounts.length > 0 ? visibleRecentAccounts[0] : null)

  useEffect(() => {
    if (otpCooldown <= 0) return undefined
    const timer = window.setInterval(() => {
      setOtpCooldown((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [otpCooldown])

  const resetMessages = () => {
    setError(null)
    setNotice(null)
  }

  const syncViewUrl = (nextView: AuthViewMode) => {
    onViewChange?.(nextView)
  }

  const checkCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'))
    }
  }

  const goToLoginGateway = (clearPrefill = false) => {
    resetMessages()
    setPassword('')
    setOtpCode('')
    setShowPassword(false)
    setCapsLockOn(false)
    setShowSmtpGuide(false)
    if (clearPrefill) {
      setEmail('')
      setSelectedAccount(null)
    }
    setStep('identify')
    syncViewUrl('login')
  }

  const goToSignupPage = (prefillEmail?: string, lockEmail = false) => {
    resetMessages()
    if (prefillEmail !== undefined) setEmail(prefillEmail)
    setEmailLockedInSignup(lockEmail)
    setPassword('')
    setShowPassword(false)
    setCapsLockOn(false)
    setShowAllOptions(false)
    setStep('signup-details')
    syncViewUrl('signup')
  }

  const goToRecoveryPage = (method?: RecoveryMethod) => {
    resetMessages()
    setOtpCode('')
    setRecoverySeg1('')
    setRecoverySeg2('')
    setNewPassword('')
    setConfirmNewPassword('')
    setShowPassword(false)
    setCapsLockOn(false)
    setRecoveryOtpSent(false)
    setRecoveryMethod(method ?? (effectiveOtpEnabled ? 'otp' : 'backup'))
    setStep('recovery')
    syncViewUrl('recovery')
  }

  const discoverEmailAndRoute = async (rawEmail: string, matchedCard?: RecentAuthAccount) => {
    const trimmed = rawEmail.trim()
    if (!trimmed) {
      setError('Enter your email address to continue.')
      return
    }
    resetMessages()
    setLoading(true)
    try {
      const discoverRequest = () =>
        fetch('/auth/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email: trimmed }),
        })
      const res = await fetchAfterBackendWake(discoverRequest, () => {
        setNotice('Orbit is waking up after being idle. Keep this page open; the first connection can take about a minute.')
      })
      if (!res.ok) {
        setNotice(null)
        setError(await readErrorDetail(res, 'Could not look up that email address.'))
        return
      }
      setNotice(null)
      const data: AuthDiscoverResponse = await res.json()
      setEmail(data.email)
      setIsFirstAccount(Boolean(data.is_first_account))
      setServerOtpEnabled(Boolean(data.email_otp_enabled))
      setRecoveryMethod(data.email_otp_enabled ? 'otp' : 'backup')
      setShowPassword(false)
      setPassword('')
      setOtpCode('')
      setShowAllOptions(false)

      if (data.exists) {
        const cardMatch =
          matchedCard ??
          visibleRecentAccounts.find((item) => item.email === data.email.toLowerCase()) ??
          null
        setSelectedAccount(cardMatch)
        setStep('login-password')
        syncViewUrl('login')
      } else {
        if (matchedCard) {
          setRecentAccounts(forgetRecentAccount(matchedCard.email))
        }
        setSelectedAccount(null)
        goToSignupPage(data.email, true)
      }
    } catch {
      setNotice(null)
      setError('Unable to reach the authentication service. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDiscoverSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void discoverEmailAndRoute(email)
  }

  const handlePasswordLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) {
      setError('Enter your password.')
      return
    }
    resetMessages()
    setLoading(true)
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email,
          password,
          remember_me: rememberMe,
        }),
      })
      if (!res.ok) {
        setError(await readErrorDetail(res, 'Invalid email or password.'))
        return
      }
      const data = await res.json()
      onAuthenticated(data.user, data.unused_recovery_codes ?? 0)
    } catch {
      setError('Unable to sign in right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const requestOtpCode = async (purpose: 'login' | 'recovery'): Promise<boolean> => {
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Enter your email address first so we know where to send the code.')
      return false
    }
    resetMessages()
    setLoading(true)
    try {
      const res = await fetch('/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: trimmed, purpose }),
      })
      if (!res.ok) {
        setError(await readErrorDetail(res, 'Could not send verification code.'))
        return false
      }
      const data = await res.json()
      setEmail(data.email || trimmed)
      setOtpCooldown(Number(data.cooldown_seconds || 30))
      setNotice(`We sent a 6-digit verification code to ${data.email || trimmed}.`)
      return true
    } catch {
      setError('Unable to reach the verification email service.')
      return false
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchToOtpLogin = async () => {
    setOtpCode('')
    const ok = await requestOtpCode('login')
    if (ok) {
      setShowAllOptions(false)
      setStep('login-otp')
      syncViewUrl('login')
    }
  }

  const submitOtpLogin = async (codeOverride?: string) => {
    const code = (codeOverride ?? otpCode).replace(/\D/g, '')
    if (code.length !== 6) {
      setError('Enter the full 6-digit verification code.')
      return
    }
    if (otpAutoSubmittingRef.current) return
    otpAutoSubmittingRef.current = true
    resetMessages()
    setLoading(true)
    try {
      const res = await fetch('/auth/otp/verify-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email,
          code,
          remember_me: rememberMe,
        }),
      })
      if (!res.ok) {
        setError(await readErrorDetail(res, 'Invalid or expired verification code.'))
        return
      }
      const data = await res.json()
      onAuthenticated(data.user, data.unused_recovery_codes ?? 0)
    } catch {
      setError('Verification failed. Please try again.')
    } finally {
      setLoading(false)
      otpAutoSubmittingRef.current = false
    }
  }

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Enter your email address.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password.length > 128) {
      setError('Password must be 128 characters or fewer.')
      return
    }
    resetMessages()
    setLoading(true)
    try {
      const res = await fetch('/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: email.trim(),
          password,
          remember_me: rememberMe,
          avatar_color: avatarColor,
        }),
      })
      if (!res.ok) {
        setError(await readErrorDetail(res, 'Could not create account.'))
        return
      }
      const data = await res.json()
      const codes: string[] = Array.isArray(data.recovery_codes) ? data.recovery_codes : []
      if (codes.length > 0) {
        setPendingSignup({
          user: data.user,
          unusedRecoveryCodes: data.unused_recovery_codes ?? codes.length,
          isFirstAdmin: Boolean(data.is_first_admin),
          recoveryCodes: codes,
        })
        setStep('backup-codes')
      } else {
        onAuthenticated(data.user, data.unused_recovery_codes ?? 0, {
          isFirstAdmin: Boolean(data.is_first_admin),
        })
      }
    } catch {
      setError('Unable to create account right now.')
    } finally {
      setLoading(false)
    }
  }

  const handleSendRecoveryOtp = async () => {
    setOtpCode('')
    const ok = await requestOtpCode('recovery')
    if (ok) {
      setRecoveryOtpSent(true)
    }
  }

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError('Enter the email address for your account.')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.')
      return
    }

    resetMessages()

    if (recoveryMethod === 'otp' && effectiveOtpEnabled) {
      const cleanOtp = otpCode.replace(/\D/g, '')
      if (cleanOtp.length !== 6) {
        setError('Enter the 6-digit verification code sent to your email.')
        return
      }
      setLoading(true)
      try {
        const res = await fetch('/auth/otp/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            email: trimmedEmail,
            code: cleanOtp,
            new_password: newPassword,
          }),
        })
        if (!res.ok) {
          setError(await readErrorDetail(res, 'Invalid or expired verification code.'))
          return
        }
        setPassword('')
        setOtpCode('')
        setStep('login-password')
        syncViewUrl('login')
        setNotice('Password updated. Sign in with your new password.')
      } catch {
        setError('Password reset failed. Please try again.')
      } finally {
        setLoading(false)
      }
      return
    }

    const s1 = recoverySeg1.trim().toUpperCase()
    const s2 = recoverySeg2.trim().toUpperCase()
    if (s1.length !== 4 || s2.length !== 4) {
      setError('Enter all 8 characters of your ORBIT-XXXX-XXXX backup code.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/auth/recovery/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: trimmedEmail,
          recovery_code: `ORBIT-${s1}-${s2}`,
          new_password: newPassword,
        }),
      })
      if (!res.ok) {
        setError(await readErrorDetail(res, 'Invalid email or backup recovery code.'))
        return
      }
      setPassword('')
      setRecoverySeg1('')
      setRecoverySeg2('')
      setStep('login-password')
      syncViewUrl('login')
      setNotice('Password updated. Sign in with your new password.')
    } catch {
      setError('Password reset failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  const resetStrength = passwordStrength(newPassword)
  const isCenteredLayout = step === 'logged-out' || step === 'backup-codes'
  const activeNavTab: 'login' | 'signup' | 'recovery' =
    step === 'signup-details' || step === 'backup-codes'
      ? 'signup'
      : step === 'recovery'
      ? 'recovery'
      : 'login'

  const handleCopyRecoveryCodes = async () => {
    if (!pendingSignup) return
    try {
      await navigator.clipboard.writeText(pendingSignup.recoveryCodes.join('\n'))
      setCodesCopied(true)
    } catch {
      setError('Clipboard access was blocked. Use Download .txt instead.')
    }
  }

  const handleDownloadRecoveryCodes = () => {
    if (!pendingSignup) return
    const text = [
      'Orbit Agent Studio — Backup Recovery Codes',
      `Account: ${pendingSignup.user.email}`,
      'Store these single-use codes safely:',
      '',
      ...pendingSignup.recoveryCodes,
    ].join('\n')
    downloadTextFile('orbit-recovery-codes.txt', text)
  }

  const renderAllOptionsDrawer = () => (
    <div className="auth-options-drawer">
      <button
        type="button"
        className="auth-options-toggle"
        aria-expanded={showAllOptions}
        onClick={() => {
          setShowAllOptions((prev) => !prev)
          setShowSmtpGuide(false)
        }}
      >
        <span>Other ways to continue</span>
        <Icon
          name="chevron"
          size={15}
          className={`auth-options-chevron ${showAllOptions ? 'open' : ''}`}
        />
      </button>

      {showAllOptions && (
        <div className="auth-options-panel">
          <button
            type="button"
            className="auth-option-item"
            disabled={loading}
            onClick={() => {
              if (!email.trim()) {
                setError('Enter your email address above first.')
                return
              }
              void discoverEmailAndRoute(email)
            }}
          >
            <div className="auth-option-item-left">
              <span className="auth-option-icon">
                <Icon name="user" size={14} />
              </span>
              <div className="auth-option-copy">
                <span className="auth-option-title">Password sign-in</span>
                <span className="auth-option-desc">Standard email &amp; password verification</span>
              </div>
            </div>
            <span className="auth-option-badge auth-option-badge--ready">Ready</span>
          </button>

          <button
            type="button"
            className="auth-option-item"
            disabled={loading}
            onClick={() => {
              if (!effectiveOtpEnabled) {
                setShowSmtpGuide((prev) => !prev)
                return
              }
              void handleSwitchToOtpLogin()
            }}
          >
            <div className="auth-option-item-left">
              <span className="auth-option-icon">
                <Icon name="sparkles" size={14} />
              </span>
              <div className="auth-option-copy">
                <span className="auth-option-title">6-digit email verification code</span>
                <span className="auth-option-desc">
                  {effectiveOtpEnabled
                    ? 'Passwordless sign-in code sent via SMTP'
                    : 'Optional one-time inbox verification'}
                </span>
              </div>
            </div>
            <span
              className={`auth-option-badge ${
                effectiveOtpEnabled ? 'auth-option-badge--ready' : 'auth-option-badge--setup'
              }`}
            >
              {effectiveOtpEnabled ? 'Ready' : 'SMTP off'}
            </span>
          </button>

          {showSmtpGuide && !effectiveOtpEnabled && (
            <div className="auth-smtp-hint">
              Email codes are currently disabled on this instance. Add{' '}
              <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>,{' '}
              <code>SMTP_PASSWORD</code>, and <code>SMTP_FROM</code> to <code>.env</code> and
              restart <code>server.py</code> to turn them on.
            </div>
          )}

          <button
            type="button"
            className="auth-option-item"
            disabled={loading}
            onClick={() => goToSignupPage(email.trim() || undefined, false)}
          >
            <div className="auth-option-item-left">
              <span className="auth-option-icon">
                <Icon name="plus" size={14} />
              </span>
              <div className="auth-option-copy">
                <span className="auth-option-title">Create a new account</span>
                <span className="auth-option-desc">Register an isolated workspace user</span>
              </div>
            </div>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="auth-page">
      <div className={`auth-split ${isCenteredLayout ? 'auth-split--centered' : ''}`}>
        <section className="auth-main-col">
          <header className="auth-topbar">
            <div className="auth-brand">
              <span className="auth-brand-mark">
                <Icon name="orbit" size={16} />
              </span>
              <span>Orbit</span>
            </div>

          </header>

          <main
            className={`auth-form-stage ${step === 'backup-codes' ? 'auth-form-stage--wide' : ''}`}
          >
            {step !== 'backup-codes' && step !== 'logged-out' && step !== 'recovery' && (
              <nav className="auth-topbar-nav auth-mode-switcher" aria-label="Authentication views">
                <button
                  type="button"
                  className={`auth-topbar-btn ${activeNavTab === 'login' ? 'active' : ''}`}
                  onClick={() => goToLoginGateway(false)}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`auth-topbar-btn ${activeNavTab === 'signup' ? 'active' : ''}`}
                  onClick={() => goToSignupPage(email.trim() || undefined, false)}
                >
                  Create account
                </button>
              </nav>
            )}
            {step === 'logged-out' && (
              <>
                <div className="auth-logout-seal">
                  <div className="auth-logout-avatar-wrap">
                    <div
                      className={`auth-logout-avatar ${
                        logoutTargetAccount ? '' : 'auth-logout-avatar--anon'
                      }`}
                      style={
                        logoutTargetAccount
                          ? { background: logoutTargetAccount.avatar_color }
                          : undefined
                      }
                    >
                      {logoutTargetAccount ? (
                        computeInitials(logoutTargetAccount.display_name)
                      ) : (
                        <Icon name="orbit" size={24} />
                      )}
                    </div>
                    <span className="auth-logout-badge" aria-hidden="true">
                      <Icon name="check" size={13} />
                    </span>
                  </div>
                </div>

                <div className="auth-header">
                  <h1 className="auth-title">
                    {revokedAllDevices ? 'Signed out everywhere' : 'You have signed out'}
                  </h1>
                  <p className="auth-subtitle">
                    {notice ||
                      'Your session cookie has been cleared and local workspace memory was wiped. Saved threads and files stay intact.'}
                  </p>
                </div>

                <div className="auth-logout-card">
                  {logoutTargetAccount && (
                    <div className="auth-logout-account-meta">
                      <span className="auth-logout-account-name">
                        {logoutTargetAccount.display_name}
                      </span>
                      <span className="auth-logout-account-email">
                        {logoutTargetAccount.email}
                      </span>
                    </div>
                  )}

                  {logoutTargetAccount ? (
                    <button
                      type="button"
                      className="auth-primary-btn"
                      autoFocus
                      disabled={loading}
                      onClick={() => {
                        void discoverEmailAndRoute(logoutTargetAccount.email, logoutTargetAccount)
                      }}
                    >
                      Sign back in as {logoutTargetAccount.display_name.split(/\s+/)[0]}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="auth-primary-btn"
                      autoFocus
                      onClick={() => goToLoginGateway(true)}
                    >
                      Sign in again
                    </button>
                  )}

                  <button
                    type="button"
                    className="auth-secondary-btn"
                    onClick={() => goToLoginGateway(true)}
                  >
                    Switch or use another account
                  </button>
                </div>

                <div className="auth-logout-links">
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => goToSignupPage('', false)}
                  >
                    Create a new account
                  </button>

                  {logoutTargetAccount && (
                    <button
                      type="button"
                      className="auth-link-btn"
                      onClick={() => {
                        const updated = forgetRecentAccount(logoutTargetAccount.email)
                        setRecentAccounts(updated)
                        setSelectedAccount(null)
                        setEmail('')
                      }}
                    >
                      Forget saved profile from this browser
                    </button>
                  )}
                </div>
              </>
            )}

            {step === 'identify' && (
              <>
                <div className="auth-header">
                  <h1 className="auth-title">
                    {hasUsers ? 'All your AI, in one place.' : 'Start your Orbit workspace.'}
                  </h1>
                  <p className="auth-subtitle">
                    {hasUsers
                      ? 'Bring your models, agents, skills and connected tools into one workspace.'
                      : 'Create the administrator account for your Orbit workspace.'}
                  </p>
                </div>

                {notice && <div className="auth-alert auth-alert--info">{notice}</div>}
                {error && (
                  <div className="auth-alert auth-alert--error">
                    <Icon name="alertTriangle" size={16} />
                    <span>{error}</span>
                  </div>
                )}

                {visibleRecentAccounts.length > 0 && (
                  <div className="auth-recent-block">
                    <p className="auth-recent-heading">Recent accounts on this browser</p>
                    <div className="auth-recent-list">
                      {visibleRecentAccounts.map((acc) => (
                        <div key={acc.email} className="auth-recent-row">
                          <button
                            type="button"
                            className="auth-recent-select"
                            disabled={loading}
                            onClick={() => {
                              void discoverEmailAndRoute(acc.email, acc)
                            }}
                          >
                            <span
                              className="auth-recent-avatar"
                              style={{ background: acc.avatar_color }}
                            >
                              {computeInitials(acc.display_name)}
                            </span>
                            <span className="auth-recent-meta">
                              <span className="auth-recent-name">{acc.display_name}</span>
                              <span className="auth-recent-email">{acc.email}</span>
                            </span>
                            {acc.role === 'admin' && (
                              <span className="auth-recent-role">Admin</span>
                            )}
                          </button>
                          <button
                            type="button"
                            className="auth-recent-remove"
                            aria-label={`Remove ${acc.email} from this browser`}
                            title="Remove saved profile"
                            onClick={() => {
                              const next = forgetRecentAccount(acc.email)
                              setRecentAccounts(next)
                              if (email.toLowerCase() === acc.email) {
                                setEmail('')
                                setSelectedAccount(null)
                              }
                            }}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="auth-divider">or continue with email</div>
                  </div>
                )}

                <form className="auth-form auth-form--gateway" onSubmit={handleDiscoverSubmit}>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="auth-email">
                      Email address
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      className="auth-input"
                      placeholder="Enter your email"
                      value={email}
                      autoComplete="email"
                      autoFocus
                      disabled={loading}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="auth-primary-btn" disabled={loading}>
                    {loading ? 'Checking account...' : 'Continue with email'}
                  </button>
                </form>

                {renderAllOptionsDrawer()}

                {hasUsers && (
                  <div className="auth-footer-nav auth-footer-nav--gateway">
                    <span>New to Orbit?</span>
                    <button
                      type="button"
                      className="auth-link-btn"
                      onClick={() => goToSignupPage(email.trim() || undefined, false)}
                    >
                      Create an account
                    </button>
                    <span className="auth-footer-separator" aria-hidden="true">·</span>
                    <button
                      type="button"
                      className="auth-link-btn"
                      onClick={() => goToRecoveryPage()}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </>
            )}

            {step === 'login-password' && (
              <>
                <div className="auth-header">
                  <h1 className="auth-title">Welcome back</h1>
                  <p className="auth-subtitle">Enter your password to continue to your Orbit workspace.</p>
                </div>

                <div className="auth-email-chip-wrap">
                  <div className="auth-email-chip">
                    {selectedAccount && (
                      <span
                        className="auth-email-chip-avatar"
                        style={{ background: selectedAccount.avatar_color }}
                      >
                        {computeInitials(selectedAccount.display_name)}
                      </span>
                    )}
                    <span className="auth-email-chip-text">{email}</span>
                    <button
                      type="button"
                      className="auth-email-chip-edit"
                      onClick={() => goToLoginGateway(false)}
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {notice && <div className="auth-alert auth-alert--info">{notice}</div>}
                {error && (
                  <div className="auth-alert auth-alert--error">
                    <Icon name="alertTriangle" size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <form className="auth-form" onSubmit={handlePasswordLoginSubmit}>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="auth-login-password">
                      Password
                    </label>
                    <div className="auth-input-wrap">
                      <input
                        id="auth-login-password"
                        type={showPassword ? 'text' : 'password'}
                        className="auth-input auth-input--with-toggle"
                        placeholder="Enter your password"
                        value={password}
                        autoComplete="current-password"
                        autoFocus
                        disabled={loading}
                        onKeyDown={checkCapsLock}
                        onKeyUp={checkCapsLock}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="auth-eye-btn"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
                      </button>
                    </div>
                    {capsLockOn && (
                      <span className="auth-caps-hint">
                        <Icon name="alertTriangle" size={13} />
                        <span>Caps Lock is on</span>
                      </span>
                    )}
                  </div>

                  <div className="auth-inline-row auth-inline-row-end">
                    <button
                      type="button"
                      className="auth-link-btn"
                      onClick={() => goToRecoveryPage()}
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button type="submit" className="auth-primary-btn" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign in'}
                  </button>
                </form>

                {effectiveOtpEnabled && (
                  <>
                    <div className="auth-divider">or</div>
                    <button
                      type="button"
                      className="auth-secondary-btn"
                      disabled={loading}
                      onClick={() => {
                        void handleSwitchToOtpLogin()
                      }}
                    >
                      Sign in with 6-digit email code
                    </button>
                  </>
                )}

                {renderAllOptionsDrawer()}
              </>
            )}

            {step === 'login-otp' && (
              <>
                <div className="auth-header">
                  <h1 className="auth-title">Check your inbox</h1>
                  <p className="auth-subtitle">Enter the 6-digit verification code sent to your email.</p>
                </div>

                <div className="auth-email-chip-wrap">
                  <div className="auth-email-chip">
                    <span className="auth-email-chip-text">{email}</span>
                    <button
                      type="button"
                      className="auth-email-chip-edit"
                      onClick={() => goToLoginGateway(false)}
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {notice && <div className="auth-alert auth-alert--info">{notice}</div>}
                {error && (
                  <div className="auth-alert auth-alert--error">
                    <Icon name="alertTriangle" size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <form
                  className="auth-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void submitOtpLogin()
                  }}
                >
                  <OtpDigitInput
                    value={otpCode}
                    disabled={loading}
                    onChange={setOtpCode}
                    onComplete={(code) => {
                      void submitOtpLogin(code)
                    }}
                  />

                  <div className="auth-inline-row auth-inline-row-end">
                    <button
                      type="button"
                      className="auth-link-btn"
                      disabled={loading || otpCooldown > 0}
                      onClick={() => {
                        void requestOtpCode('login')
                      }}
                    >
                      {otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : 'Resend code'}
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="auth-primary-btn"
                    disabled={loading || otpCode.replace(/\D/g, '').length !== 6}
                  >
                    {loading ? 'Verifying...' : 'Verify and continue'}
                  </button>
                </form>

                <div className="auth-divider">or</div>
                <button
                  type="button"
                  className="auth-secondary-btn"
                  disabled={loading}
                  onClick={() => {
                    resetMessages()
                    setStep('login-password')
                    syncViewUrl('login')
                  }}
                >
                  Use password instead
                </button>
              </>
            )}

            {step === 'signup-details' && (
              <>
                <div className="auth-header">
                  <h1 className="auth-title">
                    {isFirstAccount ? 'Set up your Orbit workspace' : 'Create your Orbit account'}
                  </h1>
                  <p className="auth-subtitle">
                    {isFirstAccount
                      ? 'Create the administrator account for this Orbit instance.'
                      : 'One account for your models, agents, skills and connected tools.'}
                  </p>
                </div>

                {emailLockedInSignup && (
                  <div className="auth-email-chip-wrap">
                    <div className="auth-email-chip">
                      <span className="auth-email-chip-text">{email}</span>
                      <button
                        type="button"
                        className="auth-email-chip-edit"
                        onClick={() => {
                          setEmailLockedInSignup(false)
                          goToLoginGateway(false)
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="auth-alert auth-alert--error">
                    <Icon name="alertTriangle" size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <form className="auth-form" onSubmit={handleSignupSubmit}>
                  {!emailLockedInSignup && (
                    <div className="auth-field">
                      <label className="auth-label" htmlFor="auth-signup-email">
                        Email address
                      </label>
                      <input
                        id="auth-signup-email"
                        type="email"
                        className="auth-input"
                        placeholder="name@example.com"
                        value={email}
                        autoComplete="email"
                        autoFocus
                        disabled={loading}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="auth-field">
                    <label className="auth-label" htmlFor="auth-signup-password">
                      Password
                    </label>
                    <div className="auth-input-wrap">
                      <input
                        id="auth-signup-password"
                        type={showPassword ? 'text' : 'password'}
                        className="auth-input auth-input--with-toggle"
                        placeholder="At least 8 characters"
                        value={password}
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        required
                        autoFocus={emailLockedInSignup}
                        disabled={loading}
                        onKeyDown={checkCapsLock}
                        onKeyUp={checkCapsLock}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="auth-eye-btn"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
                      </button>
                    </div>
                    {capsLockOn && (
                      <span className="auth-caps-hint">
                        <Icon name="alertTriangle" size={13} />
                        <span>Caps Lock is on</span>
                      </span>
                    )}
                  </div>

                  <button type="submit" className="auth-primary-btn" disabled={loading}>
                    {loading ? 'Creating account...' : 'Create account'}
                  </button>
                </form>

                {hasUsers && (
                  <div className="auth-footer-nav">
                    Already have an account?{' '}
                    <button
                      type="button"
                      className="auth-link-btn"
                      onClick={() => goToLoginGateway(false)}
                    >
                      Sign in
                    </button>
                  </div>
                )}
              </>
            )}

            {step === 'recovery' && (
              <>
                <div className="auth-header">
                  <h1 className="auth-title">Reset your password</h1>
                  <p className="auth-subtitle">
                    {effectiveOtpEnabled
                      ? 'Verify account ownership using an email code or a single-use backup code.'
                      : 'Enter one of your single-use ORBIT backup recovery codes to set a new password.'}
                  </p>
                </div>

                {email.trim() && (
                  <div className="auth-email-chip-wrap">
                    <div className="auth-email-chip">
                      <span className="auth-email-chip-text">{email}</span>
                      <button
                        type="button"
                        className="auth-email-chip-edit"
                        onClick={() => setEmail('')}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                )}

                {effectiveOtpEnabled && (
                  <div className="auth-mode-switch" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={recoveryMethod === 'otp'}
                      className={`auth-mode-btn ${recoveryMethod === 'otp' ? 'active' : ''}`}
                      onClick={() => {
                        resetMessages()
                        setRecoveryMethod('otp')
                      }}
                    >
                      Email code
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={recoveryMethod === 'backup'}
                      className={`auth-mode-btn ${recoveryMethod === 'backup' ? 'active' : ''}`}
                      onClick={() => {
                        resetMessages()
                        setRecoveryMethod('backup')
                      }}
                    >
                      Backup code
                    </button>
                  </div>
                )}

                {notice && <div className="auth-alert auth-alert--info">{notice}</div>}
                {error && (
                  <div className="auth-alert auth-alert--error">
                    <Icon name="alertTriangle" size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <form className="auth-form" onSubmit={handleRecoverySubmit}>
                  {!email.trim() && (
                    <div className="auth-field">
                      <label className="auth-label" htmlFor="auth-recovery-email">
                        Account email address
                      </label>
                      <input
                        id="auth-recovery-email"
                        type="email"
                        className="auth-input"
                        placeholder="name@example.com"
                        value={email}
                        autoComplete="email"
                        autoFocus
                        disabled={loading}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  )}

                  {recoveryMethod === 'otp' && effectiveOtpEnabled ? (
                    !recoveryOtpSent ? (
                      <button
                        type="button"
                        className="auth-secondary-btn"
                        disabled={loading}
                        onClick={() => {
                          void handleSendRecoveryOtp()
                        }}
                      >
                        {loading ? 'Sending code...' : 'Send 6-digit reset code to email'}
                      </button>
                    ) : (
                      <div className="auth-field">
                        <div className="auth-inline-row">
                          <label className="auth-label">6-digit reset code</label>
                          <button
                            type="button"
                            className="auth-link-btn"
                            disabled={loading || otpCooldown > 0}
                            onClick={() => {
                              void handleSendRecoveryOtp()
                            }}
                          >
                            {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend code'}
                          </button>
                        </div>
                        <OtpDigitInput
                          value={otpCode}
                          disabled={loading}
                          onChange={setOtpCode}
                        />
                      </div>
                    )
                  ) : (
                    <div className="auth-field">
                      <label className="auth-label">Backup recovery code</label>
                      <RecoveryCodeSegmentInput
                        seg1={recoverySeg1}
                        seg2={recoverySeg2}
                        disabled={loading}
                        onChangeSegments={(next1, next2) => {
                          setRecoverySeg1(next1)
                          setRecoverySeg2(next2)
                        }}
                      />
                    </div>
                  )}

                  <div className="auth-field">
                    <label className="auth-label" htmlFor="auth-reset-new-password">
                      New password
                    </label>
                    <div className="auth-input-wrap">
                      <input
                        id="auth-reset-new-password"
                        type={showPassword ? 'text' : 'password'}
                        className="auth-input auth-input--with-toggle"
                        placeholder="At least 8 characters"
                        value={newPassword}
                        autoComplete="new-password"
                        disabled={loading}
                        onKeyDown={checkCapsLock}
                        onKeyUp={checkCapsLock}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="auth-eye-btn"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((prev) => !prev)}
                      >
                        <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
                      </button>
                    </div>
                    {capsLockOn && (
                      <span className="auth-caps-hint">
                        <Icon name="alertTriangle" size={13} />
                        <span>Caps Lock is on</span>
                      </span>
                    )}
                    {newPassword.length > 0 && (
                      <div className="auth-strength">
                        <div className="auth-strength-track">
                          {[1, 2, 3].map((idx) => (
                            <div
                              key={idx}
                              className={`auth-strength-bar ${
                                idx <= resetStrength.score ? `filled ${resetStrength.tone}` : ''
                              }`}
                            />
                          ))}
                        </div>
                        <span className="auth-strength-label">{resetStrength.label}</span>
                      </div>
                    )}
                  </div>

                  <div className="auth-field">
                    <label className="auth-label" htmlFor="auth-reset-confirm">
                      Confirm new password
                    </label>
                    <input
                      id="auth-reset-confirm"
                      type={showPassword ? 'text' : 'password'}
                      className="auth-input"
                      placeholder="Re-enter new password"
                      value={confirmNewPassword}
                      autoComplete="new-password"
                      disabled={loading}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    className="auth-primary-btn"
                    disabled={
                      loading ||
                      (recoveryMethod === 'otp' && effectiveOtpEnabled && !recoveryOtpSent)
                    }
                  >
                    {loading ? 'Updating password...' : 'Reset password'}
                  </button>
                </form>

                <div className="auth-footer-nav">
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => goToLoginGateway(false)}
                  >
                    Back to sign in
                  </button>
                </div>
              </>
            )}

            {step === 'backup-codes' && pendingSignup && (
              <>
                <div className="auth-header">
                  <h1 className="auth-title">Save your recovery codes</h1>
                  <p className="auth-subtitle">
                    {pendingSignup.isFirstAdmin
                      ? 'Your administrator workspace is ready. Save these single-use backup codes in case you ever lose your password.'
                      : 'Store these 8 single-use codes safely. Each code lets you reset your password offline.'}
                  </p>
                </div>

                {error && (
                  <div className="auth-alert auth-alert--error">
                    <Icon name="alertTriangle" size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <div className="auth-codes-frame">
                  <div className="auth-codes-grid">
                    {pendingSignup.recoveryCodes.map((code) => (
                      <div key={code} className="auth-code-pill">
                        {code}
                      </div>
                    ))}
                  </div>

                  <div className="auth-codes-actions">
                    <button
                      type="button"
                      className="auth-secondary-btn"
                      onClick={() => {
                        void handleCopyRecoveryCodes()
                      }}
                    >
                      <Icon name="key" size={14} />
                      <span>{codesCopied ? 'Copied to clipboard' : 'Copy all codes'}</span>
                    </button>
                    <button
                      type="button"
                      className="auth-secondary-btn"
                      onClick={handleDownloadRecoveryCodes}
                    >
                      <Icon name="download" size={14} />
                      <span>Download .txt</span>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="auth-primary-btn"
                  onClick={() =>
                    onAuthenticated(pendingSignup.user, pendingSignup.unusedRecoveryCodes, {
                      isFirstAdmin: pendingSignup.isFirstAdmin,
                    })
                  }
                >
                  Continue to Orbit Studio
                </button>
              </>
            )}
          </main>

          <footer className="auth-bottom-note">
            Sessions are stored as encrypted HttpOnly cookies scoped to this Orbit Studio instance.
          </footer>
        </section>

      </div>
    </div>
  )
}
