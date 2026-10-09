import { useState } from 'react'

// A small, curated set rather than a full emoji library - keeps this
// dependency-free and fast, and covers what a shop's live-auction chat
// actually needs (reactions, common expressions).
const EMOJIS = [
  '😀', '😂', '😍', '😅', '😊', '😉', '😎', '🤩', '😢', '😮',
  '😡', '🤔', '👍', '👎', '🙌', '👏', '🙏', '💪', '🔥', '🎉',
  '❤️', '💯', '⭐', '✅', '❌', '💰', '🛍️', '🐶', '🐱', '🎁',
]

export default function EmojiPicker({ onSelect }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="emoji-picker-wrap">
      <button
        type="button"
        className="btn btn-ghost btn-small emoji-picker-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label="Add an emoji"
        aria-expanded={open}
      >
        😊
      </button>
      {open && (
        <>
          {/* Click-outside catcher - simpler and more robust than a
              document-level listener for a small popover like this. */}
          <div className="emoji-picker-backdrop" onClick={() => setOpen(false)} />
          <div className="emoji-picker-popover" role="menu">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="emoji-picker-option"
                onClick={() => {
                  onSelect(emoji)
                  setOpen(false)
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
