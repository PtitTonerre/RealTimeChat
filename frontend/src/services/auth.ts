import type {
  AuthUser,
  LoginCredentials,
  LoginResponse,
  RegisterCredentials,
} from '../types/auth';

const API_URL = 'http://localhost:3000';

async function parseResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    if (body && typeof body === 'object' && 'message' in body) {
      const details = body.message;

      if (typeof details === 'string') {
        message = details;
      } else if (Array.isArray(details)) {
        message = details.filter(
          (item): item is string => typeof item === 'string',
        ).join(', ');
      }
    }

    throw new Error(message);
  }

  return body as T;
}

async function post<T>(
  path: string,
  data?: object,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: data
      ? { 'Content-Type': 'application/json' }
      : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });

  return parseResponse<T>(response);
}

export async function register(
  credentials: RegisterCredentials,
): Promise<void> {
  await post('/auth/register', credentials);
}

export function login(
  credentials: LoginCredentials,
): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', credentials);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch(`${API_URL}/auth/me`, {
    credentials: 'include',
  });

  if (response.status === 401) {
    return null;
  }

  return parseResponse<AuthUser>(response);
}

export async function logout(): Promise<void> {
  await post('/auth/logout');
}
