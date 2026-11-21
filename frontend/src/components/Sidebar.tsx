import { ROOMS } from '../types/chat';
import type { Room } from '../types/chat';

interface SidebarProps {
  room: Room;
  connected: boolean;
  onJoinRoom: (room: Room) => void;
}

export function Sidebar({
  room,
  connected,
  onJoinRoom,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <h2>Real-Time Chat</h2>

      <p className="sidebar-label">CHANNELS</p>

      {ROOMS.map((name) => (
        <button
          key={name}
          className={room === name ? 'room active' : 'room'}
          onClick={() => onJoinRoom(name)}
          disabled={!connected}
        >
          # {name}
        </button>
      ))}
    </aside>
  );
}
