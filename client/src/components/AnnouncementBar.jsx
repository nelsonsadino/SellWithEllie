import { useState } from 'react'
import { useContent } from '../context/TenantContext'
import SmartLink from './SmartLink'

const hashOf = (s) => {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0
  return String(h)
}

// Slim dismissible strip above the nav. Text/link come from the shop's editable
// copy (Admin > Storefront > Wording). Dismissal is keyed to the message text,
// so a new announcement shows again.
export default function AnnouncementBar() {
  const t = useContent()
  const text = t('announcement.text', '')
  const href = t('announcement.href', '')
  const linkLabel = t('announcement.linkLabel', '')

  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('announce-dismissed') === hashOf(text)
    } catch {
      return false
    }
  })

  if (!text || dismissed) return null

  const close = () => {
    try {
      localStorage.setItem('announce-dismissed', hashOf(text))
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  return (
    <div className="announce" role="region" aria-label="Announcement">
      <div className="container announce-inner">
        {text}
        {href && linkLabel ? (
          <>
            {' '}
            <SmartLink to={href}>{linkLabel}</SmartLink>
          </>
        ) : null}
      </div>
      <button type="button" className="announce-close" onClick={close} aria-label="Dismiss announcement">
        ✕
      </button>
    </div>
  )
}
