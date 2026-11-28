import { useCallback, useEffect, useState } from 'react';
import * as authApi from '../services/auth';

import type {
  AuthUser,
  LoginCredentials,
  RegisterCredentials,
} from '../types/auth';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    let active = true;

    void authApi.getCurrentUser()
      .then((currentUser) => {
        if (active) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (active) {
          setSessionError('Could not check your session.');
        }
      })
      .finally(() => {
        if (active) {
          setChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function login(
    credentials: LoginCredentials,
  ): Promise<void> {
    const response = await authApi.login(credentials);

    setUser(response.user);
    setSessionError('');
  }

  async function register(
    credentials: RegisterCredentials,
  ): Promise<void> {
    await authApi.register(credentials);
  }

  async function logout(): Promise<void> {
    await authApi.logout();

    setUser(null);
    setSessionError('');
  }

  const invalidateSession = useCallback(async (): Promise<void> => {
    // Hide the previous account's data immediately.
    setChecking(true);
    setUser(null);
    setSessionError('Session expired. Please log in again.');

    try {
      // Clear the expired cookie before opening a guest socket.
      await authApi.logout();
    } catch {
      setSessionError(
        'Session expired. Could not clear the session cookie.',
      );
    } finally {
      setChecking(false);
    }
  }, []);

  return {
    user,
    checking,
    sessionError,
    login,
    register,
    logout,
    invalidateSession,
  };
}
