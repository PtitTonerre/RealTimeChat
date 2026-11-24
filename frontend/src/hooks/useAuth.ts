import { useEffect, useState } from 'react';

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

    authApi.getCurrentUser()
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
  }

  return {
    user,
    checking,
    sessionError,
    login,
    register,
    logout,
  };
}
