import { tokenStorage, csrfStorage } from './storage';
import type { ApiBounty } from '../screens/components/bounties/BountyCard';

// Production API URL
const API_BASE_URL = 'https://dev.recordyourday.com/api';

export type ApiError = {
  message: string;
  errors?: Array<{ path: string[]; message: string }>;
  statusCode: number;
};

// Fetch and store CSRF token from the server
export async function fetchCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
    });
    console.log('🚀 ~ fetchCsrfToken ~ response:', response);
    const data = await response.json();
    console.log('🚀 ~ fetchCsrfToken ~ data:', data);
    if (data.csrfToken) {
      csrfStorage.setCsrfToken(data.csrfToken);
      return data.csrfToken;
    }
    return null;
  } catch (error) {
    console.warn('Failed to fetch CSRF token:', error);
    return null;
  }
}

// Get CSRF token, fetching if needed
async function getCsrfToken(): Promise<string | null> {
  let token = csrfStorage.getCsrfToken();
  if (!token) {
    token = await fetchCsrfToken();
  }
  return token;
}

export class ApiException extends Error {
  statusCode: number;
  errors?: Array<{ path: string[]; message: string }>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiException';
    this.statusCode = error.statusCode;
    this.errors = error.errors;
  }

  getFieldError(field: string): string | undefined {
    return this.errors?.find(e => e.path.includes(field))?.message;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
};

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, headers = {}, requiresAuth = false } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (requiresAuth) {
    const token = tokenStorage.getToken();
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }

    // Add CSRF token for mutating requests (POST, PUT, PATCH, DELETE)
    if (method !== 'GET') {
      const csrfToken = await getCsrfToken();
      if (csrfToken) {
        requestHeaders['X-CSRF-Token'] = csrfToken;
      }
    }
  }

  const config: RequestInit = {
    method,
    headers: requestHeaders,
    credentials: 'include', // Include cookies in requests
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      throw new ApiException({
        message: data.message || data.error || 'An error occurred',
        errors: data.errors,
        statusCode: response.status,
      });
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiException) {
      throw error;
    }

    // Network or other errors
    throw new ApiException({
      message:
        error instanceof Error
          ? error.message
          : 'Network error. Please check your connection.',
      statusCode: 0,
    });
  }
}

export const api = {
  get: <T>(endpoint: string, requiresAuth = false) =>
    request<T>(endpoint, { method: 'GET', requiresAuth }),

  post: <T>(
    endpoint: string,
    body: Record<string, unknown>,
    requiresAuth = false,
  ) => request<T>(endpoint, { method: 'POST', body, requiresAuth }),

  put: <T>(
    endpoint: string,
    body: Record<string, unknown>,
    requiresAuth = false,
  ) => request<T>(endpoint, { method: 'PUT', body, requiresAuth }),

  patch: <T>(
    endpoint: string,
    body: Record<string, unknown>,
    requiresAuth = false,
  ) => request<T>(endpoint, { method: 'PATCH', body, requiresAuth }),

  delete: <T>(endpoint: string, requiresAuth = false) =>
    request<T>(endpoint, { method: 'DELETE', requiresAuth }),
};

// Bounties API
export type BountiesResponse = {
  bounties: ApiBounty[];
};

export async function fetchBounties(): Promise<ApiBounty[]> {
  const response = await api.get<BountiesResponse>('/bounties?all=true', true);
  return response.bounties;
}

// File upload function for multipart/form-data
export async function uploadFile<T>(
  endpoint: string,
  fileUri: string,
  fieldName: string = 'file',
  token?: string,
): Promise<T> {
  const authToken = token ?? tokenStorage.getToken();

  // Get file info from URI
  const filename = fileUri.split('/').pop() || 'file.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  const formData = new FormData();
  formData.append(fieldName, {
    uri: fileUri,
    name: filename,
    type,
  } as unknown as Blob);

  const headers: Record<string, string> = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  // Add CSRF token for file uploads
  const csrfToken = await getCsrfToken();
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });
    console.log('🚀 ~ uploadFile ~ response:', response);

    const data = await response.json();
    console.log('🚀 ~ uploadFile ~ data:', data);

    if (!response.ok) {
      throw new ApiException({
        message: data.message || data.error || 'Upload failed',
        errors: data.errors,
        statusCode: response.status,
      });
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiException) {
      throw error;
    }

    throw new ApiException({
      message:
        error instanceof Error
          ? error.message
          : 'Upload failed. Please try again.',
      statusCode: 0,
    });
  }
}
