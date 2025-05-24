// src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'; // Import useLocation
import Layout from './components/Layout';
import DocumentsView from './views/DocumentsView';
import PatchesView from './views/PatchesView';
import LinksView from './views/LinksView';
import MiscView from './views/MiscView';
import SearchResultsView from './views/SearchResultsView';
import LoginPage from './views/LoginPage';
import RegisterPage from './views/RegisterPage';
import FavoritesView from './views/FavoritesView'; // Added FavoritesView

// Optional: You might create this later for better route protection
// import ProtectedRoute from './components/ProtectedRoute';
import UserProfilePage from './views/UserProfilePage'; // Import UserProfilePage
import SuperAdminDashboard from './views/SuperAdminDashboard'; // Import SuperAdminDashboard
import AdminLayout from './components/admin/AdminLayout'; // Import AdminLayout
import AdminDashboardPage from './views/AdminDashboardPage'; 
import AdminVersionsPage from './views/AdminVersionsPage'; // Import the new AdminVersionsPage
import AuditLogViewer from './components/admin/AuditLogViewer'; 
import { useAuth } from './context/AuthContext'; 
import AuthModal from './components/shared/AuthModal'; // Import AuthModal
import GlobalLoginPage from './views/GlobalLoginPage'; // Import GlobalLoginPage
import ForgotPasswordPage from './views/ForgotPasswordPage'; // Added Forgot Password Route
import ForcedPasswordChangePage from './views/ForcedPasswordChangePage'; // Import ForcedPasswordChangePage


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
    isPasswordResetRequired // Use this from auth context
  } = auth;

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
      <Routes>
        {/* Publicly accessible routes (even if not authenticated, but after global access) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        
        {/* Forced password change route - accessible only if authenticated and flag is set (handled by redirect logic) 
            OR if directly navigated to while authenticated.
        */}
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
          
          {/* Admin and Super Admin Routes - protected by role check within Layout/component or here */}
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
        
        {/* Catch-all for authenticated users if no other route matches */}
        {isAuthenticated && <Route path="*" element={<Navigate to="/documents" replace />} />}
        
        {/* If not authenticated and no public route matched, show login or a specific 404 */}
        {/* This specific catch-all might be too broad if /login etc. are not matched above for some reason */}
        {!isAuthenticated && <Route path="*" element={<Navigate to="/login" replace />} />}

      </Routes>
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={closeAuthModal} 
        initialView={authModalView} 
      />
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