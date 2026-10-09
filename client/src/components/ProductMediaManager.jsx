import { useState } from 'react'
import { deleteProductMedia, uploadProductMedia } from '../api/products'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../context/ToastContext'

const MAX_MEDIA = 5

// Lets an admin attach up to MAX_MEDIA photos/videos to a product, backed by
// Azure Blob Storage. Used inline in the admin product form once a product
// has an id (a brand-new, unsaved product has nothing to attach media to
// yet - see AdminProductsPanel, which creates the product first).
export default function ProductMediaManager({ productId, media, onChange }) {
  const [uploading, setUploading] = useState(false)
  const { showToast } = useToast()
  const confirm = useConfirm()

  const remainingSlots = MAX_MEDIA - media.length

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return

    if (files.length > remainingSlots) {
      showToast(
        `You can only add ${remainingSlots} more file${remainingSlots === 1 ? '' : 's'} - the limit is ${MAX_MEDIA} photos/videos per product.`,
        'error'
      )
      return
    }

    setUploading(true)
    try {
      const uploaded = await uploadProductMedia(productId, files)
      onChange([...media, ...uploaded])
      showToast(`${uploaded.length === 1 ? 'File' : 'Files'} uploaded.`, 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (item) => {
    const ok = await confirm({
      title: 'Remove this file?',
      body: 'This photo or video will be removed from the product gallery.',
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteProductMedia(productId, item.id)
      onChange(media.filter((m) => m.id !== item.id))
      showToast('Removed.', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  return (
    <div className="form-group media-manager">
      <label>
        Photos / videos ({media.length}/{MAX_MEDIA})
      </label>
      <div className="media-grid">
        {media.map((item) => (
          <div className="media-thumb" key={item.id}>
            {item.mediaType === 'Video' ? (
              <video src={item.url} muted playsInline />
            ) : (
              <img src={item.url} alt="" />
            )}
            <button
              type="button"
              className="media-thumb-remove"
              onClick={() => handleDelete(item)}
              aria-label="Remove this file"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
        {remainingSlots > 0 && (
          <label className={`media-thumb media-thumb-upload ${uploading ? 'is-uploading' : ''}`}>
            <span>{uploading ? 'Uploading...' : '+ Add'}</span>
            <input type="file" accept="image/*,video/*" multiple hidden disabled={uploading} onChange={handleFilesSelected} />
          </label>
        )}
      </div>
      <p className="hint">Up to {MAX_MEDIA} photos or videos per product (JPEG, PNG, WebP, GIF, MP4, WebM, MOV).</p>
    </div>
  )
}
