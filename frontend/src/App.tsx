
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { useChat } from './hooks/useChat';

import './App.css';

function App() {
  const {
    connected,
    room,
    messages,
    error,
    joinRoom,
    sendMessage,
  } = useChat();

  return (
    <div className="app">
      <Sidebar
        room={room}
        connected={connected}
        onJoinRoom={joinRoom}
      />

      <ChatWindow
        room={room}
        connected={connected}
        messages={messages}
        error={error}
        onSend={sendMessage}
      />
    </div>
  );
}

export default App;
