import { useState } from 'react';
import type { FormEvent } from 'react';

import { ROOMS } from '../types/chat';

import type { AuthUser } from '../types/auth';
import type { ChatSender, Room } from '../types/chat';

interface SidebarProps {
  room: Room;
  connected: boolean;
  identity: ChatSender | null;
  user: AuthUser | null;
  onJoinRoom: (room: Room) => void;
  onChangeUsername: (username: string) => boolean;
}

export function Sidebar({
  room,
  connected,
  identity,
  user,
  onJoinRoom,
  onChangeUsername,
}: SidebarProps) {
  const [username, setUsername] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (onChangeUsername(username)) {
      setUsername('');
    }
  }

  return (
    <aside className="sidebar">
      <h2>Real-Time Chat</h2>

      <div className="profile">
        <p className="sidebar-label">YOUR PROFILE</p>

        <strong>
          {user?.username ?? identity?.username ?? 'Connecting...'}
        </strong>

        {user ? (
          <p className="profile-authenticated">
            Authenticated account
          </p>
        ) : (
          <form
            className="username-form"
            onSubmit={handleSubmit}
          >
            <input
              aria-label="New username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="New username"
              maxLength={20}
              disabled={!connected || !identity}
            />

            <button
              type="submit"
              disabled={
                !connected ||
                !identity ||
                username.trim().length < 2
              }
            >
              Update
            </button>
          </form>
        )}
      </div>

      <p className="sidebar-label">CHANNELS</p>

      {ROOMS.map((name) => (
        <button
          key={name}
          className={room === name ? 'room active' : 'room'}
          onClick={() => onJoinRoom(name)}
          disabled={!connected || !identity}
        >
          # {name}
        </button>
      ))}
    </aside>
  );
}
