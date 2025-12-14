import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Register Service Worker EARLY (before React renders)
if ('serviceWorker' in navigator) {
  // Register immediately, don't wait for load event
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(registration => {
        console.log('✅ SW registered successfully:', registration.scope);
        
        // Verify service worker is active
        if (registration.active) {
          console.log('✅ Service Worker is active');
        }
        if (registration.installing) {
          console.log('⏳ Service Worker is installing...');
        }
        if (registration.waiting) {
          console.log('⏸️ Service Worker is waiting...');
        }
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('🔄 New service worker available');
              }
            });
          }
        });
      })
      .catch(registrationError => {
        console.error('❌ SW registration failed:', registrationError);
      });
  });
  
  // Listen for controller changes (when new SW takes control)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('🔄 Service Worker controller changed, reloading...');
    window.location.reload();
  });
  
  // Check if service worker is already controlling the page
  if (navigator.serviceWorker.controller) {
    console.log('✅ Service Worker is already controlling the page');
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Show loading animation
const loadingDiv = document.createElement('div');
loadingDiv.id = 'app-loading';
loadingDiv.innerHTML = `
  <div style="
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #f5f5f7;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    transition: opacity 0.3s ease;
  ">
    <img src="/onboarding_logo.jpg" alt="Loading" style="width: 80px; height: 80px; border-radius: 16px; margin-bottom: 24px; animation: pulse 2s ease-in-out infinite;" />
    <div style="
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #ff6b6b;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    "></div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(0.95); }
      }
    </style>
  </div>
`;
document.body.appendChild(loadingDiv);

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Remove loading animation when app is ready
window.addEventListener('load', () => {
  setTimeout(() => {
    const loading = document.getElementById('app-loading');
    if (loading) {
      loading.style.opacity = '0';
      setTimeout(() => loading.remove(), 300);
    }
  }, 500);
});