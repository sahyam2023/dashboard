// src/context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';

interface TokenData {
  token: string;
  expiresAt: number; // Timestamp in milliseconds
  username: string;
  role: string;
  user_id: number; // Added
}

interface AuthContextType {
  tokenData: TokenData | null;
  user: { id: number; username: string; role: string; } | null; // Added
  isAuthenticated: boolean;
  login: (token: string, username: string, role: string, user_id: number, expiresInSeconds: number, password_reset_required?: boolean) => boolean; // Added user_id
  logout: (showSessionExpiredToast?: boolean) => void;
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
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [user, setUser] = useState<{ id: number; username: string; role: string; } | null>(null); // Added
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

  // Define logout function using useCallback to ensure stable reference
  const logout = useCallback((sessionExpiredDueToTimeout: boolean = false) => {
    localStorage.removeItem('tokenData');
    setUser(null); // Added
    setTokenData(null);
    setIsPasswordResetRequired(false);
    // setSessionWarningModalOpen(false); // REMOVED: Close warning modal on logout
    
    if (sessionExpiredDueToTimeout) {
        // Dispatch the event so App.tsx can show the toast.
        document.dispatchEvent(new CustomEvent('tokenExpired'));
    }
  }, []);

  useEffect(() => {
    const storedTokenDataString = localStorage.getItem('tokenData');
    if (storedTokenDataString) {
      try {
        const parsedTokenData: TokenData = JSON.parse(storedTokenDataString);
        // Add explicit check for user_id existence and type
        if (parsedTokenData.expiresAt > Date.now() && 
            typeof parsedTokenData.user_id === 'number' && 
            parsedTokenData.username && 
            parsedTokenData.role) {
          setTokenData(parsedTokenData);
          setUser({ id: parsedTokenData.user_id, username: parsedTokenData.username, role: parsedTokenData.role });
        } else {
          // If token is expired or user_id is missing/invalid, treat as invalid tokenData
          localStorage.removeItem('tokenData'); 
          setUser(null); 
          // Optionally call logout() if it handles other necessary cleanup
          // logout(true); // if you want to show session expired toast for this case too
        }
      } catch (error) {
        console.error("Failed to parse tokenData from localStorage or tokenData invalid:", error);
        localStorage.removeItem('tokenData');
        setUser(null);
      }
    }
    setIsLoading(false);
  }, []);

  // Listen for maintenance mode forced logout event
  useEffect(() => {
    const handleMaintenanceLogout = (event: Event) => {
      // The toast message will be handled by App.tsx listening to the same event.
      // We just need to ensure the user is logged out from the context.
      const customEvent = event as CustomEvent<{ message?: string }>; // Message is optional here
      console.log('AuthContext: maintenanceModeForcedLogout event received.', customEvent.detail);
      logout(); // Call existing logout, no toast message needed from here.
    };

    document.addEventListener('maintenanceModeForcedLogout', handleMaintenanceLogout);
    return () => {
      document.removeEventListener('maintenanceModeForcedLogout', handleMaintenanceLogout);
    };
  }, [logout]); // logout is now stable due to useCallback

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
  }, [tokenData, logout]); // Added logout to dependencies since it's used in the effect

  const login = (newToken: string, newUsername: string, newRole: string, newUserId: number, expiresInSeconds: number, passwordResetRequired: boolean = false) => {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const newTokenData: TokenData = { token: newToken, expiresAt, username: newUsername, role: newRole, user_id: newUserId }; // Added user_id
    
    localStorage.setItem('tokenData', JSON.stringify(newTokenData));

    setTokenData(newTokenData);
    setUser({ id: newUserId, username: newUsername, role: newRole }); // Added
    setIsPasswordResetRequired(passwordResetRequired);
    // setSessionWarningModalOpen(false); // REMOVED: Ensure warning modal is closed on new login
    return passwordResetRequired;
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
      tokenData,
      user, // Added
      isAuthenticated: !!tokenData && tokenData.expiresAt > Date.now(),
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