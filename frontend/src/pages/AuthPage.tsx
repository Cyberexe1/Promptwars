import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PageShell } from '../components/layout/PageShell';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  useDocumentTitle(signup ? 'Create account' : 'Log in');
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (errors.form) errorSummary.current?.focus();
  }, [errors.form]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email))
      next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    else if (
      signup &&
      (!/[a-z]/.test(password) ||
        !/[A-Z]/.test(password) ||
        !/\d/.test(password) ||
        password.length < 8)
    )
      next.password =
        'Use 8 or more characters with uppercase, lowercase, and a number.';
    if (Object.keys(next).length) {
      setErrors(next);
      queueMicrotask(() =>
        document.getElementById(Object.keys(next)[0] ?? '')?.focus(),
      );
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await auth[mode](email, password);
      const fromLocation = (
        location.state as {
          from?: { pathname?: string; search?: string; hash?: string };
        } | null
      )?.from;
      const from = fromLocation?.pathname
        ? `${fromLocation.pathname}${fromLocation.search ?? ''}${fromLocation.hash ?? ''}`
        : undefined;
      navigate(from ?? '/events', { replace: true });
    } catch (error) {
      const details =
        error instanceof ApiError && Array.isArray(error.details)
          ? (error.details as { field: string; message: string }[])
          : [];
      const fields = Object.fromEntries(
        details.map((item) => [item.field, item.message]),
      );
      setErrors({
        ...fields,
        form: error instanceof Error ? error.message : 'Unable to continue.',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageShell>
      <section className="narrow">
        <p className="eyebrow">
          {signup ? 'Your next gathering starts here' : 'Welcome back'}
        </p>
        <h1>{signup ? 'Create your account' : 'Log in'}</h1>
        {errors.form && (
          <div
            ref={errorSummary}
            className="error-summary"
            role="alert"
            tabIndex={-1}
          >
            <strong>There was a problem</strong>
            <p>{errors.form}</p>
          </div>
        )}
        <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <p id="email-error" className="field-error">
                {errors.email}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={
                errors.password
                  ? 'password-error'
                  : signup
                    ? 'password-hint'
                    : undefined
              }
            />
            {signup && (
              <p id="password-hint" className="hint">
                8+ characters with uppercase, lowercase, and a number.
              </p>
            )}
            {errors.password && (
              <p id="password-error" className="field-error">
                {errors.password}
              </p>
            )}
          </div>
          <button disabled={busy}>
            {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
          </button>
          <p role="status" className="sr-only">
            {busy ? 'Submitting form' : ''}
          </p>
        </form>
        <p>
          {signup ? 'Already have an account?' : 'New to Gatherly?'}{' '}
          <Link to={signup ? '/login' : '/signup'}>
            {signup ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </section>
    </PageShell>
  );
}
