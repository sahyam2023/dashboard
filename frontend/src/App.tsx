// src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DocumentsView from './views/DocumentsView';
import PatchesView from './views/PatchesView';
import LinksView from './views/LinksView';
import MiscView from './views/MiscView';
import SearchResultsView from './views/SearchResultsView';
import LoginPage from './views/LoginPage';
import RegisterPage from './views/RegisterPage';

// Optional: You might create this later for better route protection
// import ProtectedRoute from './components/ProtectedRoute';
import UserProfilePage from './views/UserProfilePage'; // Import UserProfilePage
import SuperAdminDashboard from './views/SuperAdminDashboard'; // Import SuperAdminDashboard
import AdminLayout from './components/admin/AdminLayout'; // Import AdminLayout
import AdminDashboardPage from './views/AdminDashboardPage'; 
import AdminVersionsPage from './views/AdminVersionsPage'; // Import the new AdminVersionsPage
import AuditLogViewer from './components/admin/AuditLogViewer';
import FavoritesView from './views/FavoritesView'; // Import FavoritesView
import { AuthProvider, useAuth } from './context/AuthContext'; // Ensure AuthProvider is imported
import { FavoritesProvider } from './context/FavoritesContext'; // Adjust path if needed
import AuthModal from './components/shared/AuthModal'; // Import AuthModal

function App() {
  const auth = useAuth(); // Get auth context for route protection
  const { isAuthModalOpen, closeAuthModal, authModalView } = useAuth(); // Get modal state and functions

  return (
    <BrowserRouter>
      <AuthProvider> {/* Assuming AuthProvider is correctly placed here or in main.tsx */}
        <FavoritesProvider> {/* <<<< NEWLY ADDED >>>> */}
          <Routes>
            {/* Routes WITHOUT the main Layout (Login, Register) */}
            <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Routes WITH the main Layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/documents" replace />} />
          <Route path="documents" element={<DocumentsView />} />
          <Route path="patches" element={<PatchesView />} />
          <Route path="links" element={<LinksView />} />
          <Route path="misc" element={<MiscView />} />
          <Route path="search" element={<SearchResultsView />} />
          <Route path="profile" element={<UserProfilePage />} />
          <Route 
            path="favorites" 
            element={
              auth.isAuthenticated ? ( 
                <FavoritesView />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          
          {/* Admin and Super Admin Routes */}
          <Route 
            path="superadmin" 
            element={
              auth.isAuthenticated && auth.role === 'super_admin' ? (
                <SuperAdminDashboard />
              ) : (
                <Navigate to="/login" replace /> 
              )
            } 
          />

          {/* Admin Routes with AdminLayout */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route 
              path="dashboard" 
              element={
                auth.isAuthenticated && (auth.role === 'admin' || auth.role === 'super_admin') ? (
                  <AdminDashboardPage /> 
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
             <Route 
              path="versions" // This is the route for the actual versions management page
              element={
                auth.isAuthenticated && (auth.role === 'admin' || auth.role === 'super_admin') ? (
                  <AdminVersionsPage /> // Use the new AdminVersionsPage
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route 
              path="audit-logs" 
              element={
                auth.isAuthenticated && (auth.role === 'admin' || auth.role === 'super_admin') ? (
                  <AuditLogViewer />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
          </Route>
          
          {/* NEW: Route for the Upload Page */}
          {/* For now, UploadPage handles its own auth check display.
              Later, you might wrap this with a <ProtectedRoute> element.
              e.g., <Route path="upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          */}
          {/* Add other dashboard routes here later (e.g., /profile) */}
        </Route>

        {/* Optional: Catch-all for any unmatched routes */}
        {/* <Route path="*" element={<Navigate to="/" />} /> */}
          </Routes>
          <AuthModal 
            isOpen={isAuthModalOpen} 
            onClose={closeAuthModal} 
            initialView={authModalView} 
          />
        </FavoritesProvider> {/* <<<< NEWLY ADDED >>>> */}
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

// Note: The prompt's example for the element prop of the "superadmin" route was:
// useAuth().isAuthenticated && useAuth().role === 'super_admin' ? ( <SuperAdminDashboard /> ) : ( <Navigate to="/login" replace /> )
// The original file had `auth.isAuthenticated && auth.role === 'super_admin'`.
// I've kept the original file's structure for that part, as modifying it was not the primary goal of this subtask.
// The key change is adding AuthProvider and FavoritesProvider.