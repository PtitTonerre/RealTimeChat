import { useState } from 'react';
import type { FormEvent } from 'react';

import type {
  LoginCredentials,
  RegisterCredentials,
} from '../types/auth';

interface AuthDialogProps {
  onClose: () => void;
  onLogin: (credentials: LoginCredentials) => Promise<void>;
  onRegister: (credentials: RegisterCredentials) => Promise<void>;
}

type AuthMode = 'login' | 'register';

export function AuthDialog({
  onClose,
  onLogin,
  onRegister,
}: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>('login');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
    setNotice('');
    setPassword('');
  }

  async function handleSubmit(
    event: FormEvent<   HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    setError('');
    setNotice('');
    setPending(true);

    try {
      if (mode === 'register') {
        await onRegister({
          username,
          email,
          password,
        });

        setPassword('');
        setMode('login');
        setNotice('Account created! You can now sign in.');
      } else {
        await onLogin({ email, password });
        onClose();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-overlay">
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <div className="auth-heading">
          <h2 id="auth-title">
            {mode === 'login' ? 'Welcome back' : 'Create an account'}
          </h2>

          <button
            type="button"
            className="auth-close"
            onClick={onClose}
            aria-label="Close"
            disabled={pending}
          >
            ×
          </button>
        </div>

        <p className="auth-description">
          {mode === 'login'
            ? 'Sign in to your Real-Time Chat account.'
            : 'Join Real-Time Chat with your own account.'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label>
              Username
              <input
                type="text"
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value)
                }
                minLength={2}
                maxLength={20}
                autoComplete="username"
                required
                disabled={pending}
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              autoComplete="email"
              maxLength={254}
              required
              disabled={pending}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              autoComplete={
                mode === 'login'
                  ? 'current-password'
                  : 'new-password'
              }
              minLength={mode === 'register' ? 12 : undefined}
              maxLength={128}
              required
              disabled={pending}
            />
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          {notice && (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={pending}
          >
            {pending
              ? 'Please wait...'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login'
            ? "Don't have an account?"
            : 'Already have an account?'}

          <button
            type="button"
            onClick={() =>
              changeMode(mode === 'login' ? 'register' : 'login')
            }
            disabled={pending}
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </section>
    </div>
  );
}
