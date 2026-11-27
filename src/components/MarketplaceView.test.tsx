import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MarketplaceView, resetMarketplaceCatalogCache } from './MarketplaceView'
import type { MarketplaceCatalog } from './types'

const MOCK_CATALOG: MarketplaceCatalog = {
  skills: [],
  categories: ['All', 'Productivity', 'MCP Directory'],
  stats: {
    total_skills: 0,
    installed_skills: 0,
    total_connectors: 4,
    active_connectors: 1,
  },
  connectors: [
    {
      id: 'notion',
      name: 'Notion',
      category: 'Productivity',
      description: 'Connect Notion workspace',
      icon: 'plug',
      authType: 'OAuth 2.0',
      mcpUrl: 'https://mcp.notion.com/mcp',
      configFields: [],
      capabilities: ['Remote MCP Tools'],
      type: 'connector',
      is_enabled: true,
      is_configured: true,
      is_authenticated: true,
      oauthProvider: 'notion',
      status: 'active',
      verification_status: 'auth_required',
      source: 'official',
      transport: 'streamable_http',
      tool_count: 2,
      tools: [
        { name: 'search_pages', description: 'Search Notion pages', inputSchema: {}, readOnlyHint: true },
        { name: 'create_page', description: 'Create a Notion page', inputSchema: {}, readOnlyHint: false },
      ],
      config: {},
    },
    {
      id: 'linear',
      name: 'Linear',
      category: 'Productivity',
      description: 'Manage Linear issues',
      icon: 'plug',
      authType: 'OAuth 2.0',
      mcpUrl: 'https://mcp.linear.app/mcp',
      configFields: [],
      capabilities: ['Remote MCP Tools'],
      type: 'connector',
      is_enabled: false,
      is_configured: true,
      is_authenticated: false,
      oauthProvider: 'linear',
      status: 'available',
      verification_status: 'auth_required',
      source: 'official',
      config: {},
    },
    {
      id: 'google-drive',
      name: 'Google Drive',
      category: 'Productivity',
      description: 'Access Google Drive files',
      icon: 'plug',
      authType: 'OAuth 2.0',
      mcpUrl: 'https://drivemcp.googleapis.com/mcp/v1',
      configFields: [],
      capabilities: ['Remote MCP Tools'],
      type: 'connector',
      is_enabled: false,
      is_configured: true,
      is_authenticated: false,
      oauthProvider: 'google',
      status: 'setup_required',
      verification_status: 'setup_required',
      verification_notes: 'Requires Google OAuth application credentials configured in Orbit environment.',
      config: {},
    },
    {
      id: 'microsoft-365',
      name: 'Microsoft 365',
      category: 'MCP Directory',
      description: 'Access SharePoint and Outlook',
      icon: 'plug',
      authType: 'Remote MCP',
      mcpUrl: 'https://microsoft365.mcp.claude.com/mcp',
      configFields: [],
      capabilities: ['Remote MCP Tools'],
      type: 'connector',
      is_enabled: false,
      is_configured: true,
      is_authenticated: false,
      status: 'unsupported',
      verification_status: 'unsupported',
      verification_notes: 'Endpoint (microsoft365.mcp.claude.com) is hosted specifically for Claude.',
      config: {},
    },
    {
      id: 'directory-only',
      name: 'Directory Only Service',
      category: 'MCP Directory',
      description: 'A listing without a direct MCP endpoint',
      icon: 'plug',
      authType: 'Remote MCP',
      configFields: [],
      capabilities: ['Remote MCP Tools'],
      type: 'connector',
      is_enabled: false,
      is_configured: true,
      is_authenticated: false,
      status: 'unverified',
      verification_status: 'unverified',
      config: {},
    },
  ],
}

describe('MarketplaceView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetMarketplaceCatalogCache()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders connector statuses, tool counts, and unsupported state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_CATALOG), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<MarketplaceView onClose={vi.fn()} initialTab="connectors" />)

    await waitFor(() => {
      expect(screen.getByText('Notion')).toBeInTheDocument()
    })

    expect(screen.getByText('Connected (2 tools)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Directory/ }))
    expect(screen.getByText('Setup Required')).toBeInTheDocument()
    expect(screen.getAllByText('Unsupported').length).toBeGreaterThanOrEqual(1)
  })

  it('disconnects connected connector and turns button back to Connect', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_CATALOG), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ connector_id: 'notion', enabled: false, is_connected: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

    render(<MarketplaceView onClose={vi.fn()} initialTab="connectors" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/marketplace/connectors/notion/toggle',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ enabled: false }),
        }),
      )
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument()
    })
  })

  it('filters connectors by search query', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_CATALOG), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<MarketplaceView onClose={vi.fn()} initialTab="connectors" />)
    await waitFor(() => expect(screen.getByText('Notion')).toBeInTheDocument())

    const searchInput = screen.getByPlaceholderText(/Search/i)
    fireEvent.change(searchInput, { target: { value: 'Linear' } })

    expect(screen.getByText('Linear')).toBeInTheDocument()
    expect(screen.queryByText('Notion')).not.toBeInTheDocument()
  })

  it('puts connectable entries first and directory-only listings in Directory', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_CATALOG), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<MarketplaceView onClose={vi.fn()} initialTab="connectors" />)
    await waitFor(() => expect(screen.getByText('Linear')).toBeInTheDocument())
    expect(screen.queryByText('Directory Only Service')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Directory/ }))
    expect(screen.getByText('Directory Only Service')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Directory Only Service'))
    expect(screen.getByText(/does not include an MCP server URL/i)).toBeInTheDocument()
  })

  it('displays discovered tools in connector details modal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_CATALOG), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<MarketplaceView onClose={vi.fn()} initialTab="connectors" initialConnectorId="notion" />)

    await waitFor(() => {
      expect(screen.getByText('Discovered MCP tools (2)')).toBeInTheDocument()
    })
    expect(screen.getByText('search_pages')).toBeInTheDocument()
    expect(screen.getByText('create_page')).toBeInTheDocument()
  })

  it('handles backend unavailable state gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' }),
    )

    render(<MarketplaceView onClose={vi.fn()} initialTab="connectors" />)

    await waitFor(() => {
      expect(screen.getByText(/HTTP 503/i)).toBeInTheDocument()
    })
  })
})
