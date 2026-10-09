import { useEffect, useMemo, useState } from 'react'
import {
  createMarketingSection,
  deleteMarketingSection,
  getMarketingAdmin,
  reorderMarketingSections,
  updateMarketingContent,
  updateMarketingSection,
} from '../../api/marketing'
import SectionEditor from '../../components/SectionEditor'
import Spinner from '../../components/Spinner'
import { useToast } from '../../context/ToastContext'

// Freeform copy on the marketing shell (everything else is section blocks).
export const MARKETING_CONTENT_KEYS = [
  { key: 'site.name', label: 'Site name (nav brand)', placeholder: 'SellWithEllie' },
  { key: 'nav.cta', label: 'Nav button label', placeholder: 'Start your shop' },
  { key: 'footer.note', label: 'Footer note', placeholder: 'Not affiliated with any single shop.' },
]

export default function PlatformMarketingPanel() {
  const [site, setSite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const load = () => {
    setLoading(true)
    getMarketingAdmin()
      .then((data) => {
        setSite(data)
        setDraft(data.content || {})
      })
      .catch((err) => showToast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const saveContent = async () => {
    setSaving(true)
    try {
      const entries = {}
      const stored = site.content || {}
      MARKETING_CONTENT_KEYS.forEach(({ key }) => {
        const next = (draft[key] ?? '').trim()
        if (next !== (stored[key] ?? '')) entries[key] = next
      })
      if (Object.keys(entries).length === 0) {
        showToast('No changes to save.', 'info')
        return
      }
      await updateMarketingContent(entries)
      load()
      showToast('Marketing text updated.', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const sectionApi = useMemo(
    () => ({
      create: (kind, data, isVisible) => createMarketingSection(kind, data, isVisible),
      update: (id, payload) => updateMarketingSection(id, payload),
      remove: (id) => deleteMarketingSection(id),
      reorder: (ids) => reorderMarketingSections(ids),
    }),
    []
  )

  if (loading) return <Spinner />
  if (!site) return <p className="form-error">Couldn’t load the marketing site.</p>

  return (
    <div>
      <div className="admin-panel-header">
        <div>
          <h3>Marketing site text</h3>
          <p className="hint">Leave blank to use the built-in default.</p>
        </div>
        <button className="btn btn-primary" onClick={saveContent} disabled={saving}>
          {saving ? 'Saving…' : 'Save text'}
        </button>
      </div>
      {MARKETING_CONTENT_KEYS.map(({ key, label, placeholder }) => (
        <div className="form-group" key={key}>
          <label htmlFor={`m-${key}`}>{label}</label>
          <input
            id={`m-${key}`}
            className="input"
            value={draft[key] ?? ''}
            placeholder={placeholder}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          />
        </div>
      ))}

      <hr style={{ margin: '2rem 0', border: 0, borderTop: '1px solid var(--color-border)' }} />

      <SectionEditor
        sections={site.sections || []}
        api={sectionApi}
        onChanged={async () => {
          setSite(await getMarketingAdmin())
        }}
      />
    </div>
  )
}
