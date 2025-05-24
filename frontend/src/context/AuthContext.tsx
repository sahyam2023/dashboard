// src/context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

interface AuthContextType {
  token: string | null;
  username: string | null;
  role: string | null;
  isAuthenticated: boolean;
  login: (token: string, username: string, role: string) => void;
  logout: () => void;
  isLoading: boolean;
  // New properties for Auth Modal
  isAuthModalOpen: boolean;
  authModalView: 'login' | 'register';
  openAuthModal: (view: 'login' | 'register') => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));
  const [username, setUsername] = useState<string | null>(localStorage.getItem('username'));
  const [role, setRole] = useState<string | null>(localStorage.getItem('userRole'));
  const [isLoading, setIsLoading] = useState<boolean>(true); // To check initial token validity
  
  // New state for Auth Modal
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalView, setAuthModalView] = useState<'login' | 'register'>('login');


  useEffect(() => {
    // Optional: Add a check here to validate the token with the backend on initial load
    // For simplicity, we'll just trust localStorage for now.
    // If token exists, assume logged in. A backend check would be more secure.
    setIsLoading(false);
  }, []);


  const login = (newToken: string, newUsername: string, newRole: string) => { // <-- ADD ROLE PARAM
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('username', newUsername);
    localStorage.setItem('userRole', newRole); // <-- STORE ROLE
    setToken(newToken);
    setUsername(newUsername);
    setRole(newRole); // <-- SET ROLE
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole'); // <-- REMOVE ROLE
    setToken(null);
    setUsername(null);
    setRole(null); // <-- CLEAR ROLE
  };

  // New functions for Auth Modal
  const openAuthModal = (view: 'login' | 'register') => {
    setAuthModalView(view);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider value={{ 
      token, 
      username, 
      role, 
      isAuthenticated: !!token, 
      login, 
      logout, 
      isLoading,
      // Provide modal state and functions
      isAuthModalOpen,
      authModalView,
      openAuthModal,
      closeAuthModal
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};