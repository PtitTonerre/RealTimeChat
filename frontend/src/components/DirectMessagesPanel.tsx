import { useState } from 'react';
import type { FormEvent } from 'react';

import { useDirectMessages } from '../hooks/useDirectMessages';
import { searchUsers } from '../services/direct-messages';

import type {
  DirectMessage,
  DirectUser,
} from '../types/direct-messages';

interface DirectMessagesPanelProps {
  connected: boolean;
  incoming: DirectMessage[];
  directError: string;
  onSend: (conversationId: string, content: string) => boolean;
}

export function DirectMessagesPanel({
  connected,
  incoming,
  directError,
  onSend,
}: DirectMessagesPanelProps) {
  const dm = useDirectMessages(incoming, connected);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [draft, setDraft] = useState('');

  async function handleSearch(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (query.trim().length < 2) return;

    setSearching(true);
    setSearchError('');

    try {
      setResults(await searchUsers(query.trim()));
    } catch {
      setSearchError('Could not search users.');
    } finally {
      setSearching(false);
    }
  }

  async function handleStart(userId: string): Promise<void> {
    if (await dm.startConversation(userId)) {
      setResults([]);
      setQuery('');
      setDraft('');
    }
  }

  function handleSend(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (dm.selectedId && onSend(dm.selectedId, draft)) {
      setDraft('');
    }
  }

  return (
    <main className="dm-panel">
      <aside className="dm-list">
        <h2>Private messages</h2>

        <form
          className="dm-search"
          onSubmit={(event) => void handleSearch(event)}
        >
          <input
            aria-label="Search users"
            placeholder="Find a user..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={20}
          />

          <button
            type="submit"
            disabled={searching || query.trim().length < 2}
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {searchError && (
          <p className="error" role="alert">
            {searchError}
          </p>
        )}

        {results.length > 0 && (
          <div className="dm-results">
            {results.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => void handleStart(user.id)}
              >
                Start chat with {user.username}
              </button>
            ))}
          </div>
        )}

        <p className="sidebar-label">CONVERSATIONS</p>

        {dm.conversations.length === 0 && (
          <p className="dm-muted">
            No conversations yet.
          </p>
        )}

        {dm.conversations.map((conversation) => (
          <button
            type="button"
            key={conversation.id}
            className={
              dm.selectedId === conversation.id
                ? 'dm-item active'
                : 'dm-item'
            }
            onClick={() => {
              dm.selectConversation(conversation.id);
              setDraft('');
            }}
          >
            <strong>
              {conversation.otherUser.username}
            </strong>

            <small>
              {conversation.lastMessage?.content ??
                'Start a conversation'}
            </small>
          </button>
        ))}
      </aside>

      <section className="dm-thread">
        <header className="chat-header">
          <h2>
            {dm.selected
              ? `@ ${dm.selected.otherUser.username}`
              : 'Select a conversation'}
          </h2>

          <span>
            {connected ? '● Connected' : '○ Disconnected'}
          </span>
        </header>

        <div className="messages">
          {dm.selectedId && dm.cursor && (
            <button
              type="button"
              className="dm-older"
              onClick={() => void dm.loadOlder()}
              disabled={dm.loading || dm.loadingOlder}
            >
              {dm.loadingOlder
                ? 'Loading...'
                : 'Load older messages'}
            </button>
          )}

          {!dm.selectedId ? (
            <p className="empty">
              Search for someone or choose a conversation.
            </p>
          ) : dm.loading && dm.messages.length === 0 ? (
            <p className="empty">
              Loading messages...
            </p>
          ) : dm.messages.length === 0 ? (
            <p className="empty">
              No messages yet. Say hello!
            </p>
          ) : (
            dm.messages.map((message) => (
              <div
                className="message"
                key={message.id}
              >
                <div className="message-meta">
                  <strong>
                    {message.sender.username}
                  </strong>

                  <time dateTime={message.sentAt}>
                    {new Date(
                      message.sentAt,
                    ).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>

                <div className="message-text">
                  {message.content}
                </div>
              </div>
            ))
          )}
        </div>

        {(dm.error || directError) && (
          <p className="error" role="alert">
            {dm.error || directError}
          </p>
        )}

        
        <form
          className="message-form"
          onSubmit={handleSend}
        >
          <input
            aria-label="Private message"
            placeholder={
              connected
                ? 'Write a private message...'
                : 'Offline — write your message...'
            }
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            disabled={!dm.selectedId}
          />

          <button
            type="submit"
            disabled={
              !connected ||
              !dm.selectedId ||
              !draft.trim()
            }
          >
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
