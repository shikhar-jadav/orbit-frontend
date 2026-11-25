export type MessageRole = 'user' | 'assistant'

export type ToolEvent = {
  id: string
  name: string
  args?: Record<string, unknown>
  output?: string
  status: 'running' | 'done'
}

export type MessageVariant = {
  version: number
  user_content: string
  assistant_content: string
  created_at?: string
}

export type MessageAttachment = {
  attachment_id?: string
  filename: string
  content_type: string
  size_bytes: number
  preview_url?: string
}

export type ProactiveCardData = {
  routine_id: string
  routine_name: string
  action_prompt?: string
  content: string
  one_shot?: boolean
  trigger_type?: string
  schedule_display?: string
  timestamp?: string
  run_id?: string
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool'; tool: ToolEvent }
  | { type: 'proactive_card'; card: ProactiveCardData }
  | { type: 'context'; text: string }

export type Message = {
  id: string | number
  role: MessageRole
  content: string
  turn_id?: string | number
  variants?: MessageVariant[]
  selected_version?: number
  version_count?: number
  created_at?: string
  tools?: ToolEvent[]
  parts?: MessagePart[]
  pending?: boolean
  failed?: boolean
  attachments?: MessageAttachment[]
}

export type Thread = {
  thread_id: string
  title: string
  created_at: string
  updated_at: string
  preview: string
  message_count: number
  parent_thread_id?: string | null
  parent_title?: string | null
  branch_from_message_id?: string | number | null
  branch_label?: string | null
}

export type SidebarThread = Thread & { depth: number }

export type Provider = {
  index: number
  name: string
  masked_key: string
  base_url: string
  active_model: string
  model_list: string[]
  call_count: number
}

export type ProviderStatus = {
  total_providers: number
  total_requests_served: number
  providers: Provider[]
}

export type Settings = {
  model: string | null
  provider_index: number | null
}

export type UserPreferences = {
  language: string
  send_shortcut: 'enter' | 'ctrl_enter'
  appearance: 'dark' | 'midnight'
}

export type SettingsSection = 'general' | 'appearance' | 'account' | 'capabilities' | 'integrations'

export type PersonalSkillFile = {
  filename: string
  content: string
}

export type SkillSecurityIssue = {
  id: string
  category: string
  pattern: string
  severity: string
  location: string
  finding: string
  remediation: string
}

export type SkillSecurityScan = {
  allowed?: boolean
  status: string
  scanner: string
  version?: string | null
  score: number
  severity: string
  recommendation: string
  max_issue_severity: string
  issue_count: number
  issues?: SkillSecurityIssue[]
  checks?: string[]
  warnings?: string[]
  reason?: string
  can_trust_override?: boolean
  trusted_by_user?: boolean
}

export type PersonalSkill = {
  id: string
  name: string
  description: string
  prompt: string
  is_enabled: boolean
  is_draft: boolean
  source: 'custom' | 'upload'
  files: PersonalSkillFile[]
  security_scan?: SkillSecurityScan | null
  created_at: string
  updated_at: string
}

export type McpToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnlyHint: boolean
}

export type ToolPermissionLevel = 'allow' | 'approval' | 'block'

export type PersonalConnectorHeader = {
  key: string
  masked_value?: string
  has_value?: boolean
}

export type PersonalConnector = {
  id: string
  name: string
  mcp_url: string
  connector_type: string
  auth_mode: 'now' | 'later' | 'none'
  headers: PersonalConnectorHeader[]
  advanced: Record<string, unknown>
  tools: McpToolDefinition[]
  tool_permissions: Record<string, ToolPermissionLevel>
  is_connected: boolean
  last_status_code: number | null
  last_checked_at: string | null
  created_at: string
  updated_at: string
  connect_error?: string
}

export type McpProbeResult = {
  url: string
  reachable: boolean
  status_code: number | null
  connect_status: 'done' | 'error'
  connect_detail: string
  signin_settings_status: string
  signin_provider_status: string
  detected_auth: 'now' | 'later' | 'none'
  can_continue_manually: boolean
  tools: McpToolDefinition[]
  oauth_metadata?: Record<string, unknown> | null
  error: string | null
}

export type IconName =
  | 'orbit'
  | 'clock'
  | 'bell'
  | 'zap'
  | 'notion'
  | 'newchat'
  | 'plus'
  | 'search'
  | 'panel'
  | 'chat'
  | 'send'
  | 'arrowUp'
  | 'stop'
  | 'copy'
  | 'check'
  | 'trash'
  | 'edit'
  | 'more'
  | 'refresh'
  | 'branch'
  | 'chevronLeft'
  | 'chevronRight'
  | 'close'
  | 'chevron'
  | 'settings'
  | 'tool'
  | 'cpu'
  | 'database'
  | 'sparkles'
  | 'terminal'
  | 'layers'
  | 'command'
  | 'store'
  | 'puzzle'
  | 'gitBranch'
  | 'checkCircle'
  | 'creditCard'
  | 'cloud'
  | 'fileText'
  | 'eye'
  | 'eyeOff'
  | 'externalLink'
  | 'user'
  | 'shield'
  | 'key'
  | 'logOut'
  | 'users'
  | 'alertTriangle'
  | 'download'
  | 'upload'
  | 'palette'
  | 'globe'
  | 'hand'
  | 'ban'
  | 'paperPlane'
  | 'filter'
  | 'link'
  | 'mail'
  | 'gmail'

export type AuthUser = {
  user_id: string
  email: string
  display_name: string
  avatar_color: string
  role: 'admin' | 'member'
  is_active: boolean
  created_at: string
  updated_at: string
  last_login_at?: string | null
  session_id?: string
  remember_me?: boolean
}

export type AuthSessionResponse = {
  authenticated: boolean
  user: AuthUser | null
  has_users: boolean
  unused_recovery_codes?: number
  email_otp_enabled?: boolean
}

export type AuthDiscoverResponse = {
  email: string
  exists: boolean
  has_users: boolean
  is_first_account: boolean
  email_otp_enabled: boolean
}

export type UserSessionItem = {
  session_id: string
  remember_me: boolean
  user_agent: string
  device_label: string
  ip_address: string
  created_at: string
  last_seen_at: string
  expires_at: string
  is_current: boolean
}

export type AdminUserSummary = AuthUser & {
  thread_count: number
}

export type MarketplaceSkill = {
  id: string
  name: string
  category: string
  description: string
  is_installed: boolean
  author: string
  type: 'skill'
  has_readme: boolean
}

export type ConnectorConfigValue = string | boolean | number | undefined

export type ConnectorConfigField = {
  key: string
  label: string
  type: 'text' | 'password' | 'boolean'
  required?: boolean
  placeholder?: string
  helpText?: string
  defaultValue?: ConnectorConfigValue
}

export type MarketplaceConnector = {
  id: string
  name: string
  category: string
  description: string
  icon: IconName | string
  badge?: string
  authType: string
  website?: string
  configFields: ConnectorConfigField[]
  capabilities: string[]
  type: 'connector'
  is_enabled: boolean
  is_configured: boolean
  is_authenticated?: boolean
  connected_account?: {
    account_name?: string
    email?: string
  } | null
  oauthProvider?: string
  status: 'active' | 'needs_config' | 'needs_auth' | 'available'
  config: Record<string, ConnectorConfigValue>
}

export type MarketplaceCatalog = {
  skills: MarketplaceSkill[]
  connectors: MarketplaceConnector[]
  categories: string[]
  stats: {
    total_skills: number
    installed_skills: number
    total_connectors: number
    active_connectors: number
  }
}

export type HITLNormalizedOption = {
  id: string
  title: string
  description?: string
  raw: string
}

export type HITLQuestionItem = {
  id?: string
  question: string
  options: (string | { id?: string; title?: string; label?: string; description?: string })[]
  is_multi_select?: boolean
  allow_custom?: boolean
  can_skip?: boolean
}

export type HITLCardRequest = {
  id: string
  questions: HITLQuestionItem[]
  is_approval?: boolean
  risk_level?: string
  policy_rule?: string
  action_summary?: string
  reason?: string
  connector_id?: string
  connector_name?: string
  tool_name?: string
  args?: Record<string, unknown>
}

export type HITLSubmission = {
  requestId: string
  questionIndex: number
  question: string
  selectedTitles: string[]
  customText?: string
  isApproval?: boolean
  alwaysAllow?: boolean
  connectorId?: string
  toolName?: string
  answers?: Record<string, unknown>
}
