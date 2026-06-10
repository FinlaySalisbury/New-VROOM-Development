import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Design system first (tokens + brand), then legacy app styles we reuse during
// the migration, then our global a11y layer.
import './styles/yunex-design-system.css';
import './styles/legacy.css';
import './styles/global.css';

import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
