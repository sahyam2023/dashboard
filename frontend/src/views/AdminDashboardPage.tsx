import React, { useState, useCallback, useEffect } from 'react';
import React, { useState } from 'react'; // Removed useCallback, useEffect for now, will add back if needed for dashboard features
// import AdminVersionsTable from './AdminVersionsTable'; // Specific to versions, remove or replace
// import AdminVersionForm from './AdminVersionForm'; // Specific to versions, remove or replace
// import { AdminSoftwareVersion, Software } from '../../../services/api'; // Specific to versions
// import { deleteAdminVersion, fetchSoftware } from '../../../services/api'; // Specific to versions
import ConfirmationModal from '../../shared/ConfirmationModal'; // May be used for other actions
import Modal from '../../shared/Modal'; // Generic Modal

// Placeholder for potential dashboard-specific data or types
// interface DashboardSummary {
//   totalUsers: number;
//   totalSoftware: number;
//   recentActivity: any[];
// }

const AdminDashboardPage: React.FC = () => {
  // State for dashboard elements, e.g., summary data, quick links, etc.
  // const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Example, can be used if fetching dashboard data
  const [error, setError] = useState<string | null>(null);  // Example

  // For now, the dashboard will be simple. Features can be added later.
  // If we re-introduce version management here, we'll need the related states:
  // const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  // const [editingVersion, setEditingVersion] = useState<AdminSoftwareVersion | null>(null);
  // const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // If needed for dashboard actions
  // const [itemToDelete, setItemToDelete] = useState<number | null>(null); // Generic item
  // const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);


  // Placeholder for dashboard content
  // useEffect(() => {
  //   const fetchDashboardData = async () => {
  //     setIsLoading(true);
  //     try {
  //       // const data = await getDashboardSummary(); // Example API call
  //       // setSummary(data);
  //     } catch (err: any) {
  //       setError(err.message || "Failed to load dashboard data.");
  //     } finally {
  //       setIsLoading(false);
  //     }
  //   };
  //   fetchDashboardData();
  // }, []);

  if (isLoading) {
    return <div className="p-4 text-center">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600 bg-red-100 rounded-md">Error: {error}</div>;
  }

  return (
    <div className="container mx-auto p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-semibold text-gray-800 mb-8">Admin Dashboard</h1>

      {/* {feedbackMessage && (
        <div className={`p-4 mb-4 text-sm rounded-lg ${feedbackMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} role="alert">
          {feedbackMessage.message}
        </div>
      )} */}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Example Dashboard Widgets/Cards */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Quick Stats</h2>
          <p className="text-gray-600">Total Users: {/* summary?.totalUsers ?? 'N/A' */ 'N/A'}</p>
          <p className="text-gray-600">Software Titles: {/* summary?.totalSoftware ?? 'N/A' */ 'N/A'}</p>
          {/* Add more stats here */}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Recent Activity</h2>
          {/* Render recent activity items here, e.g., summary?.recentActivity.map(...) */}
          <p className="text-gray-500">No recent activity to display.</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Quick Links</h2>
          <ul className="space-y-2">
            <li><a href="/admin/versions" className="text-indigo-600 hover:text-indigo-800">Manage Versions</a></li>
            <li><a href="/admin/audit-logs" className="text-indigo-600 hover:text-indigo-800">View Audit Logs</a></li>
            {/* Add more admin quick links here */}
          </ul>
        </div>
      </div>

      {/* Modals for actions can be defined here if needed */}
      {/* e.g., <ConfirmationModal isOpen={showDeleteConfirm} ... /> */}
    </div>
  );
};

export default AdminDashboardPage;
