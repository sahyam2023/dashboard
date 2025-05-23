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

function App() {
  return (
    <BrowserRouter>
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
          <Route path="superadmin" element={<SuperAdminDashboard />} /> {/* Add SuperAdminDashboard route */}
          
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
    </BrowserRouter>
  );
}

export default App;