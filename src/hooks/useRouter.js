import { useState, useEffect, useCallback } from 'react';

export function useRouter(defaultPath = 'launchpad') {
  const getPath = useCallback(() => {
    const path = window.location.pathname.replace(/^\//, '');
    if (path) {
      return path;
    }
    return localStorage.getItem('personal-control-active-tab') || defaultPath;
  }, [defaultPath]);

  const [currentPath, setCurrentPath] = useState(getPath);

  useEffect(() => {
    // Sincroniza a URL inicial se ela estava vazia (ex: '/' -> '/finances-dashboard')
    const initialPath = getPath();
    const currentUrlPath = window.location.pathname.replace(/^\//, '');
    if (currentUrlPath !== initialPath) {
      window.history.replaceState(null, '', `/${initialPath}`);
    }
    localStorage.setItem('personal-control-active-tab', initialPath);
  }, [getPath]);

  useEffect(() => {
    const handlePopState = () => {
      const path = getPath();
      setCurrentPath(path);
      localStorage.setItem('personal-control-active-tab', path);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [getPath]);

  const navigate = useCallback((path) => {
    const cleanPath = path.replace(/^\//, '');
    if (window.location.pathname.replace(/^\//, '') !== cleanPath) {
      window.history.pushState(null, '', `/${cleanPath}`);
      setCurrentPath(cleanPath);
      localStorage.setItem('personal-control-active-tab', cleanPath);
    }
  }, []);

  return { currentPath, navigate };
}
