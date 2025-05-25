// src/context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

interface AuthContextType {
  token: string | null;
  username: string | null;
  role: string | null;
  isAuthenticated: boolean;
  login: (token: string, username: string, role: string, password_reset_required?: boolean) => boolean; // Returns boolean
  logout: () => void;
  isLoading: boolean;
  // New properties for Auth Modal
  isAuthModalOpen: boolean;
  authModalView: 'login' | 'register';
  openAuthModal: (view: 'login' | 'register') => void;
  closeAuthModal: () => void;
  // For Global Access
  isGlobalAccessGranted: boolean;
  grantGlobalAccess: () => void;
  revokeGlobalAccess: () => void; 
  // For Forced Password Reset
  isPasswordResetRequired: boolean;
  clearPasswordResetRequiredFlag: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));
  const [username, setUsername] = useState<string | null>(localStorage.getItem('username'));
  const [role, setRole] = useState<string | null>(localStorage.getItem('userRole'));
  const [isLoading, setIsLoading] = useState<boolean>(true); 
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalView, setAuthModalView] = useState<'login' | 'register'>('login');

  // Helper function for initializing global access state
  const initialGlobalAccess = () => {
    const twoHoursInMs = 2 * 60 * 60 * 1000;
    const flag = localStorage.getItem('globalAccessFlag');
    const timestampStr = localStorage.getItem('globalAccessTimestamp');
    if (flag === 'true' && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      if (Date.now() - timestamp < twoHoursInMs) {
        return true;
      } else {
        // Expired
        localStorage.removeItem('globalAccessFlag');
        localStorage.removeItem('globalAccessTimestamp');
        return false;
      }
    }
    return false;
  };

  const [isGlobalAccessGranted, setIsGlobalAccessGranted] = useState<boolean>(initialGlobalAccess);

  // Forced Password Reset State
  const [isPasswordResetRequired, setIsPasswordResetRequired] = useState<boolean>(false);


  useEffect(() => {
    // Optional: Add a check here to validate the token with the backend on initial load
    // For simplicity, we'll just trust localStorage for now.
    // If token exists, assume logged in. A backend check would be more secure.
    setIsLoading(false);
  }, []);


  const login = (newToken: string, newUsername: string, newRole: string, passwordResetRequired: boolean = false) => {
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('username', newUsername);
    localStorage.setItem('userRole', newRole);
    setToken(newToken);
    setUsername(newUsername);
    setRole(newRole);
    setIsPasswordResetRequired(passwordResetRequired);
    return passwordResetRequired; // Return the flag
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    setToken(null);
    setUsername(null);
    setRole(null);
    setIsPasswordResetRequired(false); // Clear flag on logout
    // Also revoke global access on regular logout for full security,
    // or manage separately if global access should persist across user sessions.
    // For now, let's assume global access is also session-bound or needs re-entry.
    // revokeGlobalAccess(); // Removed as per requirement
  };

  const clearPasswordResetRequiredFlag = () => {
    setIsPasswordResetRequired(false);
  };

  // Global Access Functions
  const grantGlobalAccess = () => {
    localStorage.setItem('globalAccessFlag', 'true');
    localStorage.setItem('globalAccessTimestamp', Date.now().toString());
    setIsGlobalAccessGranted(true);
  };

  const revokeGlobalAccess = () => {
    localStorage.removeItem('globalAccessFlag');
    localStorage.removeItem('globalAccessTimestamp');
    setIsGlobalAccessGranted(false);
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
      closeAuthModal,
      // Provide global access state and functions
      isGlobalAccessGranted,
      grantGlobalAccess,
      revokeGlobalAccess,
      // Provide forced password reset state and functions
      isPasswordResetRequired,
      clearPasswordResetRequiredFlag
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