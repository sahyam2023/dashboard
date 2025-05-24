import React, { useState, useEffect } from 'react';
import { fetchDashboardStats, DashboardStats, RecentActivityItem } from '../../services/api'; // Adjusted path
// import ConfirmationModal from '../../shared/ConfirmationModal'; // Not used in this update
// import Modal from '../../shared/Modal'; // Not used in this update

const AdminDashboardPage: React.FC = () => {
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true);
      try {
        const data = await fetchDashboardStats();
        setDashboardStats(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard statistics.");
        setDashboardStats(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  if (isLoading) {
    return <div className="p-4 text-center">Loading dashboard statistics...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600 bg-red-100 rounded-md">Error: {error}</div>;
  }

  return (
    <div className="container mx-auto p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-semibold text-gray-800 mb-8">Admin Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Quick Stats Card */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Quick Stats</h2>
          <p className="text-gray-600">Total Users: {dashboardStats?.total_users ?? 'N/A'}</p>
          <p className="text-gray-600">Software Titles: {dashboardStats?.total_software_titles ?? 'N/A'}</p>
        </div>

        {/* Recent Activity Card */}
        <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-2">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Recent Activity</h2>
          {dashboardStats && dashboardStats.recent_activities.length > 0 ? (
            <ul className="space-y-3 text-sm">
              {dashboardStats.recent_activities.map((activity, index) => (
                <li key={index} className="p-3 bg-gray-50 rounded-md shadow-sm">
                  <div className="font-medium text-gray-700">
                    Action: <span className="font-normal text-gray-600">{activity.action_type}</span>
                  </div>
                  {activity.username && (
                    <div className="text-gray-600">
                      User: <span className="font-normal">{activity.username}</span>
                    </div>
                  )}
                  <div className="text-gray-600">
                    Time: <span className="font-normal">{new Date(activity.timestamp).toLocaleString()}</span>
                  </div>
                  {activity.details && (
                     <div className="mt-1 text-xs text-gray-500 overflow-auto max-h-20">
                       <pre className="whitespace-pre-wrap break-all">Details: {typeof activity.details === 'object' ? JSON.stringify(activity.details, null, 2) : activity.details}</pre>
                     </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No recent activity to display.</p>
          )}
        </div>
        
        {/* Quick Links Card - Kept original structure */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Quick Links</h2>
          <ul className="space-y-2">
            <li><a href="/admin/versions" className="text-indigo-600 hover:text-indigo-800">Manage Versions</a></li>
            <li><a href="/admin/audit-logs" className="text-indigo-600 hover:text-indigo-800">View Audit Logs</a></li>
            {/* Add more admin quick links here */}
          </ul>
        </div>
      </div>
      
      {/* ConfirmationModal and Modal components are not used in this specific update,
          but kept here if they are used by other functionalities on this page. 
          If not, they can be removed from imports. */}
      {/* <ConfirmationModal isOpen={false} onClose={() => {}} onConfirm={() => {}} title="Confirm" message="Are you sure?" /> */}
      {/* <Modal isOpen={false} onClose={() => {}} title="Information"> Modal Content </Modal> */}
    </div>
  );
};

export default AdminDashboardPage;
