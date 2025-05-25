// src/App.tsx
import React, { useEffect, Suspense, lazy } from 'react'; // Added Suspense, lazy
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { showErrorToast } from './utils/toastUtils'; 
import 'react-toastify/dist/ReactToastify.css';
import Layout from './components/Layout';
import LoadingState from './components/LoadingState'; // For Suspense fallback

// Static imports for auth-flow pages and core layouts
import LoginPage from './views/LoginPage';
import RegisterPage from './views/RegisterPage';
import GlobalLoginPage from './views/GlobalLoginPage'; 
import ForgotPasswordPage from './views/ForgotPasswordPage'; 
import ForcedPasswordChangePage from './views/ForcedPasswordChangePage'; 
import AdminLayout from './components/admin/AdminLayout'; 

// Lazy loaded views
const DocumentsView = lazy(() => import('./views/DocumentsView'));
const PatchesView = lazy(() => import('./views/PatchesView'));
const LinksView = lazy(() => import('./views/LinksView'));
const MiscView = lazy(() => import('./views/MiscView'));
const SearchResultsView = lazy(() => import('./views/SearchResultsView'));
const UserProfilePage = lazy(() => import('./views/UserProfilePage'));
const FavoritesView = lazy(() => import('./views/FavoritesView'));
const SuperAdminDashboard = lazy(() => import('./views/SuperAdminDashboard'));
const AdminDashboardPage = lazy(() => import('./views/AdminDashboardPage'));
const AdminVersionsPage = lazy(() => import('./views/AdminVersionsPage'));
const AuditLogViewer = lazy(() => import('./components/admin/AuditLogViewer')); // Path is components/admin

import { useAuth } from './context/AuthContext'; 
import AuthModal from './components/shared/AuthModal'; 
// import SessionTimeoutWarningModal from './components/shared/SessionTimeoutWarningModal'; // Removed import


// We need to wrap the main logic in a component that can use useLocation
function AppContent() {
  const auth = useAuth();
  const location = useLocation();
  const { 
    isAuthModalOpen, 
    closeAuthModal, 
    authModalView, 
    isGlobalAccessGranted, 
    isAuthenticated, // Use this from auth context
    isPasswordResetRequired, // Use this from auth context
    isLoading, // Added isLoading
    logout // Destructure logout to use in event handler
  } = auth;

  useEffect(() => {
    const handleTokenExpiredEvent = () => {
      // Check if the user is currently authenticated according to the context
      // This prevents showing the toast if the user was already logged out
      // or if the event fires multiple times during the logout process.
      if (auth.isAuthenticated) { 
        showErrorToast("Your session has expired. Please login again.");
        // Logout is already called by AuthContext's own event listener.
        // No need to call auth.logout() here again, as that's now handled within AuthContext.
        // The navigation to /login will be handled by the routing logic below
        // when isAuthenticated becomes false.
      }
    };

    document.addEventListener('tokenExpired', handleTokenExpiredEvent);
    return () => {
      document.removeEventListener('tokenExpired', handleTokenExpiredEvent);
    };
  }, [auth.isAuthenticated, auth]); // Depend on isAuthenticated and the auth object (which includes logout)

  // NEW: Add this loading check
  if (auth.isLoading) {
    return <LoadingState message="Authenticating..." />;
  }

  if (!isGlobalAccessGranted) {
    // If global access is not granted, only show the GlobalLoginPage
    // The <Routes> and <Route path="*"> ensure it's the only thing rendered.
    return <GlobalLoginPage />;
  }

  // If authenticated and password reset is required, and not already on the reset page
  if (isAuthenticated && isPasswordResetRequired && location.pathname !== "/force-change-password") {
    return <Navigate to="/force-change-password" replace />;
  }

  // If not authenticated and trying to access a path other than public paths, redirect to login.
  // This is a basic blanket redirect. More granular protected routes can be implemented.
  const publicPaths = ["/login", "/register", "/forgot-password", "/force-change-password"];
  if (!isAuthenticated && !publicPaths.includes(location.pathname)) {
    // Allow access to global login page if not authenticated
    if (location.pathname !== "/" && !isGlobalAccessGranted) { // Assuming '/' might redirect or be a public landing
         // This case is mostly covered by the initial isGlobalAccessGranted check,
         // but kept for clarity if routes were structured differently.
    } else if (location.pathname !== "/login") { // Avoid redirect loop for /login itself
        // return <Navigate to="/login" replace />; // Commented out to allow public access to /login, /register, /forgot-password
    }
  }


  return (
    <> {/* Use Fragment instead of BrowserRouter here, as it's already provided by App */}
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored" // Using 'colored' theme for better visual distinction of success/error
      />
      <Suspense fallback={<LoadingState message="Loading page..." />}>
        <Routes>
          {/* Publicly accessible routes (even if not authenticated, but after global access) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          
          <Route 
              path="/force-change-password" 
              element={isAuthenticated ? <ForcedPasswordChangePage /> : <Navigate to="/login" replace />} 
          />

          {/* Routes requiring authentication and using the main Layout */}
          <Route path="/" element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}>
            <Route index element={<Navigate to="/documents" replace />} />
            <Route path="documents" element={<DocumentsView />} />
            <Route path="patches" element={<PatchesView />} />
            <Route path="links" element={<LinksView />} />
            <Route path="misc" element={<MiscView />} />
            <Route path="search" element={<SearchResultsView />} />
            <Route path="profile" element={<UserProfilePage />} />
            <Route path="favorites" element={<FavoritesView />} />
            
            <Route 
              path="superadmin" 
              element={auth.role === 'super_admin' ? <SuperAdminDashboard /> : <Navigate to="/documents" replace />} 
            />
            <Route 
              path="/admin" 
              element={(auth.role === 'admin' || auth.role === 'super_admin') ? <AdminLayout /> : <Navigate to="/documents" replace />}
            >
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="versions" element={<AdminVersionsPage />} />
              <Route path="audit-logs" element={<AuditLogViewer />} />
              {/* Add other admin routes here */}
            </Route>
          </Route>
          
          {isAuthenticated && <Route path="*" element={<Navigate to="/documents" replace />} />}
          {!isAuthenticated && <Route path="*" element={<Navigate to="/login" replace />} />}

        </Routes>
      </Suspense>
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={closeAuthModal} 
        initialView={authModalView} 
      />
      {/* <SessionTimeoutWarningModal /> */} {/* Removed Session Timeout Warning Modal here */}
    </>
  );
}

// Main App component now just sets up BrowserRouter
function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;