//src/app.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DocumentsView from './views/DocumentsView';
import PatchesView from './views/PatchesView';
import LinksView from './views/LinksView';
import MiscView from './views/MiscView';
import SearchResultsView from './views/SearchResultsView';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/documents" replace />} />
          <Route path="documents" element={<DocumentsView />} />
          <Route path="patches" element={<PatchesView />} />
          <Route path="links" element={<LinksView />} />
          <Route path="misc" element={<MiscView />} />
          <Route path="search" element={<SearchResultsView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;