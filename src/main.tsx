import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Daftarkan service worker secara otomatis untuk kapabilitas PWA & offline cache
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);
