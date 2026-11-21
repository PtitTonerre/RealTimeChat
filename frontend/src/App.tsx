import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';

const ROOMS = ['general', 'gaming', 'development'] as const;

type Room = (typeof ROOMS)[number];

type ChatMessage = {
  room: Room;
  content: string;
};

type ServerEvent =
  | { event: 'connected'; data: string }
  | { event: 'chat.joined'; data: { room: Room } }
  | { event: 'chat.message'; data: ChatMessage }
  | {
      event: 'chat.history';
      data: {
        room: Room;
        messages: ChatMessage[];
      };
    }
  | { event: 'chat.error'; data: { message: string } };

function App() {
  const socketRef = useRef<WebSocket | null>(null);

  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<Room>('general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:3000/ws');
    socketRef.current = socket;

    let active = true;

    socket.onopen = () => {
      if (active) setConnected(true);
    };

    socket.onmessage = (event: MessageEvent) => {
      if (!active) return;

      try {
        const message = JSON.parse(
          event.data as string,
        ) as ServerEvent;

        switch (message.event) {
          case 'chat.joined':
            setRoom(message.data.room);
            setError('');
            break;

          case 'chat.history':
            setMessages((previous) => [
              ...previous.filter(
                (item) => item.room !== message.data.room,
              ),
              ...message.data.messages,
            ]);
            break;
          
          case 'chat.message':
            setMessages((previous) => [
              ...previous,
              message.data,
            ]);
            break;

          case 'chat.error':
            setError(message.data.message);
            break;
        }
      } catch {
        setError('Invalid server message');
      }
    };

    socket.onclose = () => {
      if (active) setConnected(false);
    };

    return () => {
      active = false;
      socket.close();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, []);

  function sendEvent(event: string, data: string) {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify({ event, data }));
  }

  function joinRoom(nextRoom: Room) {
    sendEvent('chat.join', nextRoom);
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = input.trim();

    if (!connected || !content || content.length > 500) {
      return;
    }

    sendEvent('chat.message', content);
    setInput('');
  }

  const visibleMessages = messages.filter(
    (message) => message.room === room,
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>Real-Time Chat</h2>

        <p className="sidebar-label">CHANNELS</p>

        {ROOMS.map((name) => (
          <button
            key={name}
            className={room === name ? 'room active' : 'room'}
            onClick={() => joinRoom(name)}
            disabled={!connected}
          >
            # {name}
          </button>
        ))}
      </aside>

      <main className="chat">
        <header className="chat-header">
          <h2># {room}</h2>
          <span>{connected ? '● Connected' : '○ Disconnected'}</span>
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

        <form className="message-form" onSubmit={sendMessage}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={`Message #${room}`}
            maxLength={500}
            disabled={!connected}
          />

          <button disabled={!connected || !input.trim()}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}

export default App;
