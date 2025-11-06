
// This is a MOCK authentication service.
// In a real application, this file would be replaced with an integration
// for a real Identity Provider like Auth0, Okta, or Microsoft Entra ID.

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

const SESSION_KEY = 'auth_session';

class AuthService {
  // Simulate checking for an existing session on app load
  async checkSession(): Promise<User | null> {
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session) {
      return JSON.parse(session) as User;
    }
    return null;
  }

  // Simulate logging in as a standard user
  async loginAsUser(): Promise<User> {
    const user: User = {
      id: '123',
      name: 'Standard User',
      email: 'user@example.com',
      role: 'user',
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return user;
  }

  // Simulate logging in as an admin user
  async loginAsAdmin(): Promise<User> {
    const user: User = {
      id: '789',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'admin',
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return user;
  }

  // Simulate logging out
  async logout(): Promise<void> {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

export const authService = new AuthService();
