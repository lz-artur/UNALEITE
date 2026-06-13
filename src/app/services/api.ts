const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3001/api';
const API_TOKEN_STORAGE_KEYS = ['una.api.token', 'supabase.auth.token', 'supabase.access_token'];

export class ApiUnavailableError extends Error {
  constructor(message = 'API unavailable') {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

function getStoredToken() {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_API_TOKEN as string | undefined;
  }

  for (const key of API_TOKEN_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value) {
      return value;
    }
  }

  return import.meta.env.VITE_API_TOKEN as string | undefined;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    throw new ApiUnavailableError(error instanceof Error ? error.message : 'Network error');
  }

  if (response.status === 401 || response.status === 403) {
    const text = await response.text();
    throw new Error(text || 'Sua sessão não tem autorização para acessar a API.');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function withFallback<T>(loader: () => Promise<T>, fallback: () => T | Promise<T>) {
  try {
    return await loader();
  } catch (error) {
    if (error instanceof ApiUnavailableError) {
      return fallback();
    }

    throw error;
  }
}
