import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { startPwa } from './lib/pwa';

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root en index.html');

startPwa();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
