import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Bundled rather than loaded from unpkg, so the app has no runtime CDN
// dependency and needs no external origin in the Content-Security-Policy.
import 'leaflet/dist/leaflet.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
