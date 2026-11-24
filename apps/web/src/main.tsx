import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './index.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Không tìm thấy #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
