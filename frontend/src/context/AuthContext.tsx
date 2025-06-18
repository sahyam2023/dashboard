// src/context/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback, useRef } from 'react'; // Added useRef
import { showErrorToast } from '../utils/toastUtils'; // Added for direct toast call
import api from '../services/api'; // Ensure api is imported

interface TokenData {
  token: string;
  expiresAt: number; // Timestamp in milliseconds
  username: string;
  role: string;
  user_id: number; 
  profile_picture_url?: string | null; // Added for profile picture
}

interface AuthContextType {
  tokenData: TokenData | null;
  user: { id: number; username: string; role: string; profile_picture_url?: string | null; } | null; // Added profile_picture_url
  isAuthenticated: boolean;
  login: (token: string, username: string, role: string, user_id: number, expiresInSeconds: number, password_reset_required?: boolean, profile_picture_url?: string | null) => boolean; // Added profile_picture_url
  logout: (showSessionExpiredToast?: boolean) => void;
  updateUserProfilePictureUrl: (newUrl: string | null) => void; // Added for updating profile picture
  updateAuthUsername: (newUsername: string) => void; // Function to update username
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
  const [user, setUser] = useState<{ id: number; username: string; role: string; profile_picture_url?: string | null; } | null>(null); // Added profile_picture_url
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
  const sessionExpiredToastShownRef = useRef(false); // Added ref

  // Activity detection and token refresh state and refs
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const tokenRefreshTimer = useRef<NodeJS.Timeout | null>(null);
  const activityDebounceTimer = useRef<NodeJS.Timeout | null>(null); // For handleActivity debounce

  // Constants for timing
  const REFRESH_INTERVAL_MINUTES = 15; // Refresh before 30 min expiry
  const ACTIVITY_DEBOUNCE_MS = 500;


  // Define logout function using useCallback to ensure stable reference
  const logout = useCallback((sessionExpiredDueToTimeout: boolean = false) => {
    localStorage.removeItem('tokenData');
    setUser(null); // Added
    setTokenData(null);
    setIsPasswordResetRequired(false);
    // setSessionWarningModalOpen(false); // REMOVED: Close warning modal on logout
    
    // Clear activity and refresh timers on logout
    if (tokenRefreshTimer.current) clearTimeout(tokenRefreshTimer.current);
    if (activityDebounceTimer.current) clearTimeout(activityDebounceTimer.current);
    tokenRefreshTimer.current = null;
    activityDebounceTimer.current = null;
    console.log('AuthContext: Timers cleared on logout.');

    if (sessionExpiredDueToTimeout) {
      if (!sessionExpiredToastShownRef.current) {
        showErrorToast("Your session has expired. Please login again.");
        sessionExpiredToastShownRef.current = true;
        setTimeout(() => {
          sessionExpiredToastShownRef.current = false;
        }, 10000); // Reset after 10 seconds
      }
    }
  }, []);

  // refreshToken, scheduleNextRefresh, and handleActivity functions
  // Note: scheduleNextRefresh is defined before refreshToken in the instructions, but it depends on refreshToken.
  // So, refreshToken must be defined first or hoisted/passed correctly.
  // To adhere to useCallback dependencies, we define them in order: refreshToken -> scheduleNextRefresh -> handleActivity

  const refreshToken = useCallback(async () => {
    console.log('Attempting to refresh token...');
    try {
      const response = await api.post('/auth/refresh', {});
      if (response.data && response.data.access_token) {
        const new_access_token = response.data.access_token;
        // Update token in localStorage and context state
        // Need to update full tokenData, not just the token string, to keep expiry and user info consistent
        // For simplicity here, assuming the new token comes with its own new expiry implicitly handled by backend
        // Or, if backend only sends token, we'd need to parse it to get new expiry if it changes
        // For now, let's update the token string and assume its expiry is managed by the new value.
        // A more robust solution would involve the backend sending new expiry time or parsing the new token.

        // Get existing token data to update it, or handle if it's null
        const storedTokenDataString = localStorage.getItem('tokenData');
        if (storedTokenDataString) {
          const existingTokenData: TokenData = JSON.parse(storedTokenDataString);
          const newTokenData: TokenData = {
            ...existingTokenData,
            token: new_access_token,
            // Assuming the new token has the same expiry duration from its issuance time.
            // This needs to be confirmed with backend. If backend refreshes expiry, this is fine.
            // If backend only extends, then this calculation is fine.
            // If backend sends new absolute expiry, use that.
            // For now, we'll update token and rely on the existing expiry logic or assume new token has new default expiry.
            // Let's assume the new token has a new default expiry from its creation (30 mins)
            // We need to calculate this new expiresAt if not sent by backend.
            // For now, let's assume the context's `login` function's way of setting expiry is what we need.
            // This is a simplification: ideally, backend sends new expiresAt or token includes it.
            // Let's assume for now the refresh endpoint gives a token that's valid for REFRESH_INTERVAL_MINUTES + buffer
            // We'll just update the token string. The main useEffect will still track its original expiry.
            // This means the *displayed* expiry in UI might not update, but the token *is* new.
            // A better approach: server sends new `expires_in_seconds` or absolute `expires_at`.
            // For this implementation, we will update the token and re-schedule.
            // The existing session expiry check will still use the original `tokenData.expiresAt`.
            // This is NOT ideal. The tokenData in localStorage and state should reflect the NEW token's true expiry.
            // Let's refine this:
            // For now, to keep it simple and avoid parsing token on client:
            // Assume the new token is valid for another full default period from NOW.
            // This is a common strategy if backend doesn't send explicit new expiry.
             expiresAt: Date.now() + (30 * 60 * 1000), // Assuming new token is valid for 30 mins from now
          };
          localStorage.setItem('tokenData', JSON.stringify(newTokenData));
          setTokenData(newTokenData); // Update the full tokenData
        }

        // setToken(new_access_token); // This would be if setToken just took the string. We use setTokenData.
        console.log('Token refreshed successfully.');
        // scheduleNextRefresh(); // This will be called by refreshToken's caller or effect
      } else {
        throw new Error('No access token in refresh response');
      }
    } catch (error) {
      console.error('Failed to refresh token:', error);
      logout(true); // Pass true to indicate potential session expiry
      // No need to call scheduleNextRefresh here, as logout clears timers.
    }
  }, [logout, setTokenData]); // setTokenData is from useState, stable.


  const scheduleNextRefresh = useCallback(() => {
    if (tokenRefreshTimer.current) {
      clearTimeout(tokenRefreshTimer.current);
    }
    tokenRefreshTimer.current = setTimeout(async () => {
      await refreshToken(); // Call refresh token
      // After refreshing, schedule the next one IF refreshToken was successful (i.e., no logout)
      // Check tokenData because refreshToken might have logged out
      if (localStorage.getItem('tokenData')) { // Check if session still exists
         scheduleNextRefresh(); // Re-schedule the next refresh
      }
    }, REFRESH_INTERVAL_MINUTES * 60 * 1000);
    setLastActivity(Date.now()); // Update last activity time whenever a refresh is scheduled
    console.log(`Next token refresh scheduled in ${REFRESH_INTERVAL_MINUTES} minutes.`);
  }, [refreshToken]); // refreshToken is a dependency


  const handleActivity = useCallback(() => {
    if (activityDebounceTimer.current) {
      clearTimeout(activityDebounceTimer.current);
    }
    activityDebounceTimer.current = setTimeout(() => {
      // console.log('User activity detected, re-scheduling next refresh.'); // Log moved to useEffect initial call
      scheduleNextRefresh();
    }, ACTIVITY_DEBOUNCE_MS);
  }, [scheduleNextRefresh]);


  useEffect(() => {
    const handleApiTokenExpired = () => {
      // Check if user is currently authenticated to prevent multiple logout calls
      // if tokenData exists (which means logout hasn't fully processed yet from another trigger)
      if (tokenData) { 
        console.warn('Token invalidated event received, logging out.'); // Changed to console.warn and updated message
        logout(true); // Call logout with the flag to indicate it's a session expiry
      }
    };

    document.addEventListener('tokenInvalidated', handleApiTokenExpired);
    return () => {
      document.removeEventListener('tokenInvalidated', handleApiTokenExpired);
    };
  }, [logout, tokenData]); // Depend on logout and tokenData

  useEffect(() => {
    const storedTokenDataString = localStorage.getItem('tokenData');
    if (storedTokenDataString) {
      try {
        const parsedTokenData: TokenData = JSON.parse(storedTokenDataString);
        if (parsedTokenData) { // Ensure parsedTokenData is not null before logging
        }
        // Add explicit check for user_id existence and type
        if (parsedTokenData.expiresAt > Date.now() && 
            typeof parsedTokenData.user_id === 'number' && 
            parsedTokenData.username && 
            parsedTokenData.role) {
          setTokenData(parsedTokenData);
          setUser({ 
            id: parsedTokenData.user_id, 
            username: parsedTokenData.username, 
            role: parsedTokenData.role,
            profile_picture_url: parsedTokenData.profile_picture_url || null // Load profile picture URL
          });
        } else {
          // Token expired or invalid structure
          localStorage.removeItem('tokenData'); 
          setUser(null); 
        }
      } catch (error) {
        console.error("Failed to parse tokenData from localStorage or tokenData invalid:", error);
        localStorage.removeItem('tokenData');
        setUser(null);
      }
    }
    setIsLoading(false); // Finished initial loading
  }, []); // Runs once on mount


  // Effect for managing activity listeners and initial refresh scheduling
  useEffect(() => {
    // Use !isLoading as a proxy for isInitialized, and tokenData for token presence
    if (!isLoading && tokenData) {
      const activityEvents = ['mousemove', 'keydown', 'mousedown', 'scroll', 'click', 'keypress'];
      activityEvents.forEach(event => window.addEventListener(event, handleActivity));
      console.log('Activity listeners added. Initial refresh schedule.');

      scheduleNextRefresh(); // Initial call to start the timer

      return () => {
        activityEvents.forEach(event => window.removeEventListener(event, handleActivity));
        if (tokenRefreshTimer.current) clearTimeout(tokenRefreshTimer.current);
        if (activityDebounceTimer.current) clearTimeout(activityDebounceTimer.current); // Clear debounce timer too
        console.log('Activity listeners and refresh timer removed.');
      };
    } else {
      // No token or still loading, ensure timers are clear and no listeners are added/remain
      if (tokenRefreshTimer.current) clearTimeout(tokenRefreshTimer.current);
      if (activityDebounceTimer.current) clearTimeout(activityDebounceTimer.current);
      console.log('AuthContext: No token or not initialized, ensuring timers are clear and listeners not added.');
      return () => {}; // No listeners to remove if not added
    }
  }, [tokenData, isLoading, handleActivity, scheduleNextRefresh]);


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

  const login = (newToken: string, newUsername: string, newRole: string, newUserId: number, expiresInSeconds: number, passwordResetRequired: boolean = false, profile_picture_url?: string | null) => {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const newTokenData: TokenData = { 
      token: newToken, 
      expiresAt, 
      username: newUsername, 
      role: newRole, 
      user_id: newUserId,
      profile_picture_url: profile_picture_url || null // Store profile picture URL
    }; 
    
    localStorage.setItem('tokenData', JSON.stringify(newTokenData));

    setTokenData(newTokenData);
    setUser({ 
      id: newUserId, 
      username: newUsername, 
      role: newRole,
      profile_picture_url: profile_picture_url || null // Set profile picture URL in user state
    });
    setIsPasswordResetRequired(passwordResetRequired);
    sessionExpiredToastShownRef.current = false; 

    // Schedule first refresh after login
    console.log('Login successful, scheduling initial token refresh.');
    scheduleNextRefresh();

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

  const updateUserProfilePictureUrl = (newUrl: string | null) => {
    setUser(prevUser => {
      if (prevUser) {
        const updatedUser = { ...prevUser, profile_picture_url: newUrl };
        // Also update tokenData in localStorage if it's stored there directly
        setTokenData(prevTokenData => {
          if (prevTokenData) {
            const updatedTokenData = { ...prevTokenData, profile_picture_url: newUrl };
            localStorage.setItem('tokenData', JSON.stringify(updatedTokenData));
            return updatedTokenData;
          }
          return null;
        });
        return updatedUser;
      }
      return null;
    });
  };

  const updateAuthUsername = (newUsername: string) => {
    setUser(prevUser => {
      if (prevUser) {
        const updatedUser = { ...prevUser, username: newUsername };
        // console.log('[AuthContext] Updating user state with new username:', updatedUser); // Optional: for debugging
        return updatedUser;
      }
      return null;
    });
    setTokenData(prevTokenData => {
      if (prevTokenData) {
        const updatedTokenData = { ...prevTokenData, username: newUsername };
        localStorage.setItem('tokenData', JSON.stringify(updatedTokenData));
        // console.log('[AuthContext] Updating tokenData in state and localStorage with new username:', updatedTokenData); // Optional: for debugging
        return updatedTokenData;
      }
      return null;
    });
  };

  return (
    <AuthContext.Provider value={{ 
      tokenData,
      user, 
      isAuthenticated: !!tokenData && tokenData.expiresAt > Date.now(),
      login, 
      logout, 
      updateUserProfilePictureUrl, // Added function to context
      updateAuthUsername, // Add new function here
      isLoading,
      isAuthModalOpen,
      authModalView,
      openAuthModal,
      closeAuthModal,
      isGlobalAccessGranted,
      grantGlobalAccess,
      revokeGlobalAccess,
      isPasswordResetRequired,
      clearPasswordResetRequiredFlag,
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