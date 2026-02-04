import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { useImageStore } from './stores/imageStore';

// Expose store on window for dev testing (browser console / automation)
if (import.meta.env.DEV) {
  (window as any).__loupe = {
    store: () => useImageStore.getState(),
    importPath: (path: string) => useImageStore.getState().importPath(path),
    importFolder: () => useImageStore.getState().importFolder(),
    importJson: (url?: string) => useImageStore.getState().importFromJson(url || '/import-payload.json'),
  };

  // Auto-import from URL param: ?folder=/path/to/files
  const params = new URLSearchParams(window.location.search);
  const autoFolder = params.get('folder');
  if (autoFolder) {
    setTimeout(() => useImageStore.getState().importPath(autoFolder), 500);
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);