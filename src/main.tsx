import 'core-js/es/map/get-or-insert-computed';
import 'core-js/es/weak-map/get-or-insert-computed';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
