import { useState } from 'react';
import { AuthDialog } from './components/AuthDialog';
import { ChatWindow } from './components/ChatWindow';
import { Sidebar } from './components/Sidebar';
import { useAuth } from './hooks/useAuth';
import { useChat } from './hooks/useChat';

import './App.css';

function App() {
  const {
    user,
    checking,
    sessionError,
    login,
    register,
    logout,
  } = useAuth();

  const {
    connected,
    identity,
    room,
    messages,
    error,
    joinRoom,
    changeUsername,
    sendMessage,
  } = useChat(user?.id ?? null, checking);

  const [authOpen, setAuthOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const chatReady =
    !checking &&
    connected &&
    identity !== null &&
    (user === null || identity.id === user.id);

  async function handleLogout(): Promise<void> {
    setLogoutError('');

    try {
      await logout();
    } catch (err) {
      setLogoutError(
        err instanceof Error
          ? err.message
          : 'Could not log out.',
      );
    }
  }

  return (
    <div className="app">
      <Sidebar
        room={room}
        connected={chatReady}
        identity={identity}
        user={user}
        onJoinRoom={joinRoom}
        onChangeUsername={changeUsername}
      />

      <div className="chat-layout">
        <header className="account-bar">
          <div className="account-details">
            {checking ? (
              <span>Checking session...</span>
            ) : user ? (
              <strong>Signed in as {user.username}</strong>
            ) : (
              <span>Browsing as guest</span>
            )}
          </div>

          {!checking && (
            user ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
              >
                Log out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
              >
                Log in / Register
              </button>
            )
          )}
        </header>

        {sessionError && (
          <p className="account-error">{sessionError}</p>
        )}

        {logoutError && (
          <p className="account-error">{logoutError}</p>
        )}

        <ChatWindow
          room={room}
          connected={chatReady}
          messages={messages}
          error={error}
          onSend={sendMessage}
        />
      </div>

      {authOpen && (
        <AuthDialog
          onClose={() => setAuthOpen(false)}
          onLogin={login}
          onRegister={register}
        />
      )}
    </div>
  );
}

export default App;
