import { create } from 'zustand';

// Static demo credentials for the prototype front door. These are compiled into
// the client bundle in plaintext — anyone with devtools can read them. This is a
// demo gate to keep casual visitors out of the walkthrough, NOT authentication.
// Real access control is the Azure Static Web Apps + Entra ID path in infra/.
const DEMO_LOGIN_ID = 'HVCTS_POC';
const DEMO_PASSWORD = 'C0gn1z4nt';

const SESSION_KEY = 'hvcts.auth';

// sessionStorage throws rather than returning null in some privacy modes, so
// every access is guarded. A failure just means the session doesn't persist
// across a refresh, which is survivable.
function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(loginId: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, loginId);
  } catch {
    // ignore — sign-in still works for this page view
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

interface AuthState {
  isAuthenticated: boolean;
  loginId: string | null;
  signIn: (loginId: string, password: string) => boolean;
  signOut: () => void;
}

const restored = readSession();

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: restored !== null,
  loginId: restored,

  // Returns whether the credentials matched, so the login page can render its
  // own error without reading state back out of the store.
  signIn: (loginId, password) => {
    // Trim the login ID only — pasting it often drags whitespace along. A
    // password's whitespace is significant, so that one is compared verbatim.
    const id = loginId.trim();
    if (id !== DEMO_LOGIN_ID || password !== DEMO_PASSWORD) return false;
    writeSession(id);
    set({ isAuthenticated: true, loginId: id });
    return true;
  },

  signOut: () => {
    clearSession();
    set({ isAuthenticated: false, loginId: null });
  },
}));
