import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

// Layout route guard: renders the matched child route only when signed in,
// otherwise sends the visitor to /login while remembering where they were
// headed so LoginPage can return them there.
export function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
