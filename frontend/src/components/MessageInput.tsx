import { useState } from 'react';
import type { FormEvent } from 'react';

import type { Room } from '../types/chat';

interface MessageInputProps {
  room: Room;
  connected: boolean;
  onSend: (content: string) => boolean;
}

export function MessageInput({
  room,
  connected,
  onSend,
}: MessageInputProps) {
  const [input, setInput] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (onSend(input)) {
      setInput('');
    }
  }

  return (
    <form className="message-form" onSubmit={handleSubmit}>
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={`Message #${room}`}
        maxLength={500}
        disabled={!connected}
      />

      <button
        type="submit"
        disabled={!connected || !input.trim()}
      >
        Send
      </button>
    </form>
  );
}
