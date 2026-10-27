import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as authApi from '../api/auth';
import { configureHttp } from '../api/http';
import type { PublicUser } from '../api/types';

const STORAGE_KEY = 'gatherly.auth';
interface AuthState {
  token: string;
  user: PublicUser;
}
interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  login(email: string, password: string): Promise<void>;
  signup(email: string, password: string): Promise<void>;
  logout(): void;
}
const AuthContext = createContext<AuthContextValue | null>(null);
function restore(): AuthState | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as AuthState) : null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(restore);
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }, []);
  useEffect(
    () =>
      configureHttp({
        getToken: () => auth?.token ?? null,
        onUnauthorized: () => {
          logout();
          navigate('/login', {
            replace: true,
            state: {
              from: {
                pathname: location.pathname,
                search: location.search,
                hash: location.hash,
              },
            },
          });
        },
      }),
    [
      auth?.token,
      location.hash,
      location.pathname,
      location.search,
      logout,
      navigate,
    ],
  );
  const authenticate = useCallback(
    async (kind: 'login' | 'signup', email: string, password: string) => {
      const result = await authApi[kind](email, password);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      setAuth(result);
    },
    [],
  );
  const value = useMemo<AuthContextValue>(
    () => ({
      user: auth?.user ?? null,
      token: auth?.token ?? null,
      login: (e, p) => authenticate('login', e, p),
      signup: (e, p) => authenticate('signup', e, p),
      logout,
    }),
    [auth, authenticate, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
