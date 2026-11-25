import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './index.css';
import { parseKioskParam } from './pwa.js';
import { initPwa } from './pwa-register.js';
import { useSimStore } from './store.js';

// P0.9: đọc ?kiosk=1 một lần ở khởi động (đổi param cần reload — OQ-226)
// rồi đăng ký service worker (ngoài StrictMode effect để chỉ đăng ký 1 lần).
useSimStore.getState().setKiosk(parseKioskParam(window.location.search));
initPwa();

const root = document.getElementById('root');
if (root === null) throw new Error('Không tìm thấy #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
