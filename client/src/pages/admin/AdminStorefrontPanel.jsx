import { useEffect, useMemo, useState } from 'react'
import {
  createSection,
  deleteSection,
  getTenantSettings,
  reorderSections,
  updateContent,
  updateSection,
  updateTheme,
} from '../../api/tenant'
import SectionEditor from '../../components/SectionEditor'
import Spinner from '../../components/Spinner'
import { useTenant } from '../../context/TenantContext'
import { useTheme, TEMPLATES } from '../../context/ThemeContext'
import { useToast } from '../../context/ToastContext'
import { DEFAULT_CONTENT } from '../../lib/defaultContent'
import { TEMPLATE_META } from '../../lib/templateCatalog'

const MODES = [
  { value: 'system', label: 'Follow visitor’s device' },
  { value: 'light', label: 'Always light' },
  { value: 'dark', label: 'Always dark' },
]

// Groups for the copy editor - each key comes from lib/defaultContent.js.
const CONTENT_GROUPS = [
  { title: 'Announcement bar', prefix: 'announcement.' },
  { title: 'Navigation', prefix: 'nav.' },
  { title: 'Footer', prefix: 'footer.' },
  { title: 'Home page', prefix: 'home.' },
  { title: 'Products', prefix: 'products.' },
  { title: 'Product detail', prefix: 'product.' },
  { title: 'Auctions', prefix: 'auction' },
  { title: 'Cart & checkout', prefix: 'cart.' },
  { title: 'Checkout', prefix: 'checkout.' },
  { title: 'Orders', prefix: 'orders.' },
  { title: 'About', prefix: 'about.' },
  { title: 'Sign in / sign up', prefix: 'auth.' },
]

export default function AdminStorefrontPanel() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('theme')
  const [savingTheme, setSavingTheme] = useState(false)
  const [contentDraft, setContentDraft] = useState({})
  const [savingContent, setSavingContent] = useState(false)
  const { showToast } = useToast()
  const { refresh } = useTenant()
  const { previewTemplate } = useTheme()

  const load = () => {
    setLoading(true)
    getTenantSettings()
      .then((data) => {
        setSettings(data)
        setContentDraft(data.content || {})
      })
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const saveTheme = async (template, mode) => {
    setSavingTheme(true)
    try {
      await updateTheme(template, mode)
      setSettings((s) => ({ ...s, themeTemplate: template, themeMode: mode }))
      await refresh()
      showToast('Design saved.', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSavingTheme(false)
    }
  }

  const saveContent = async () => {
    setSavingContent(true)
    try {
      // Only send keys that differ from what's stored, incl. explicit clears.
      const entries = {}
      const stored = settings.content || {}
      Object.keys(DEFAULT_CONTENT).forEach((key) => {
        const next = (contentDraft[key] ?? '').trim()
        const prev = stored[key] ?? ''
        if (next !== prev) entries[key] = next
      })
      if (Object.keys(entries).length === 0) {
        showToast('No changes to save.', 'info')
        return
      }
      await updateContent(entries)
      await refresh()
      load()
      showToast('Wording updated.', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSavingContent(false)
    }
  }

  const sectionApi = useMemo(
    () => ({
      create: (kind, data, isVisible) => createSection(kind, data, isVisible),
      update: (id, payload) => updateSection(id, payload),
      remove: (id) => deleteSection(id),
      reorder: (ids) => reorderSections(ids),
    }),
    []
  )

  if (loading) return <Spinner />
  if (!settings) return <p className="form-error">Couldn’t load storefront settings.</p>

  return (
    <div>
      <div className="tabs">
        <button className={`tab ${tab === 'theme' ? 'active' : ''}`} onClick={() => setTab('theme')}>
          Design
        </button>
        <button className={`tab ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>
          Wording
        </button>
        <button className={`tab ${tab === 'layout' ? 'active' : ''}`} onClick={() => setTab('layout')}>
          Home layout
        </button>
      </div>

      {tab === 'theme' && (
        <div>
          <div className="page-header">
            <h3>Design template</h3>
            <p>Pick the look for your storefront. Hover a card to preview it live; click to apply.</p>
          </div>
          <div className="template-grid" onMouseLeave={() => previewTemplate(null)}>
            {TEMPLATES.map((key) => (
              <button
                key={key}
                type="button"
                className={`template-card ${settings.themeTemplate === key ? 'is-active' : ''}`}
                onMouseEnter={() => previewTemplate(key)}
                onFocus={() => previewTemplate(key)}
                onClick={() => saveTheme(key, settings.themeMode)}
                disabled={savingTheme}
              >
                <span className="template-card-preview">
                  {/* Fallback only fires if `key` drifts out of TEMPLATE_META (kept in sync with
                      TEMPLATES in ThemeContext.jsx); chips are swatch backgrounds only, never
                      text-on-background, so these low-contrast greys are safe as a last resort. */}
                  {(TEMPLATE_META[key]?.swatch || ['#ccc', '#888', '#eee', '#f55']).map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </span>
                <span className="template-card-body">
                  <strong>{TEMPLATE_META[key]?.name || key}</strong>
                  <span>{TEMPLATE_META[key]?.blurb}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="page-header" style={{ marginTop: '2rem' }}>
            <h3>Light or dark</h3>
            <p>Your shop’s default. Visitors can still switch it with the toggle in the nav.</p>
          </div>
          <div className="segmented" role="group" aria-label="Default light or dark mode">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                className={`segmented-option ${settings.themeMode === m.value ? 'is-active' : ''}`}
                aria-pressed={settings.themeMode === m.value}
                onClick={() => saveTheme(settings.themeTemplate, m.value)}
                disabled={savingTheme}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'content' && (
        <div>
          <div className="admin-panel-header">
            <div>
              <h3>Wording</h3>
              <p className="hint">Leave a field blank to use the built-in default.</p>
            </div>
            <button className="btn btn-primary" onClick={saveContent} disabled={savingContent}>
              {savingContent ? 'Saving…' : 'Save wording'}
            </button>
          </div>
          {CONTENT_GROUPS.map((group) => {
            const keys = Object.keys(DEFAULT_CONTENT).filter((k) => k.startsWith(group.prefix))
            if (keys.length === 0) return null
            return (
              <div className="content-editor-group" key={group.title}>
                <h3>{group.title}</h3>
                {keys.map((key) => (
                  <div className="form-group" key={key}>
                    <label htmlFor={`c-${key}`}>
                      {key} <span className="hint">— default: “{DEFAULT_CONTENT[key]}”</span>
                    </label>
                    <input
                      id={`c-${key}`}
                      className="input"
                      value={contentDraft[key] ?? ''}
                      placeholder={DEFAULT_CONTENT[key]}
                      onChange={(e) => setContentDraft((d) => ({ ...d, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'layout' && (
        <SectionEditor
          sections={settings.sections || []}
          api={sectionApi}
          onChanged={async () => {
            const data = await getTenantSettings()
            setSettings(data)
            await refresh()
          }}
        />
      )}
    </div>
  )
}
