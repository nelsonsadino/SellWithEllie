import { useState } from 'react'
import { useToast } from '../../context/ToastContext'

export default function NewsletterSection({ data = {} }) {
  const { heading, body, placeholder, buttonLabel } = data
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const { showToast } = useToast()

  const submit = (e) => {
    e.preventDefault()
    if (!email.includes('@')) {
      showToast('Enter a valid email.', 'error')
      return
    }
    // No mailing-list backend yet - acknowledge and reset. A shop can wire
    // this form action to their ESP later.
    setDone(true)
    setEmail('')
    showToast('Thanks - you’re on the list.', 'success')
  }

  return (
    <section className="container section-block">
      <div className="newsletter">
        {heading && <h2>{heading}</h2>}
        {body && <p>{body}</p>}
        {done ? (
          <p style={{ marginTop: '1.25rem', fontWeight: 500 }}>You’re subscribed ✓</p>
        ) : (
          <form className="newsletter-form" onSubmit={submit}>
            <input
              id="newsletter-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={placeholder || 'you@email.com'}
              aria-label="Email address"
              required
            />
            <button type="submit" className="btn btn-primary">
              {buttonLabel || 'Subscribe'}
            </button>
          </form>
        )}
      </div>
    </section>
  )
}
