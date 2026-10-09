import { useRef, useState } from 'react'
import { KINDS, defaultDataFor, schemaFor } from '../lib/sectionSchema'
import { uploadTenantMedia } from '../api/tenant'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../context/ToastContext'
import Modal from './Modal'
import SectionRenderer from './SectionRenderer'

// Generic block builder. The parent supplies the current blocks and the CRUD
// operations (so the same editor drives both the per-shop storefront and the
// platform marketing site); this component owns the editing UI only.
export default function SectionEditor({ sections, api, onChanged }) {
  const [editing, setEditing] = useState(null) // { id?, kind, data, isVisible }
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const { showToast } = useToast()
  const confirm = useConfirm()

  const ordered = [...sections].sort((a, b) => a.position - b.position)

  const run = async (fn, successMsg) => {
    setBusy(true)
    try {
      await fn()
      if (successMsg) showToast(successMsg, 'success')
      await onChanged()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const move = (index, dir) => {
    const next = [...ordered]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    run(() => api.reorder(next.map((s) => s.id)))
  }

  const addBlock = (kind) => {
    setAddOpen(false)
    setEditing({ kind, data: defaultDataFor(kind), isVisible: true })
  }

  const saveEditing = () =>
    run(async () => {
      if (editing.id) {
        await api.update(editing.id, {
          kind: editing.kind,
          data: editing.data,
          isVisible: editing.isVisible,
        })
      } else {
        await api.create(editing.kind, editing.data, editing.isVisible)
      }
      setEditing(null)
    }, 'Block saved.')

  return (
    <div>
      <div className="admin-panel-header">
        <h3>Home page blocks</h3>
        <button className="btn btn-primary btn-small" onClick={() => setAddOpen(true)} disabled={busy}>
          + Add block
        </button>
      </div>

      <div className="section-editor-list">
        {ordered.length === 0 && <p className="hint">No blocks yet. Add one to start building the page.</p>}
        {ordered.map((s, i) => (
          <div key={s.id} className={`section-editor-row ${s.isVisible ? '' : 'is-hidden'}`}>
            <div className="section-editor-grip">
              <button type="button" aria-label="Move up" disabled={i === 0 || busy} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={i === ordered.length - 1 || busy}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
            </div>
            <span className="section-editor-kind">{schemaFor(s.kind).label}</span>
            {!s.isVisible && <span className="badge badge-muted">Hidden</span>}
            <div className="section-editor-row-actions">
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={busy}
                onClick={() => setEditing({ id: s.id, kind: s.kind, data: s.data || {}, isVisible: s.isVisible })}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api.update(s.id, { kind: s.kind, data: s.data || {}, isVisible: !s.isVisible }),
                    s.isVisible ? 'Block hidden.' : 'Block shown.'
                  )
                }
              >
                {s.isVisible ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="btn btn-danger btn-small"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Delete this block?',
                    body: `The "${schemaFor(s.kind).label}" block will be removed from the page.`,
                    confirmLabel: 'Delete block',
                    tone: 'danger',
                  })
                  if (ok) run(() => api.remove(s.id), 'Block deleted.')
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add-block picker */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a block" size="sm">
        <div className="section-editor-fields">
          {KINDS.map((kind) => (
            <button key={kind} type="button" className="btn btn-secondary btn-block" onClick={() => addBlock(kind)}>
              <span>
                <strong>{schemaFor(kind).label}</strong>
                <br />
                <span className="hint">{schemaFor(kind).description}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Edit one block */}
      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.id ? 'Edit' : 'New'} ${schemaFor(editing.kind).label} block` : ''}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={saveEditing} disabled={busy}>
              {busy ? 'Saving…' : 'Save block'}
            </button>
          </>
        }
      >
        {editing && (
          <>
            <BlockFields
              kind={editing.kind}
              data={editing.data}
              onChange={(data) => setEditing((e) => ({ ...e, data }))}
            />
            <div className="callout">
              <p className="hint">Preview</p>
              <SectionRenderer sections={[{ id: 'preview', kind: editing.kind, isVisible: true, data: editing.data }]} />
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

function BlockFields({ kind, data, onChange }) {
  const { fields } = schemaFor(kind)
  const set = (key, value) => onChange({ ...data, [key]: value })

  return (
    <div className="section-editor-fields">
      {fields.map((field) => {
        const value = data[field.key]
        if (field.type === 'textarea') {
          return (
            <div className="form-group" key={field.key}>
              <label htmlFor={`f-${field.key}`}>{field.label}</label>
              <textarea
                id={`f-${field.key}`}
                className="input"
                rows={3}
                value={value ?? ''}
                onChange={(e) => set(field.key, e.target.value)}
              />
            </div>
          )
        }
        if (field.type === 'number') {
          return (
            <div className="form-group" key={field.key}>
              <label htmlFor={`f-${field.key}`}>{field.label}</label>
              <input
                id={`f-${field.key}`}
                type="number"
                className="input"
                value={value ?? ''}
                onChange={(e) => set(field.key, Number(e.target.value))}
              />
            </div>
          )
        }
        if (field.type === 'toggle') {
          return (
            <label className="admin-form-checkboxes" key={field.key} style={{ margin: 0 }}>
              <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(field.key, e.target.checked)} />
              {field.label}
            </label>
          )
        }
        if (field.type === 'list') {
          const arr = Array.isArray(value) ? value : []
          return (
            <div className="form-group" key={field.key}>
              <label htmlFor={`f-${field.key}`}>{field.label}</label>
              <textarea
                id={`f-${field.key}`}
                className="input"
                rows={4}
                placeholder="One per line"
                value={arr.join('\n')}
                onChange={(e) => set(field.key, e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
              />
            </div>
          )
        }
        if (field.type === 'itemList') {
          const arr = Array.isArray(value) ? value : []
          return (
            <div className="form-group" key={field.key}>
              <label>{field.label}</label>
              {arr.map((item, i) => (
                <div className="admin-form-grid" key={i} style={{ marginBottom: '0.5rem' }}>
                  <input
                    className="input"
                    placeholder="Title"
                    value={item.title ?? ''}
                    aria-label={`${field.label} ${i + 1} title`}
                    onChange={(e) => {
                      const next = [...arr]
                      next[i] = { ...next[i], title: e.target.value }
                      set(field.key, next)
                    }}
                  />
                  <input
                    className="input"
                    placeholder="Body"
                    value={item.body ?? ''}
                    aria-label={`${field.label} ${i + 1} body`}
                    onChange={(e) => {
                      const next = [...arr]
                      next[i] = { ...next[i], body: e.target.value }
                      set(field.key, next)
                    }}
                  />
                </div>
              ))}
              <div className="table-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => set(field.key, [...arr, { title: '', body: '' }])}
                >
                  + Add item
                </button>
                {arr.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => set(field.key, arr.slice(0, -1))}
                  >
                    Remove last
                  </button>
                )}
              </div>
            </div>
          )
        }
        if (field.type === 'video') {
          return (
            <VideoField
              key={field.key}
              field={field}
              value={value}
              onChange={(v) => set(field.key, v)}
            />
          )
        }
        if (field.type === 'slides') {
          const arr = Array.isArray(value) ? value : []
          const patch = (i, key, v) => {
            const next = [...arr]
            next[i] = { ...next[i], [key]: v }
            set(field.key, next)
          }
          return (
            <div className="form-group" key={field.key}>
              <label>{field.label}</label>
              {arr.map((slide, i) => (
                <div className="card" key={i} style={{ marginBottom: '0.75rem', padding: '1rem' }}>
                  <p className="hint" style={{ marginBottom: '0.5rem' }}>Slide {i + 1}</p>
                  <input
                    className="input"
                    placeholder="Image URL (optional)"
                    value={slide.image ?? ''}
                    aria-label={`Slide ${i + 1} image URL`}
                    onChange={(e) => patch(i, 'image', e.target.value)}
                    style={{ marginBottom: '0.4rem' }}
                  />
                  <input
                    className="input"
                    placeholder="Heading"
                    value={slide.heading ?? ''}
                    aria-label={`Slide ${i + 1} heading`}
                    onChange={(e) => patch(i, 'heading', e.target.value)}
                    style={{ marginBottom: '0.4rem' }}
                  />
                  <input
                    className="input"
                    placeholder="Text"
                    value={slide.text ?? ''}
                    aria-label={`Slide ${i + 1} text`}
                    onChange={(e) => patch(i, 'text', e.target.value)}
                    style={{ marginBottom: '0.4rem' }}
                  />
                  <div className="admin-form-grid">
                    <input
                      className="input"
                      placeholder="Button label (optional)"
                      value={slide.buttonLabel ?? ''}
                      aria-label={`Slide ${i + 1} button label`}
                      onChange={(e) => patch(i, 'buttonLabel', e.target.value)}
                    />
                    <input
                      className="input"
                      placeholder="Button link (e.g. /products)"
                      value={slide.buttonHref ?? ''}
                      aria-label={`Slide ${i + 1} button link`}
                      onChange={(e) => patch(i, 'buttonHref', e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => set(field.key, arr.filter((_, j) => j !== i))}
                  >
                    Remove slide
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() =>
                  set(field.key, [...arr, { image: '', heading: '', text: '', buttonLabel: '', buttonHref: '' }])
                }
              >
                + Add slide
              </button>
            </div>
          )
        }
        return (
          <div className="form-group" key={field.key}>
            <label htmlFor={`f-${field.key}`}>{field.label}</label>
            <input
              id={`f-${field.key}`}
              className="input"
              value={value ?? ''}
              onChange={(e) => set(field.key, e.target.value)}
            />
          </div>
        )
      })}
    </div>
  )
}

// Video field: paste a URL, or upload a clip. Upload posts to the tenant
// media endpoint; if the server has no file storage configured it returns
// 503 and we tell the admin to paste a hosted URL instead.
function VideoField({ field, value, onChange }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)
  const { showToast } = useToast()

  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await uploadTenantMedia(file)
      onChange(res.url)
      showToast('Video uploaded.', 'success')
    } catch (err) {
      showToast(err.message || 'Upload failed - paste a hosted URL instead.', 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="form-group">
      <label htmlFor={`f-${field.key}`}>{field.label}</label>
      <input
        id={`f-${field.key}`}
        className="input"
        placeholder="https://… .mp4 or .webm"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="video-field-upload">
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={pick}
          disabled={uploading}
          aria-label={`Upload ${field.label}`}
        />
        {uploading && <span className="hint">Uploading…</span>}
      </div>
    </div>
  )
}
