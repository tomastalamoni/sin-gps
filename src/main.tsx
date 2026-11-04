import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { startErrorLog } from './lib/errors';
import { startPwa } from './lib/pwa';
import { requestPersistentStorage } from './storage/db';

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root en index.html');

startErrorLog();
startPwa();
void requestPersistentStorage();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
