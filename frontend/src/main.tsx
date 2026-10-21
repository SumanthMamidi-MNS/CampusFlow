import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * `index.html` paints a static branded screen before this bundle executes.
 * React's own loading state (`SplashScreen`) is identical, so the overlay is
 * faded out only after the tree has painted — otherwise the first render would
 * be a flash of blank background between two brand screens.
 */
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.style.opacity = '0';
    boot.style.pointerEvents = 'none';
    const remove = () => boot.remove();
    boot.addEventListener('transitionend', remove, { once: true });
    // transitionend does not fire when the element is already hidden (tab in the
    // background), so the removal is also guaranteed by a timer.
    window.setTimeout(remove, 700);
  });
});
