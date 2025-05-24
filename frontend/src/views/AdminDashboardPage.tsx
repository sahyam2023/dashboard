import React, { useState, useEffect } from 'react';
import { 
  fetchDashboardStats, 
  DashboardStats, 
  RecentActivityItem, 
  RecentAdditionItem, 
  PopularDownloadItem, 
  DocumentsPerSoftwareItem 
} from '../services/api'; // Corrected import for RecentActivityItem and added others
import DocumentsPerSoftwareChart from '../components/admin/DocumentsPerSoftwareChart';
import PopularDownloadsChart from '../components/admin/PopularDownloadsChart';
import UserActivityTrendsChart from '../components/admin/UserActivityTrendsChart';
import StorageUtilizationWidget from '../components/admin/StorageUtilizationWidget';
import DownloadTrendsChart from '../components/admin/DownloadTrendsChart';
import ContentHealthWidget from '../components/admin/ContentHealthWidget';

const AdminDashboardPage: React.FC = () => {
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper to format date string
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };
  
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
        <div className="bg-white p-6 rounded-lg shadow-md lg:col-span-1">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Quick Stats</h2>
          <p className="text-gray-600">Total Users: {dashboardStats?.total_users ?? 'N/A'}</p>
          <p className="text-gray-600">Software Titles: {dashboardStats?.total_software_titles ?? 'N/A'}</p>
        </div>

        {/* Storage Utilization Card */}
        <div className="bg-white p-6 rounded-lg shadow-md lg:col-span-1">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Storage Utilization</h2>
          <StorageUtilizationWidget />
        </div>
        
        {/* Recent Additions Card - Moved up to share row */}
        <div className="bg-white p-6 rounded-lg shadow-md lg:col-span-1">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Recent Additions</h2>
          {dashboardStats && dashboardStats.recent_additions && dashboardStats.recent_additions.length > 0 ? (
            <ul className="space-y-3 text-sm">
              {dashboardStats.recent_additions.map((item: RecentAdditionItem, index: number) => (
                <li key={item.id || index} className="p-3 bg-gray-50 rounded-md shadow-sm"> {/* Use item.id if available for key */}
                  <div className="font-medium text-gray-700">
                    {item.name} <span className="text-xs text-indigo-500">({item.type})</span>
                  </div>
                  <div className="text-gray-500 text-xs">
                    Added: {formatDate(item.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No recent additions to display.</p>
          )}
        </div>

        {/* Recent Activity Card - Spans 3 columns on larger screens */}
        <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-2 lg:col-span-3">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Recent Activity</h2>
          {dashboardStats && dashboardStats.recent_activities && dashboardStats.recent_activities.length > 0 ? (
            <ul className="space-y-3 text-sm">
              {dashboardStats.recent_activities.map((activity: RecentActivityItem, index: number) => (
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
                    Time: <span className="font-normal">{formatDate(activity.timestamp)}</span>
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
                
        {/* Top 5 Downloads Card */}
        <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-1 lg:col-span-1"> {/* Adjusted lg:col-span */}
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Top 5 Downloads</h2>
          {dashboardStats && dashboardStats.popular_downloads && dashboardStats.popular_downloads.length > 0 ? (
            <PopularDownloadsChart data={dashboardStats.popular_downloads} />
          ) : (
            <p className="text-gray-500">No download data to display.</p>
          )}
        </div>

        {/* Documents per Software Card */}
        <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-1 lg:col-span-2"> {/* Adjusted lg:col-span to fill row with Top 5 */}
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Documents per Software</h2>
          {dashboardStats && dashboardStats.documents_per_software && dashboardStats.documents_per_software.length > 0 ? (
            <DocumentsPerSoftwareChart data={dashboardStats.documents_per_software} />
          ) : (
            <p className="text-gray-500">No document count data available.</p>
          )}
        </div>

        {/* User Activity Trends Card - Spans 3 columns */}
        <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-2 lg:col-span-3">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">User Activity Trends (Last 7 Days)</h2>
          <UserActivityTrendsChart />
        </div>

        {/* Download Trends Card - Spans 3 columns */}
        <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-2 lg:col-span-3">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Download Trends (Last 10 Days)</h2>
          <DownloadTrendsChart />
        </div>

        {/* Content Health Widget Card - Spans 3 columns */}
        <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-2 lg:col-span-3">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Content Health Indicators</h2>
          <ContentHealthWidget />
        </div>

        {/* Quick Links Card - Adjusted to fit new layout if necessary, or keep as is */}
        <div className="bg-white p-6 rounded-lg shadow-md col-span-1 md:col-span-3"> {/* Example: making it full width if other cards take up rows */}
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Quick Links</h2>
          <ul className="space-y-2">
            <li><a href="/admin/versions" className="text-indigo-600 hover:text-indigo-800">Manage Versions</a></li>
            <li><a href="/admin/audit-logs" className="text-indigo-600 hover:text-indigo-800">View Audit Logs</a></li>
            <li><a href="/admin/users" className="text-indigo-600 hover:text-indigo-800">Manage Users (Super Admin)</a></li>
            {/* Add more admin quick links here */}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
