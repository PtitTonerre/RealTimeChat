import type {
  ChatMessage,
  Room,
} from '../types/chat';

import { MessageInput } from './MessageInput';

interface ChatWindowProps {
  room: Room;
  connected: boolean;
  messages: ChatMessage[];
  error: string;
  onSend: (content: string) => boolean;
}

export function ChatWindow({
  room,
  connected,
  messages,
  error,
  onSend,
}: ChatWindowProps) {
  const visibleMessages = messages.filter(
    (message) => message.room === room,
  );

  return (
    <main className="chat">
      <header className="chat-header">
        <h2># {room}</h2>

        <span>
          {connected ? '● Connected' : '○ Disconnected'}
        </span>
      </header>

      <section className="messages">
        {visibleMessages.length === 0 ? (
          <p className="empty">No messages yet. Say hello!</p>
        ) : (
          visibleMessages.map((message, index) => (
            <div className="message" key={index}>
              {message.content}
            </div>
          ))
        )}
      </section>

      {error && <p className="error">{error}</p>}

      <MessageInput
        room={room}
        connected={connected}
        onSend={onSend}
      />
    </main>
  );
}
