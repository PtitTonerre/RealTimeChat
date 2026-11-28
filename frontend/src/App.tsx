import { useCallback, useState } from 'react';
import { AuthDialog } from './components/AuthDialog';
import { ChatWindow } from './components/ChatWindow';
import { DirectMessagesPanel } from './components/DirectMessagesPanel';
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
    invalidateSession,
  } = useAuth();

  const [authOpen, setAuthOpen] = useState(false);
  const [privateView, setPrivateView] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const handleInvalidSession = useCallback(() => {
    setPrivateView(false);
    void invalidateSession();
  }, [invalidateSession]);

  const {
    connected,
    identity,
    room,
    messages,
    error,
    joinRoom,
    changeUsername,
    sendMessage,
    directMessages,
    directError,
    sendDirectMessage,
  } = useChat(
    user?.id ?? null,
    checking,
    handleInvalidSession,
  );

  const chatReady =
    !checking &&
    connected &&
    identity !== null &&
    (user === null || identity.id === user.id);

  async function handleLogout(): Promise<void> {
    setLogoutError('');

    try {
      await logout();
      setPrivateView(false);
    } catch (reason) {
      setLogoutError(
        reason instanceof Error
          ? reason.message
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
        onJoinRoom={(nextRoom) => {
          setPrivateView(false);
          joinRoom(nextRoom);
        }}
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

          <div className="account-actions">
            {user && (
              <button
                type="button"
                onClick={() =>
                  setPrivateView((previous) => !previous)
                }
              >
                {privateView
                  ? '← Public channels'
                  : '✉ Private messages'}
              </button>
            )}

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
          </div>
        </header>

        {sessionError && (
          <p className="account-error">
            {sessionError}
          </p>
        )}

        {logoutError && (
          <p className="account-error">
            {logoutError}
          </p>
        )}

        {user && privateView ? (
          <DirectMessagesPanel
            key={user.id}
            connected={chatReady}
            incoming={directMessages}
            directError={directError}
            onSend={sendDirectMessage}
          />
        ) : (
          <ChatWindow
            room={room}
            connected={chatReady}
            messages={messages}
            error={error}
            onSend={sendMessage}
          />
        )}
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
