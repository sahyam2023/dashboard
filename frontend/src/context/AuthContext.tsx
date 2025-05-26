// src/context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

interface TokenData {
  token: string;
  expiresAt: number; // Timestamp in milliseconds
  username: string;
  role: string;
}

interface AuthContextType {
  tokenData: TokenData | null; // Changed from token: string | null
  username: string | null; // Kept for quick access, though also in tokenData
  role: string | null; // Kept for quick access, though also in tokenData
  isAuthenticated: boolean;
  login: (token: string, username: string, role: string, expiresInSeconds: number, password_reset_required?: boolean) => boolean; // Added expiresInSeconds
  logout: (showSessionExpiredToast?: boolean) => void; // Added optional param
  isLoading: boolean;
  isAuthModalOpen: boolean;
  authModalView: 'login' | 'register';
  openAuthModal: (view: 'login' | 'register') => void;
  closeAuthModal: () => void;
  isGlobalAccessGranted: boolean;
  grantGlobalAccess: () => void;
  revokeGlobalAccess: () => void; 
  isPasswordResetRequired: boolean;
  clearPasswordResetRequiredFlag: () => void;
  // Session Timeout Warning - REMOVED
  // isSessionWarningModalOpen: boolean;
  // setSessionWarningModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // sessionWarningCountdown: number;
  // refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// REMOVED const PLACEHOLDER_SESSION_DURATION_SECONDS = 15 * 60; // 15 minutes
// REMOVED const WARNING_THRESHOLD_SECONDS = 2 * 60; // Show warning 2 minutes before expiry

export const AuthProvider: React.FC<{children: ReactNode}> = ({ children }) => {
  // const [token, setToken] = useState<string | null>(localStorage.getItem('authToken')); // Replaced by tokenData
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [username, setUsername] = useState<string | null>(localStorage.getItem('username')); // Still useful for quick display
  const [role, setRole] = useState<string | null>(localStorage.getItem('userRole')); // Still useful for quick display
  const [isLoading, setIsLoading] = useState<boolean>(true); 
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalView, setAuthModalView] = useState<'login' | 'register'>('login');

  // Session Timeout Warning State - REMOVED
  // const [isSessionWarningModalOpen, setSessionWarningModalOpen] = useState(false);
  // const [sessionWarningCountdown, setSessionWarningCountdown] = useState(WARNING_THRESHOLD_SECONDS);


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
        localStorage.removeItem('globalAccessFlag');
        localStorage.removeItem('globalAccessTimestamp');
        return false;
      }
    }
    return false;
  };

  const [isGlobalAccessGranted, setIsGlobalAccessGranted] = useState<boolean>(initialGlobalAccess);
  const [isPasswordResetRequired, setIsPasswordResetRequired] = useState<boolean>(false);

  useEffect(() => {
    const storedTokenDataString = localStorage.getItem('tokenData');
    if (storedTokenDataString) {
      try {
        const parsedTokenData: TokenData = JSON.parse(storedTokenDataString);
        if (parsedTokenData.expiresAt > Date.now()) {
          setTokenData(parsedTokenData);
          setUsername(parsedTokenData.username); // Keep username/role in sync
          setRole(parsedTokenData.role);
        } else {
          localStorage.removeItem('tokenData'); // Expired
          localStorage.removeItem('username');
          localStorage.removeItem('userRole');
        }
      } catch (error) {
        console.error("Failed to parse tokenData from localStorage", error);
        localStorage.removeItem('tokenData');
        localStorage.removeItem('username');
        localStorage.removeItem('userRole');
      }
    }
    setIsLoading(false);
  }, []);


  useEffect(() => {
    if (!tokenData) {
      // setSessionWarningModalOpen(false); // REMOVED
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const timeLeftSeconds = Math.floor((tokenData.expiresAt - now) / 1000);

      if (timeLeftSeconds <= 0) {
        clearInterval(interval);
        logout(true); // Pass true to indicate session expired naturally for potential specific toast
        return;
      }

      // REMOVED logic for WARNING_THRESHOLD_SECONDS
      // if (timeLeftSeconds <= WARNING_THRESHOLD_SECONDS) {
      //   if (!isSessionWarningModalOpen) setSessionWarningModalOpen(true);
      //   setSessionWarningCountdown(timeLeftSeconds);
      // } else {
      //   // If modal was open but session was refreshed (time > threshold), close it.
      //   if (isSessionWarningModalOpen) setSessionWarningModalOpen(false);
      // }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [tokenData]); // REMOVED isSessionWarningModalOpen from dependencies

  const login = (newToken: string, newUsername: string, newRole: string, expiresInSeconds: number, passwordResetRequired: boolean = false) => {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const newTokenData: TokenData = { token: newToken, expiresAt, username: newUsername, role: newRole };
    
    localStorage.setItem('tokenData', JSON.stringify(newTokenData));
    localStorage.setItem('username', newUsername); // For simpler access elsewhere if needed
    localStorage.setItem('userRole', newRole);     // For simpler access elsewhere if needed

    setTokenData(newTokenData);
    setUsername(newUsername);
    setRole(newRole);
    setIsPasswordResetRequired(passwordResetRequired);
    // setSessionWarningModalOpen(false); // REMOVED: Ensure warning modal is closed on new login
    return passwordResetRequired;
  };

  const logout = (sessionExpiredDueToTimeout: boolean = false) => {
    localStorage.removeItem('tokenData');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    setTokenData(null);
    setUsername(null);
    setRole(null);
    setIsPasswordResetRequired(false);
    // setSessionWarningModalOpen(false); // REMOVED: Close warning modal on logout
    
    if (sessionExpiredDueToTimeout) {
        // Dispatch the event so App.tsx can show the toast.
        document.dispatchEvent(new CustomEvent('tokenExpired'));
    }
  };
  
  // REMOVED refreshSession function
  // const refreshSession = async () => { ... };

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
      tokenData, // Changed key 'token' to 'tokenData' and assigned the tokenData state variable
      username, 
      role, 
      isAuthenticated: !!tokenData && tokenData.expiresAt > Date.now(), // Corrected isAuthenticated logic
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
      clearPasswordResetRequiredFlag,
      // Session Timeout Warning - REMOVED
      // isSessionWarningModalOpen,
      // setSessionWarningModalOpen,
      // sessionWarningCountdown,
      // refreshSession,
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