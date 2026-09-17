import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import crownSvg from '../../assets/govuk-crest.svg';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import type { Persona } from '../../stores/appStore';

// The RAIO (Responsible AI Officer) persona oversees the AI estate rather than
// individual cases, so it shares the caseworker routes. Selecting it is what
// reveals the AI Governance entry point on the caseworker dashboard.
const RAIO_ITEMS = [
  { path: '/caseworker', label: 'Governance' },
];

const CITIZEN_ITEMS = [
  { path: '/', label: 'Start' },
  { path: '/search', label: 'Search' },
  { path: '/results', label: 'Results' },
  { path: '/property', label: 'Property' },
  { path: '/liability', label: 'Liability' },
  { path: '/challenge', label: 'Challenge' },
  { path: '/evidence', label: 'Evidence' },
  { path: '/review', label: 'Review' },
  { path: '/confirmation', label: 'Confirmed' },
  { path: '/chat', label: 'Chat (alt)' },
];

const STORY_ITEMS = [
  { path: '/assessment', step: '', label: 'Start' },
  { path: '/assessment?step=search', step: 'search', label: 'Search' },
  { path: '/assessment?step=results', step: 'results', label: 'Results' },
  { path: '/assessment?step=signin', step: 'signin', label: 'Sign in' },
  { path: '/assessment?step=view', step: 'view', label: 'Assessment' },
];

const CW_ITEMS = [
  { path: '/caseworker', label: 'Dashboard' },
  { path: '/caseworker/case', label: 'Case Detail' },
];

// Which persona a given route implies. RAIO is deliberately absent: it shares
// the caseworker routes, so the route alone cannot distinguish the two and the
// store is the authority for that pair.
function routePersona(pathname: string): Persona {
  if (pathname.startsWith('/caseworker')) return 'cw';
  if (pathname === '/assessment') return 'story';
  return 'citizen';
}

export function PrototypeNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const persona = useAppStore((s) => s.persona);
  const setPersona = useAppStore((s) => s.setPersona);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const currentStep = new URLSearchParams(location.search).get('step') || '';

  // Keep the persona in step with the route, so a deep link or a browser Back
  // highlights the right group. RAIO is exempt on the caseworker routes: it
  // shares them with the caseworker persona, so resetting here would drop the
  // selection the moment the dashboard rendered.
  useEffect(() => {
    const implied = routePersona(location.pathname);
    if (implied === 'cw' && persona === 'raio') return;
    if (persona !== implied) setPersona(implied);
  }, [location.pathname, persona, setPersona]);

  // Selecting a group is what switches persona; the citizen group also keeps
  // viewMode aligned so the header toggle and the jump bar agree.
  const go = (next: Persona, path: string) => {
    setPersona(next);
    if (next === 'citizen') setViewMode(path === '/chat' ? 'chat' : 'form');
    navigate(path);
  };

  const active = persona;

  return (
    <div className="prototype-nav-wrapper">
      {/* RAIO group — first, and the only route to the AI Governance panel */}
      <div className={`prototype-nav__group${active !== 'raio' ? ' prototype-nav__group--faded' : ''}`}>
        <span className="prototype-nav__label prototype-nav__label--raio">RAIO</span>
        {RAIO_ITEMS.map((s) => (
          <button key={s.path}
            className={`prototype-nav__btn${active === 'raio' && location.pathname === s.path ? ' prototype-nav__btn--active prototype-nav__btn--raio' : ''}`}
            onClick={() => go('raio', s.path)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="prototype-nav-wrapper__divider" />

      {/* Citizen group */}
      <div className={`prototype-nav__group${active !== 'citizen' ? ' prototype-nav__group--faded' : ''}`}>
        <span className="prototype-nav__label prototype-nav__label--citizen">Citizen</span>
        {CITIZEN_ITEMS.map((s) => (
          <button key={s.path}
            className={`prototype-nav__btn${active === 'citizen' && location.pathname === s.path ? ' prototype-nav__btn--active prototype-nav__btn--citizen' : ''}`}
            onClick={() => go('citizen', s.path)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="prototype-nav-wrapper__divider" />

      {/* AI Citizen group */}
      <div className={`prototype-nav__group${active !== 'story' ? ' prototype-nav__group--faded' : ''}`}>
        <span className="prototype-nav__label prototype-nav__label--story">AI Citizen</span>
        {STORY_ITEMS.map((s) => (
          <button key={s.path}
            className={`prototype-nav__btn${active === 'story' && currentStep === s.step ? ' prototype-nav__btn--active prototype-nav__btn--story' : ''}`}
            onClick={() => go('story', s.path)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="prototype-nav-wrapper__divider" />

      {/* Caseworker group */}
      <div className={`prototype-nav__group${active !== 'cw' ? ' prototype-nav__group--faded' : ''}`}>
        <span className="prototype-nav__label prototype-nav__label--cw">Caseworker</span>
        {CW_ITEMS.map((s) => (
          <button key={s.path}
            className={`prototype-nav__btn${active === 'cw' && location.pathname === s.path ? ' prototype-nav__btn--active prototype-nav__btn--cw' : ''}`}
            onClick={() => go('cw', s.path)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Routes where the form/chat toggle makes sense — the classic citizen journey
// plus the conversational alternative it swaps to.
const CITIZEN_FORM_ROUTES = new Set([
  '/', '/search', '/results', '/property', '/liability', '/challenge', '/evidence', '/review', '/confirmation',
]);

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const signOut = useAuthStore((s) => s.signOut);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);

  const handleSignOut = () => {
    signOut();
    // replace, so browser-Back can't land on a page behind the login gate.
    navigate('/login', { replace: true });
  };

  const isCitizenRoute = CITIZEN_FORM_ROUTES.has(location.pathname) || location.pathname === '/chat';

  const handleToggleView = () => {
    if (viewMode === 'form') {
      setViewMode('chat');
      navigate('/chat');
    } else {
      setViewMode('form');
      navigate('/');
    }
  };

  return (
    <header className="govuk-header">
      <div className="govuk-header__container">
        <div className="govuk-header__logo">
          <img className="govuk-header__crown" src={crownSvg} alt="" width="36" height="32" />
          <span className="govuk-header__logotype-text">GOV.UK</span>
        </div>
        <nav className="govuk-header__nav">
          <Link to="/">HVCTS Service</Link>
          {isAuthenticated && isCitizenRoute && (
            <button type="button" className="govuk-header__signout" onClick={handleToggleView} style={{ marginRight: 12 }}>
              {viewMode === 'form' ? 'Try the chat assistant' : 'Switch to form view'}
            </button>
          )}
          {isAuthenticated && (
            <button type="button" className="govuk-header__signout" onClick={handleSignOut}>
              Sign out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

export function PhaseBanner() {
  return (
    <div className="govuk-phase-banner">
      <span className="govuk-phase-banner__tag">PROTOTYPE</span>
      This is a prototype. Your data will not be saved. <span className="live-data-badge">Live API Data</span>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="govuk-footer">
      <div className="govuk-footer__meta">
        <p>HVCTS AI-Augmented Prototype — Cognizant × HMRC × VOA</p>
        <p style={{ marginTop: 5 }}>Built with GOV.UK Design System patterns. Property data from HM Land Registry. For demonstration purposes only.</p>
      </div>
    </footer>
  );
}

interface PageLayoutProps {
  children: ReactNode;
  backLink?: { to: string; label?: string };
  wide?: boolean;
}

export function PageLayout({ children, backLink, wide = false }: PageLayoutProps) {
  return (
    <>
      <Header />
      <PhaseBanner />
      <div className={wide ? 'govuk-width-container--full' : 'govuk-width-container'}>
        <main className="govuk-main-wrapper">
          {backLink && (
            <Link to={backLink.to} className="govuk-back-link">{backLink.label || 'Back'}</Link>
          )}
          {children}
        </main>
      </div>
      <Footer />
    </>
  );
}
