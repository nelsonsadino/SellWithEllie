import * as signalR from '@microsoft/signalr'
import { useEffect, useRef, useState } from 'react'
import { blockChatUser, getBlockedChatUsers, getChatMessages, sendChatMessage, unblockChatUser } from '../api/chat'
import { API_ROOT_URL, getToken } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import { useTenant } from '../context/TenantContext'
import { useToast } from '../context/ToastContext'
import EmojiPicker from './EmojiPicker'

const MAX_MESSAGE_LENGTH = 500

// Live chat for one auction's page.
//
// Accepts an optional already-connected `connection` prop: AuctionDetailPage
// passes its own SignalR connection down (already joined to the
// "auction-{tenantId}-{auctionId}" group for bid updates, which carries chat
// events too) so a page that mounts both this and the bid feed only opens
// one WebSocket instead of two - connection count is exactly what a "live
// auction with many concurrent viewers" scales on. When no `connection` prop
// is passed at all (e.g. LiveAuctionSpotlight on the homepage, which has no
// parent page-level connection to share), this falls back to owning its own
// connection exactly as before, so it's still a fully self-contained,
// drop-anywhere component. Profanity filtering, spam rate-limiting, and the
// block list are all enforced server-side (see AuctionsController/
// ChatController) - this is just the UI plus surfacing whatever the server
// decided.
export default function AuctionChat({ auctionId, connection: sharedConnection }) {
  // Distinguishes "no connection prop given" (standalone mode - undefined)
  // from "given, but the parent's connection isn't ready yet" (shared mode,
  // starts out null) - only the latter should ever avoid building its own.
  const isSharedMode = sharedConnection !== undefined
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [blockedMessage, setBlockedMessage] = useState(null)
  const [showBlockedUsers, setShowBlockedUsers] = useState(false)
  const [blockedUsers, setBlockedUsers] = useState([])
  const [loadingBlockedUsers, setLoadingBlockedUsers] = useState(false)
  const [myAuthorRef, setMyAuthorRef] = useState('')
  const listRef = useRef(null)
  const { isAuthenticated, isAdmin } = useAuth()
  const { tenant } = useTenant()
  const { showToast } = useToast()
  const confirm = useConfirm()

  // "My own message" without ever handling a user id: the server hands back
  // an opaque per-auction ref for the caller, and each message carries the
  // same style of ref for its author.
  const isOwn = (m) => Boolean(myAuthorRef) && m.authorRef === myAuthorRef

  useEffect(() => {
    let ignore = false
    getChatMessages(auctionId)
      .then((data) => {
        if (ignore) return
        setMessages(Array.isArray(data?.messages) ? data.messages : [])
        setMyAuthorRef(data?.myAuthorRef || '')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [auctionId])

  useEffect(() => {
    const handleChatMessage = (message) => {
      if (message.auctionId !== auctionId) return
      setMessages((prev) => [...prev, message])
    }

    if (isSharedMode) {
      // The parent already started this connection and joined the group -
      // just listen. Not ready yet (still null while the parent's own
      // effect is setting up) means nothing to attach to until it re-runs.
      if (!sharedConnection) return undefined
      sharedConnection.on('ChatMessageReceived', handleChatMessage)
      return () => {
        sharedConnection.off('ChatMessageReceived', handleChatMessage)
      }
    }

    if (!tenant?.id) return undefined

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_ROOT_URL}/hubs/auction`, { accessTokenFactory: () => getToken() || '' })
      .withAutomaticReconnect()
      .build()

    connection.on('ChatMessageReceived', handleChatMessage)

    connection
      .start()
      .then(() => connection.invoke('JoinAuction', tenant.id, auctionId))
      .catch(() => {
        /* live chat updates are a nice-to-have; history still loads via REST */
      })

    return () => {
      connection.stop()
    }
  }, [auctionId, tenant?.id, isSharedMode, sharedConnection])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!isAuthenticated) {
      showToast('Please log in to chat.', 'error')
      return
    }
    const content = draft.trim()
    if (!content) return

    setSending(true)
    try {
      await sendChatMessage(auctionId, content)
      setDraft('')
    } catch (err) {
      if (err.status === 403) {
        setBlockedMessage(err.message)
      } else {
        showToast(err.message, 'error')
      }
    } finally {
      setSending(false)
    }
  }

  const handleBlock = async (message) => {
    const ok = await confirm({
      title: 'Block this user?',
      body: `${message.displayName} won't be able to chat in any of this shop's auctions.`,
      confirmLabel: 'Block user',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await blockChatUser({
        userId: message.userId ?? undefined,
        authorRef: message.authorRef,
        auctionId,
      })
      showToast(`${message.displayName} has been blocked from chat.`, 'success')
      if (showBlockedUsers) loadBlockedUsers()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const loadBlockedUsers = () => {
    setLoadingBlockedUsers(true)
    getBlockedChatUsers()
      .then(setBlockedUsers)
      .finally(() => setLoadingBlockedUsers(false))
  }

  const toggleBlockedUsers = () => {
    const next = !showBlockedUsers
    setShowBlockedUsers(next)
    if (next) loadBlockedUsers()
  }

  const handleUnblock = async (blockedUser) => {
    try {
      await unblockChatUser(blockedUser.userId)
      setBlockedUsers((prev) => prev.filter((b) => b.userId !== blockedUser.userId))
      showToast(`${blockedUser.displayName} can chat again.`, 'success')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  return (
    <div className="auction-chat">
      <div className="auction-chat-header">
        <h3>Live chat</h3>
        {isAdmin && (
          <button type="button" className="btn btn-ghost btn-small" onClick={toggleBlockedUsers}>
            {showBlockedUsers ? 'Hide blocked users' : 'Blocked users'}
          </button>
        )}
      </div>

      {showBlockedUsers && (
        <div className="chat-blocked-list">
          {loadingBlockedUsers ? (
            <p className="hint">Loading...</p>
          ) : blockedUsers.length === 0 ? (
            <p className="hint">No one is currently blocked from chat.</p>
          ) : (
            <ul>
              {blockedUsers.map((b) => (
                <li key={b.userId}>
                  <span>{b.displayName}</span>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => handleUnblock(b)}>
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="chat-messages" ref={listRef}>
        {loading ? (
          <p className="hint">Loading chat...</p>
        ) : messages.length === 0 ? (
          <p className="hint chat-empty">No messages yet. Say hello!</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`chat-message ${isOwn(m) ? 'chat-message-own' : ''}`}>
              <div className="chat-message-meta">
                <span className="chat-message-author">
                  {m.displayName}
                  {m.isAdmin && <span className="badge chat-admin-badge">Admin</span>}
                </span>
                <span className="chat-message-time">
                  {new Date(m.sentAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {isAdmin && !isOwn(m) && (
                  <button
                    type="button"
                    className="chat-block-btn"
                    onClick={() => handleBlock(m)}
                    title="Block this user from chat"
                  >
                    Block
                  </button>
                )}
              </div>
              <p className="chat-message-content">{m.content}</p>
            </div>
          ))
        )}
      </div>

      {blockedMessage ? (
        <p className="chat-blocked-banner">{blockedMessage}</p>
      ) : isAuthenticated ? (
        <form className="chat-input-row" onSubmit={handleSend}>
          <EmojiPicker onSelect={(emoji) => setDraft((d) => `${d}${emoji}`.slice(0, MAX_MESSAGE_LENGTH))} />
          <input
            className="input"
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Say something..."
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending}
          />
          <button className="btn btn-primary btn-small" type="submit" disabled={sending || !draft.trim()}>
            Send
          </button>
        </form>
      ) : (
        <p className="hint">Log in to join the chat.</p>
      )}
    </div>
  )
}
