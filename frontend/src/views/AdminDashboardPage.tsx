import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { 
  fetchDashboardStats, DashboardStats, RecentActivityItem, PopularDownloadItem, DocumentsPerSoftwareItem, RecentAdditionItem,
  fetchSystemHealth, SystemHealth // Import new items
} from '../services/api';
import { Box, CircularProgress, Typography, Paper, List, ListItem, ListItemText, Divider, Alert, Link, ListItemButton } from '@mui/material'; // MUI components
import { Grid } from '@mui/material';
import { Bar, Pie, Line } from 'react-chartjs-2'; // Import chart components
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  PointElement, // Added for Line charts
  LineElement   // Added for Line charts
} from 'chart.js'; // Import Chart.js modules

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement
);

// Helper function for formatting bytes
function formatBytes(bytes?: number | null, decimals = 2) { // Added type annotation for bytes
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return 'N/A'; // Handle null or undefined
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const AdminDashboardPage: React.FC = () => {
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  useEffect(() => {
    const getStats = async () => {
      try {
        setLoadingStats(true);
        const stats = await fetchDashboardStats();
        setDashboardStats(stats);
        setStatsError(null);
      } catch (err: any) {
        setStatsError(err.message || 'Failed to fetch dashboard statistics');
        console.error(err);
      } finally {
        setLoadingStats(false);
      }
    };

    const getHealth = async () => {
      try {
        setLoadingHealth(true);
        const health = await fetchSystemHealth();
        setSystemHealth(health);
        setHealthError(null);
      } catch (err: any) {
        setHealthError(err.message || 'Failed to fetch system health');
        console.error(err);
      } finally {
        setLoadingHealth(false);
      }
    };

    getStats();
    getHealth();
  }, []);

  // Chart data and options
  const documentsPerSoftwareChartData = {
    labels: dashboardStats?.documents_per_software?.map(item => item.software_name) || [],
    datasets: [
      {
        label: 'Documents per Software',
        data: dashboardStats?.documents_per_software?.map(item => item.document_count) || [],
        backgroundColor: 'rgba(54, 162, 235, 0.6)', // Blue
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  };

  const popularDownloadsChartData = {
    labels: dashboardStats?.popular_downloads?.map(item => `${item.name} (${item.type})`) || [],
    datasets: [
      {
        label: 'Popular Downloads',
        data: dashboardStats?.popular_downloads?.map(item => item.download_count) || [],
        backgroundColor: [ // Array of colors for Pie chart segments
          'rgba(255, 99, 132, 0.6)',  // Red
          'rgba(75, 192, 192, 0.6)',  // Green
          'rgba(255, 205, 86, 0.6)',  // Yellow
          'rgba(201, 203, 207, 0.6)', // Grey
          'rgba(153, 102, 255, 0.6)', // Purple
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(255, 205, 86, 1)',
          'rgba(201, 203, 207, 1)',
          'rgba(153, 102, 255, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  const chartBaseOptions = {
    responsive: true,
    maintainAspectRatio: false, // Important for sizing within Paper
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
            label: function(context: any) {
                let label = context.dataset.label || '';
                if (label) {
                    label += ': ';
                }
                if (context.parsed.y !== null) { // For Bar/Line chart
                    label += context.parsed.y;
                } else if (context.parsed !== null && context.chart.config.type === 'pie') { // For Pie chart
                    label += context.parsed;
                }
                return label;
            }
        }
      }
    },
    scales: { // Common scale options, can be overridden
        y: {
            beginAtZero: true
        }
    }
  };

  const dailyLoginData = {
    labels: dashboardStats?.user_activity_trends?.logins?.daily?.map(item => item.date) || [],
    datasets: [
      {
        label: 'Logins',
        data: dashboardStats?.user_activity_trends?.logins?.daily?.map(item => item.count) || [],
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
    ],
  };

  const dailyUploadData = {
    labels: dashboardStats?.user_activity_trends?.uploads?.daily?.map(item => item.date) || [],
    datasets: [
      {
        label: 'Uploads',
        data: dashboardStats?.user_activity_trends?.uploads?.daily?.map(item => item.count) || [],
        fill: false,
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1,
      },
    ],
  };

  const dailyDownloadData = {
    labels: dashboardStats?.download_trends?.daily?.map(item => item.date) || [],
    datasets: [
      {
        label: 'Downloads',
        data: dashboardStats?.download_trends?.daily?.map(item => item.count) || [],
        fill: false,
        borderColor: 'rgb(75, 192, 75)', // Green color for downloads
        tension: 0.1,
      },
    ],
  };
  
  if (loadingStats || loadingHealth) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="calc(100vh - 64px)"> {/* Adjust height based on AppBar/Header */}
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading Dashboard Data...</Typography>
      </Box>
    );
  }

  // Helper to render content health statistics lists
  const renderHealthStatsList = (
    healthData: { [key: string]: { missing?: number; stale?: number; total: number } } | undefined,
    dataType: 'missing' | 'stale'
  ) => {
    if (loadingStats) return <CircularProgress />; // Show loader if stats are still loading
    if (!healthData || Object.keys(healthData).length === 0) {
      return <Typography sx={{ textAlign: 'center', mt: 2 }}>No data available.</Typography>;
    }

    return (
      <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
        {Object.entries(healthData).map(([key, stats]) => {
          const count = dataType === 'missing' ? stats.missing : stats.stale;
          const percentage = stats.total > 0 && count !== undefined ? ((count / stats.total) * 100).toFixed(1) : '0.0';
          const displayName = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
          const itemText = `${displayName}: ${count ?? 0} / ${stats.total} (${percentage}%)`;
          
          return (
            <ListItem key={key} divider>
              <ListItemText primary={itemText} />
            </ListItem>
          );
        })}
      </List>
    );
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3, backgroundColor: 'grey.100' }}> 
      <Typography variant="h4" gutterBottom component="div" sx={{ color: 'primary.main', mb: 4 }}>
        Admin Dashboard
      </Typography>

      {statsError && <Alert severity="error" sx={{ mb: 2 }}>Error loading dashboard statistics: {statsError}</Alert>}
      {healthError && <Alert severity="error" sx={{ mb: 2 }}>Error loading system health: {healthError}</Alert>}
      
      <Grid container spacing={3}>
        {/* System Health Card */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 160 }}>
            <Typography component="h2" variant="h6" color="primary" gutterBottom>
              System Health
            </Typography>
            {loadingHealth ? (
              <CircularProgress size={24} />
            ) : systemHealth ? (
              <>
                <Typography component="p" variant="body1" sx={{ mb: 1 }}>
                  API Status: 
                  <Typography component="span" sx={{ fontWeight: 'bold', color: systemHealth.api_status === 'OK' ? 'success.main' : 'error.main' }}>
                    {` ${systemHealth.api_status}`}
                  </Typography>
                </Typography>
                <Typography component="p" variant="body1">
                  Database Connection: 
                  <Typography component="span" sx={{ fontWeight: 'bold', color: systemHealth.db_connection === 'OK' ? 'success.main' : 'error.main' }}>
                    {` ${systemHealth.db_connection}`}
                  </Typography>
                </Typography>
              </>
            ) : (
              <Typography component="p" variant="body1">
                System health data unavailable.
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Daily Downloads Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 400 }}>
            <Typography variant="h6" gutterBottom>Daily Downloads (Last 7 Days)</Typography>
            {loadingStats ? <CircularProgress /> : dashboardStats?.download_trends?.daily?.length ? (
              <Box sx={{ height: 'calc(100% - 48px)'}}>
                <Line 
                  data={dailyDownloadData} 
                  options={{...chartBaseOptions, plugins: {...chartBaseOptions.plugins, title: {...chartBaseOptions.plugins.title, display: true, text: 'Daily Downloads (Last 7 Days)'}}}} 
                />
              </Box>
            ) : (
              <Typography sx={{textAlign: 'center', mt: 4}}>No download trend data available.</Typography>
            )}
          </Paper>
        </Grid>

        {/* Daily Logins Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 400 }}>
            <Typography variant="h6" gutterBottom>Daily Logins (Last 7 Days)</Typography>
            {loadingStats ? <CircularProgress /> : dashboardStats?.user_activity_trends?.logins?.daily?.length ? (
              <Box sx={{ height: 'calc(100% - 48px)'}}>
                <Line 
                  data={dailyLoginData} 
                  options={{...chartBaseOptions, plugins: {...chartBaseOptions.plugins, title: {...chartBaseOptions.plugins.title, display: true, text: 'Daily Logins (Last 7 Days)'}}}} 
                />
              </Box>
            ) : (
              <Typography sx={{textAlign: 'center', mt: 4}}>No login trend data available.</Typography>
            )}
          </Paper>
        </Grid>

        {/* Daily Uploads Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 400 }}>
            <Typography variant="h6" gutterBottom>Daily Uploads (Last 7 Days)</Typography>
            {loadingStats ? <CircularProgress /> : dashboardStats?.user_activity_trends?.uploads?.daily?.length ? (
              <Box sx={{ height: 'calc(100% - 48px)'}}>
                <Line 
                  data={dailyUploadData} 
                  options={{...chartBaseOptions, plugins: {...chartBaseOptions.plugins, title: {...chartBaseOptions.plugins.title, display: true, text: 'Daily Uploads (Last 7 Days)'}}}} 
                />
              </Box>
            ) : (
              <Typography sx={{textAlign: 'center', mt: 4}}>No upload trend data available.</Typography>
            )}
          </Paper>
        </Grid>

        {/* Summary Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 160, justifyContent: 'center' }}>
            <Typography component="h2" variant="h6" color="primary" gutterBottom>
              Total Storage Utilized
            </Typography>
            {loadingStats ? <CircularProgress size={24} /> :
              <Typography component="p" variant="h4">
                {formatBytes(dashboardStats?.total_storage_utilized_bytes)}
              </Typography>
            }
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 160, justifyContent: 'center' }}>
            <Typography component="h2" variant="h6" color="primary" gutterBottom>
              Total Users
            </Typography>
            {loadingStats ? <CircularProgress size={24} /> : 
              <Typography component="p" variant="h4">
                {dashboardStats?.total_users ?? 'N/A'}
              </Typography>
            }
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 160, justifyContent: 'center' }}>
            <Typography component="h2" variant="h6" color="primary" gutterBottom>
              Total Software Titles
            </Typography>
            {loadingStats ? <CircularProgress size={24} /> :
              <Typography component="p" variant="h4">
                {dashboardStats?.total_software_titles ?? 'N/A'}
              </Typography>
            }
          </Paper>
        </Grid>

        {/* Recent Activities */}
        <Grid item xs={12} md={7}> {/* Adjusted grid size */}
          <Paper sx={{ p: 2, minHeight: 360 }}> {/* Adjusted minHeight */}
            <Typography variant="h6" gutterBottom>Recent Activities</Typography>
            {loadingStats ? <CircularProgress /> : dashboardStats?.recent_activities?.length ? (
              <List dense sx={{maxHeight: 300, overflow: 'auto'}}>
                {dashboardStats.recent_activities.map((activity, index) => (
                  <ListItem key={index} divider>
                    <ListItemText
                      primary={`${activity.action_type} by ${activity.username || 'System'}`}
                      secondary={`${formatDate(activity.timestamp)} - Details: ${typeof activity.details === 'object' ? JSON.stringify(activity.details) : activity.details}`}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography>No recent activities.</Typography>
            )}
          </Paper>
        </Grid>

        {/* Recent Additions */}
        <Grid item xs={12} md={5}> {/* Adjusted grid size */}
          <Paper sx={{ p: 2, minHeight: 360 }}> {/* Adjusted minHeight */}
            <Typography variant="h6" gutterBottom>Recent Additions (Top 5)</Typography>
            {loadingStats ? <CircularProgress /> : dashboardStats?.recent_additions?.length ? (
              <List dense sx={{maxHeight: 300, overflow: 'auto'}}>
                {dashboardStats.recent_additions.map((item: RecentAdditionItem, index: number) => (
                  <ListItem key={item.id || index} divider>
                    <ListItemText
                      primary={
                        <Link component={RouterLink} to={`/${item.type.toLowerCase().replace(' ', '')}s`}> {/* Basic link */}
                           {`${item.name} (${item.type})`}
                        </Link>
                      }
                      secondary={`Added on: ${formatDate(item.created_at)}`}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography>No recent additions.</Typography>
            )}
          </Paper>
        </Grid>
        
        {/* Documents per Software Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 400 }}> 
            <Typography variant="h6" gutterBottom>Documents per Software</Typography>
            {loadingStats ? <CircularProgress /> : dashboardStats?.documents_per_software?.length ? (
              <Box sx={{ height: 'calc(100% - 48px)'}}> {/* Subtracted approx title height */}
                <Bar 
                  data={documentsPerSoftwareChartData} 
                  options={{...chartBaseOptions, plugins: {...chartBaseOptions.plugins, title: {...chartBaseOptions.plugins.title, display: true, text: 'Documents per Software'}}}} 
                />
              </Box>
            ) : (
              <Typography sx={{textAlign: 'center', mt: 4}}>No document data available for chart.</Typography>
            )}
          </Paper>
        </Grid>

        {/* Popular Downloads Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 400 }}> 
            <Typography variant="h6" gutterBottom>Popular Downloads (Top 5)</Typography>
            {loadingStats ? <CircularProgress /> : dashboardStats?.popular_downloads?.length ? (
               <Box sx={{ height: 'calc(100% - 48px)'}}> {/* Subtracted approx title height */}
                <Pie 
                  data={popularDownloadsChartData} 
                  options={{...chartBaseOptions, plugins: {...chartBaseOptions.plugins, title: {...chartBaseOptions.plugins.title, display: true, text: 'Popular Downloads'}}}} 
                />
              </Box>
            ) : (
              <Typography sx={{textAlign: 'center', mt: 4}}>No download data available for chart.</Typography>
            )}
          </Paper>
        </Grid>

        {/* Content: Missing Descriptions Widget */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, minHeight: 360 }}>
            <Typography variant="h6" gutterBottom>Content: Missing Descriptions</Typography>
            {renderHealthStatsList(dashboardStats?.content_health?.missing_descriptions, 'missing')}
          </Paper>
        </Grid>

        {/* Content: Stale Items Widget */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, minHeight: 360 }}>
            <Typography variant="h6" gutterBottom>Content: Stale Items (Older than 1 year)</Typography>
            {renderHealthStatsList(dashboardStats?.content_health?.stale_content, 'stale')}
          </Paper>
        </Grid>

        {/* Quick Links Card */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Quick Links</Typography>
            <List dense>
                <ListItemButton component={RouterLink} to="/admin/versions">
                    <ListItemText primary="Manage Versions" />
                </ListItemButton>
                <ListItemButton component={RouterLink} to="/admin/audit-logs">
                    <ListItemText primary="View Audit Logs" />
                </ListItemButton>
                <ListItemButton component={RouterLink} to="/superadmin">
                    <ListItemText primary="Manage Users (Super Admin)" />
                </ListItemButton>
                {/* Add more links as needed */}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdminDashboardPage;
