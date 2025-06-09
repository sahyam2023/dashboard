import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';

interface ThemeContextType {
  themeMode: 'light' | 'dark';
  toggleThemeMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const storedPreference = localStorage.getItem('themeMode');
    return (storedPreference === 'dark' || storedPreference === 'light') ? storedPreference : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('themeMode', themeMode);
    // Add/remove 'dark' class on the html element
    const root = window.document.documentElement;
    root.classList.remove(themeMode === 'light' ? 'dark' : 'light');
    root.classList.add(themeMode);
  }, [themeMode]);

  const toggleThemeMode = () => {
    setThemeMode(prevMode => (prevMode === 'light' ? 'dark' : 'light'));
  };
  
  // useMemo is used here to prevent unnecessary re-renders of consumers
  // if the context value object itself was recreated on every render of the provider.
  // In this specific case, since themeMode is a direct dependency and toggleThemeMode is stable,
  // it might not provide a huge benefit over just { themeMode, toggleThemeMode } directly,
  // but it's good practice for contexts providing objects.
  const contextValue = useMemo(() => ({ themeMode, toggleThemeMode }), [themeMode, toggleThemeMode]);


  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeContextProvider');
  }
  return context;
};
