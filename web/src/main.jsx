import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  let previousController = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const wasControlled = Boolean(previousController);
    previousController = navigator.serviceWorker.controller;
    if (!wasControlled) return;
    window.__handlaUpdateReady = true;
    window.dispatchEvent(new Event('handla:update-ready'));
  });
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {updateViaCache:'none'});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    } catch {}
  });
}
