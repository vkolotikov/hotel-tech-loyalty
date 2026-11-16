/* eslint-disable react-refresh/only-export-components -- Standalone browser-test entry point; no hot-refresh exports. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Public test controls and partial wire fixtures are deliberately outside the app typecheck. */
import React, { useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import i18n from '../../src/i18n'
import { registerContentLocales } from '../../src/content/i18n'
import { registerWorkspaceLocales } from '../../src/workspace/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Link, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
import { ContentContext } from '../../src/content/ContentProvider.tsx'
import { PanelProvider, usePanel } from '../../src/content/panel/PanelProvider.tsx'
import * as Editor from '../../src/content/panel/PostPanel.tsx'
const PostPanel = Editor.PostPanel
const PostEditorProvider = Editor['PostEditorProvider'] ?? React.Fragment
const usePostEditor = Editor['usePostEditor'] ?? (() => null)
import { BrandDnaSection } from '../../src/content/brand/sections/BrandDna.tsx'
import { useBrand } from '../../src/content/brand/useBrand.ts'
import { PostsPage } from '../../src/content/posts/PostsPage.tsx'
import '../../src/index.css'
import { ChannelsSection } from '../../src/content/brand/sections/Channels'
import { SnippetsSection } from '../../src/content/brand/sections/Snippets'
import { AudiencesSection } from '../../src/content/brand/sections/Audiences'
import { TemplatesSection } from '../../src/content/brand/sections/Templates'
import { WebsiteSection } from '../../src/content/brand/sections/Website'
import { LinkInBioSection } from '../../src/content/brand/sections/LinkInBio'
import { WritePage } from '../../src/content/write/WritePage'
import { BrandPage } from '../../src/content/brand/BrandPage'
import { SettingsPage } from '../../src/content/settings/SettingsPage'
import { brandPayload } from './api'

document.documentElement.dataset.shell = 'content'
registerContentLocales()
registerWorkspaceLocales()
await i18n.changeLanguage('en')
;(window as any).__language = (language: string) => i18n.changeLanguage(language)
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
;(window as any).__cachedPost = (id: number) => client.getQueryData(['content', 3, 'post', id])
;(window as any).__dropLocations = () => client.removeQueries({ predicate: q => q.queryKey.includes('locations') })
;(window as any).__refreshSettings = () => client.invalidateQueries({ predicate: q => q.queryKey.includes('settings') })
const base = {
  name: 'HexaTech Content', organization: { id: 1, name: 'Audit organisation', industry: 'beauty' },
  brand: { id: 3, name: 'Brand A', logo_url: null }, brands: [], accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-11-13' },
  staff: { id: 1, name: 'Audit Manager', role: 'manager', can_manage: true }, profile: { id: 1, setup_completed: true, readiness: 80 },
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin'], statuses: ['draft', 'published'], rewrites: ['shorter'],
}
;(window as any).__refreshBrand = () => { for (const id of [3,4]) client.setQueryData(['content', id, 'brand'], brandPayload()) }
for (const brand of [3, 4]) client.setQueryData(['content', brand, 'brand'], brandPayload())
function BrandFixture() {
  const { brand } = useBrand()
  return brand ? <BrandDnaSection brand={brand} canEdit /> : null
}
function FormsFixture() {
  const { brand } = useBrand()
  return brand ? <><ChannelsSection brand={{ ...brand, channels: [] }} canEdit /><SnippetsSection brand={brand} canEdit /><AudiencesSection brand={brand} canEdit /><TemplatesSection brand={brand} canEdit /><WebsiteSection canEdit /><LinkInBioSection canEdit /></> : null
}
function Controls({ brand, onBrand }: any) {
  const panel = usePanel()
  const editor = usePostEditor()
  const navigate = useNavigate()
  const location = useLocation()
  useLayoutEffect(() => { (window as any).__editor = editor; (window as any).__panel = panel }, [editor, panel])
  return <nav><button onClick={() => panel.open(301)}>Audit saved post</button><button onClick={() => navigate(-1)}>Audit back</button><button onClick={() => panel.openNew({ date: '2026-11-13', platform: 'linkedin' })}>Audit new post</button>
    <button onClick={() => { if (panel.close()) onBrand(brand === 3 ? 4 : 3) }}>Audit switch brand</button>
    <Link to="/content/settings">Audit settings</Link><Link to="/content/forms">More Brand forms</Link><Link to="/content/brand">Brand settings</Link> <Link to="/content">Plan navigation</Link> <Link to="/content/posts">All posts</Link>
    <button onClick={() => panel.guard()}>Audit full admin guard</button>
    <Link to="/content/write/new">Audit full composer</Link><Link to="/content/brand-real">Real Brand navigation</Link><output id="route">{location.pathname + location.search}</output><output id="target">{JSON.stringify({ brand, target: panel.target, dirty: panel.holdsEdits() })}</output></nav>
}
function PanelSurface() { const location = useLocation(); return location.pathname.startsWith('/content/write/') ? null : <PostPanel /> }
function App() {
  const [brand, setBrand] = useState(3)
  const [workspace, setWorkspace] = useState(true)
  useLayoutEffect(() => { (window as any).__workspace = setWorkspace }, [])
  const changeBrand = (id: number) => { client.removeQueries({ predicate: q => q.queryKey[0] === 'content' && q.queryKey[1] !== 'bootstrap' }); setBrand(id) }
  return <QueryClientProvider client={client}><MemoryRouter initialEntries={['/content']}>
    {workspace ? <ContentContext.Provider value={{ data: { ...base, brand: { ...base.brand, id: brand, name: brand === 3 ? 'Brand A' : 'Brand B' } }, isLoading: false, isError: false, error: null, refetch() {}, switchBrand: setBrand } as any}>
      <div data-content="" data-workspace="content"><PanelProvider><PostEditorProvider><Controls brand={brand} onBrand={changeBrand} />
        <main><Routes><Route path="/content/settings" element={<SettingsPage />} /><Route path="/content/write/:id" element={<WritePage />} /><Route path="/content/brand-real" element={<BrandPage />} /><Route path="/content/forms" element={<FormsFixture />} /><Route path="/content/brand" element={<BrandFixture />} /><Route path="/content/posts" element={<PostsPage />} /><Route path="*" element={<p>Plan fixture</p>} /></Routes></main>
        <PanelSurface />
      </PostEditorProvider></PanelProvider></div>
    </ContentContext.Provider> : <p>Outside workspace</p>}
  </MemoryRouter></QueryClientProvider>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
