import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import crownSvg from '../../assets/govuk-crest.svg';

const SCREENS = [
  { path: '/', label: '1. Start' },
  { path: '/search', label: '2. Search' },
  { path: '/results', label: '3. Results' },
  { path: '/property', label: '4. Property' },
  { path: '/liability', label: '5. Liability' },
  { path: '/challenge', label: '6. Challenge' },
  { path: '/evidence', label: '7. Evidence' },
  { path: '/review', label: '8. Review' },
  { path: '/confirmation', label: '9. Confirmed' },
];

const CW_SCREENS = [
  { path: '/caseworker', label: 'CW: Dashboard' },
  { path: '/caseworker/case', label: 'CW: Case' },
];

export function PrototypeNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isCwRoute = location.pathname.startsWith('/caseworker');
  return (
    <div className="prototype-nav-wrapper">
      <nav className={`prototype-nav prototype-nav--citizen${!isCwRoute ? ' prototype-nav--current' : ''}`}>
        <span className="prototype-nav__label">CITIZEN JOURNEY</span>
        {SCREENS.map((s) => (
          <button
            key={s.path}
            className={`prototype-nav__btn${location.pathname === s.path ? ' prototype-nav__btn--active' : ''}`}
            onClick={() => navigate(s.path)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <nav className={`prototype-nav prototype-nav--caseworker${isCwRoute ? ' prototype-nav--current' : ''}`}>
        <span className="prototype-nav__label">CASEWORKER</span>
        {CW_SCREENS.map((s) => (
          <button
            key={s.path}
            className={`prototype-nav__btn prototype-nav__btn--cw${location.pathname === s.path ? ' prototype-nav__btn--active' : ''}`}
            onClick={() => navigate(s.path)}
          >
            {s.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function Header() {
  return (
    <header className="govuk-header">
      <div className="govuk-header__container">
        <div className="govuk-header__logo">
          <img className="govuk-header__crown" src={crownSvg} alt="" width="36" height="32" />
          <span className="govuk-header__logotype-text">GOV.UK</span>
        </div>
        <nav className="govuk-header__nav">
          <Link to="/">HVCTS Service</Link>
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
