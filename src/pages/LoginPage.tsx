import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/layout';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const signIn = useAuthStore((s) => s.signIn);

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // A bad credential pair marks both fields, since we deliberately don't say
  // which one was wrong.
  const [bothFieldsInError, setBothFieldsInError] = useState(false);

  // Where RequireAuth wanted to send them before the redirect to /login.
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBothFieldsInError(false);

    if (!loginId.trim()) {
      setError('Enter your login ID');
      return;
    }
    if (!password) {
      setError('Enter your password');
      return;
    }
    if (!signIn(loginId, password)) {
      setError('The login ID or password is incorrect');
      setBothFieldsInError(true);
      return;
    }
    setError('');
    navigate(from ?? '/', { replace: true });
  };

  const idInError = bothFieldsInError || error === 'Enter your login ID';
  const passwordInError = bothFieldsInError || error === 'Enter your password';

  return (
    <PageLayout>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-l">
            Sign in to HVCTS
            <span className="govuk-caption-l" style={{ marginTop: 10 }}>
              High Value Council Tax Surcharge service
            </span>
          </h1>
          <p className="govuk-body">
            Enter the login ID and password you were given to access this prototype.
          </p>

          {error && (
            <div className="govuk-error-summary" role="alert">
              <h2 className="govuk-error-summary__title">There is a problem</h2>
              <p className="govuk-error-summary__body">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <fieldset className="govuk-fieldset">
              <legend className="govuk-fieldset__legend">Your sign-in details</legend>

              <div className={`govuk-form-group${idInError ? ' govuk-form-group--error' : ''}`}>
                <label className="govuk-label" htmlFor="login-id">Login ID</label>
                <input
                  className="govuk-input"
                  id="login-id"
                  name="login-id"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                />
              </div>

              <div className={`govuk-form-group${passwordInError ? ' govuk-form-group--error' : ''}`}>
                <label className="govuk-label" htmlFor="password">Password</label>
                <input
                  className="govuk-input"
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </fieldset>

            <button className="govuk-button govuk-button--primary" type="submit">
              Sign in
            </button>
          </form>

          <h2 className="govuk-heading-m" style={{ marginTop: 40 }}>If you cannot sign in</h2>
          <p className="govuk-body">
            Contact the team who shared this prototype with you for access details.
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
