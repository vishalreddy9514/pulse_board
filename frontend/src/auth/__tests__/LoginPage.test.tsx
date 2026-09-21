import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { AuthProvider } from '../AuthContext';
import { LoginPage } from '../LoginPage';

const { login, register, me } = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  me: vi.fn(),
}));

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return { ...actual, api: { ...actual.api, login, register, me } };
});

function renderLogin() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const credentials = {
  accessToken: 'token-123',
  user: { id: 'u1', email: 'demo@pulseboard.dev', createdAt: '2026-09-21T00:00:00.000Z' },
};

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // AuthProvider re-validates the stored token through /auth/me as soon as a
    // login writes one, so the mock has to answer that call too.
    me.mockResolvedValue(credentials.user);
  });

  it('signs in with the entered credentials and stores the token', async () => {
    login.mockResolvedValue(credentials);
    const user = userEvent.setup();
    renderLogin();

    await user.clear(screen.getByLabelText(/email/i));
    await user.type(screen.getByLabelText(/email/i), 'ops@pulseboard.dev');
    await user.clear(screen.getByLabelText(/password/i));
    await user.type(screen.getByLabelText(/password/i), 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('ops@pulseboard.dev', 'hunter2hunter2'));
    await waitFor(() => expect(localStorage.getItem('pulseboard.token')).toBe('token-123'));
  });

  it('shows the API message when the credentials are rejected', async () => {
    login.mockRejectedValue(new ApiError('Invalid email or password', 401));
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(localStorage.getItem('pulseboard.token')).toBeNull();
  });

  it('explains a network failure rather than showing a raw error', async () => {
    login.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the api/i);
  });

  it('switches to registration and calls the register endpoint', async () => {
    register.mockResolvedValue(credentials);
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /need an account/i }));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(login).not.toHaveBeenCalled();
  });
});
