import React, { useEffect, useState, useCallback, useMemo } from 'react'; // Added useCallback and useMemo
import { Link as RouterLink } from 'react-router-dom';
import {
  fetchDashboardStats, DashboardStats, RecentActivityItem, SystemHealth,
  fetchSystemHealth,
  getUserDashboardLayout, saveUserDashboardLayout, LayoutObject as ApiLayoutObject // Renamed to avoid conflict
} from '../services/api';
import {
  Box, CircularProgress, Typography, Paper, List, ListItem, ListItemText, Alert, Link, ListItemButton, Button, Modal, FormControlLabel, Checkbox,
  Switch
} from '@mui/material';
import { Responsive, WidthProvider, Layouts as RglLayouts, Layout as RglLayout } from 'react-grid-layout'; // Import RGL types
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Bar, Pie, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, PointElement, LineElement
} from 'chart.js';
import { showErrorToast, showSuccessToast } from '../utils/toastUtils'; // Import toast utility
import LoadingState from '../components/LoadingState'; // For overall loading
import ErrorState from '../components/ErrorState'; // For overall error

ChartJS.register( CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, PointElement, LineElement );

const ResponsiveGridLayout = WidthProvider(Responsive);
const WIDGET_CONFIG_STORAGE_KEY = 'adminDashboardWidgetConfig';

const WIDGET_KEYS = {
  SYSTEM_HEALTH: 'systemHealth', TOTAL_STORAGE: 'totalStorage', TOTAL_USERS: 'totalUsers',
  TOTAL_SOFTWARE: 'totalSoftware', RECENT_ACTIVITIES: 'recentActivities', RECENT_ADDITIONS: 'recentAdditions',
  LOGIN_TRENDS: 'loginTrends', UPLOAD_TRENDS: 'uploadTrends', DOWNLOAD_TRENDS: 'downloadTrends',
  DOCS_PER_SOFTWARE: 'docsPerSoftware', POPULAR_DOWNLOADS: 'popularDownloads',
  MISSING_DESCRIPTIONS: 'missingDescriptions', STALE_CONTENT: 'staleContent', QUICK_LINKS: 'quickLinks',
};

function formatBytes(bytes?: number | null, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return 'N/A';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

interface LayoutItem {
  i: string; x: number; y: number; w: number; h: number; minW?: number; maxW?: number; minH?: number; maxH?: number;
  static?: boolean; isDraggable?: boolean; isResizable?: boolean;
}

interface WidgetComponentProps {
  dashboardStats: DashboardStats | null; systemHealth: SystemHealth | null;
  loadingStats: boolean; loadingHealth: boolean;
  formatBytes: (bytes?: number | null, decimals?: number) => string;
  formatDate: (dateString: string) => string;
  chartBaseOptions: any; documentsPerSoftwareChartData: any; popularDownloadsChartData: any;
  dailyLoginData: any; dailyUploadData: any; dailyDownloadData: any;
  renderHealthStatsList: (healthData: any, dataType: 'missing' | 'stale') => React.ReactNode;
}

interface WidgetConfig {
  id: string; name: string; layout: LayoutItem; visible: boolean;
  component: (props: WidgetComponentProps) => React.ReactNode;
}

const initialLayoutLg: LayoutItem[] = [
  { i: WIDGET_KEYS.SYSTEM_HEALTH,    x: 0, y: 0, w: 3, h: 4, minH: 4, maxH: 4 }, // minW not specified, defaults to 0 or 1 typically
  { i: WIDGET_KEYS.TOTAL_STORAGE,    x: 3, y: 0, w: 3, h: 4, minH: 4, maxH: 4 }, // minW not specified
  { i: WIDGET_KEYS.TOTAL_USERS,      x: 6, y: 0, w: 3, h: 4, minH: 4, maxH: 4 }, // minW not specified
  { i: WIDGET_KEYS.TOTAL_SOFTWARE,   x: 9, y: 0, w: 3, h: 4, minH: 4, maxH: 4 }, // minW not specified
  { i: WIDGET_KEYS.DOWNLOAD_TRENDS,  x: 0, y: 1, w: 4, h: 8, minH: 6, minW: 2 },
  { i: WIDGET_KEYS.LOGIN_TRENDS,     x: 4, y: 1, w: 4, h: 8, minH: 6, minW: 2 },
  { i: WIDGET_KEYS.UPLOAD_TRENDS,    x: 8, y: 1, w: 4, h: 8, minH: 6, minW: 2 },
  { i: WIDGET_KEYS.RECENT_ACTIVITIES,  x: 0, y: 2, w: 7, h: 10, minH: 8, minW: 2 },
  { i: WIDGET_KEYS.DOCS_PER_SOFTWARE,  x: 7, y: 2, w: 5, h: 10, minH: 8, minW: 2 },
  { i: WIDGET_KEYS.RECENT_ADDITIONS,   x: 0, y: 3, w: 5, h: 10, minH: 8, minW: 2 },
  { i: WIDGET_KEYS.POPULAR_DOWNLOADS,  x: 5, y: 3, w: 7, h: 10, minH: 8, minW: 2 },
  { i: WIDGET_KEYS.MISSING_DESCRIPTIONS, x: 0, y: 4, w: 6, h: 10, minH: 8, minW: 2 },
  { i: WIDGET_KEYS.STALE_CONTENT,        x: 6, y: 4, w: 6, h: 10, minH: 8, minW: 2 },
  { i: WIDGET_KEYS.QUICK_LINKS,          x: 0, y: 5, w: 12, h: 4, minH: 4, minW: 2 },
];



const AdminDashboardPage: React.FC = () => {
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null); // Combined error for initial load
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [currentLayouts, setCurrentLayouts] = useState<RglLayouts | null>(null); // For react-grid-layout
  const [isLoadingLayout, setIsLoadingLayout] = useState<boolean>(true);
  const [initialLayoutFetched, setInitialLayoutFetched] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false); 

  const WIDGET_DEFINITIONS_ARRAY = useMemo(() => [
    { id: WIDGET_KEYS.SYSTEM_HEALTH, name: "System Health", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.SYSTEM_HEALTH)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100%' }}> <Typography component="h2" variant="h6" color="primary" gutterBottom>System Health</Typography> {props.loadingHealth && (isInitialLoad || !props.systemHealth) ? <CircularProgress size={24} /> : props.systemHealth ? ( <> <Typography component="p" variant="body1" sx={{ mb: 1 }}>API Status: <Typography component="span" sx={{ fontWeight: 'bold', color: props.systemHealth.api_status === 'OK' ? 'success.main' : 'error.main' }}>{` ${props.systemHealth.api_status}`}</Typography></Typography> <Typography component="p" variant="body1">Database Connection: <Typography component="span" sx={{ fontWeight: 'bold', color: props.systemHealth.db_connection === 'OK' ? 'success.main' : 'error.main' }}>{` ${props.systemHealth.db_connection}`}</Typography></Typography> </> ) : <Typography component="p" variant="body1">System health data unavailable.</Typography>} </Paper> ) },
    { id: WIDGET_KEYS.TOTAL_STORAGE, name: "Total Storage", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.TOTAL_STORAGE)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}> <Typography component="h2" variant="h6" color="primary" gutterBottom>Total Storage Utilized</Typography> {props.loadingStats && (isInitialLoad || !props.dashboardStats) ? <CircularProgress size={24} /> : <Typography component="p" variant="h4">{props.formatBytes(props.dashboardStats?.total_storage_utilized_bytes)}</Typography>} </Paper> ) },
    { id: WIDGET_KEYS.TOTAL_USERS, name: "Total Users", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.TOTAL_USERS)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}> <Typography component="h2" variant="h6" color="primary" gutterBottom>Total Users</Typography> {props.loadingStats && (isInitialLoad || !props.dashboardStats) ? <CircularProgress size={24} /> : <Typography component="p" variant="h4">{props.dashboardStats?.total_users ?? 'N/A'}</Typography>} </Paper> ) },
    { id: WIDGET_KEYS.TOTAL_SOFTWARE, name: "Total Software", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.TOTAL_SOFTWARE)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}> <Typography component="h2" variant="h6" color="primary" gutterBottom>Total Software Titles</Typography> {props.loadingStats && isInitialLoad ? <CircularProgress size={24} /> : <Typography component="p" variant="h4">{props.dashboardStats?.total_software_titles ?? 'N/A'}</Typography>} </Paper> ) },
    { id: WIDGET_KEYS.DOWNLOAD_TRENDS, name: "Download Trends", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.DOWNLOAD_TRENDS)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}> <Typography variant="h6" gutterBottom>Daily Downloads (Last 7 Days)</Typography> {props.loadingStats && isInitialLoad ? <CircularProgress /> : props.dashboardStats?.download_trends?.daily?.length ? (<Box sx={{ flexGrow: 1, height: 'calc(100% - 48px)'}}><Line data={props.dailyDownloadData} options={{...props.chartBaseOptions, plugins: {...props.chartBaseOptions.plugins, title: {...props.chartBaseOptions.plugins.title, display: true, text: 'Daily Downloads (Last 7 Days)'}}}} /></Box>) : (<Typography sx={{textAlign: 'center', mt: 4}}>No download trend data available.</Typography>)} </Paper> ) },
    { id: WIDGET_KEYS.LOGIN_TRENDS, name: "Login Trends", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.LOGIN_TRENDS)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}> <Typography variant="h6" gutterBottom>Daily Logins (Last 7 Days)</Typography> {props.loadingStats && isInitialLoad ? <CircularProgress /> : props.dashboardStats?.user_activity_trends?.logins?.daily?.length ? (<Box sx={{ flexGrow: 1, height: 'calc(100% - 48px)'}}><Line data={props.dailyLoginData} options={{...props.chartBaseOptions, plugins: {...props.chartBaseOptions.plugins, title: {...props.chartBaseOptions.plugins.title, display: true, text: 'Daily Logins (Last 7 Days)'}}}} /></Box>) : (<Typography sx={{textAlign: 'center', mt: 4}}>No login trend data available.</Typography>)} </Paper> ) },
    { id: WIDGET_KEYS.UPLOAD_TRENDS, name: "Upload Trends", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.UPLOAD_TRENDS)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}> <Typography variant="h6" gutterBottom>Daily Uploads (Last 7 Days)</Typography> {props.loadingStats && isInitialLoad ? <CircularProgress /> : props.dashboardStats?.user_activity_trends?.uploads?.daily?.length ? (<Box sx={{ flexGrow: 1, height: 'calc(100% - 48px)'}}><Line data={props.dailyUploadData} options={{...props.chartBaseOptions, plugins: {...props.chartBaseOptions.plugins, title: {...props.chartBaseOptions.plugins.title, display: true, text: 'Daily Uploads (Last 7 Days)'}}}} /></Box>) : (<Typography sx={{textAlign: 'center', mt: 4}}>No upload trend data available.</Typography>)} </Paper> ) },
    { id: WIDGET_KEYS.RECENT_ACTIVITIES, name: "Recent Activities", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.RECENT_ACTIVITIES)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}> <Typography variant="h6" gutterBottom>Recent Activities</Typography> {props.loadingStats && isInitialLoad ? <CircularProgress /> : props.dashboardStats?.recent_activities?.length ? (<List dense sx={{maxHeight: 'calc(100% - 48px)', overflow: 'auto'}}>{props.dashboardStats.recent_activities.map((activity, index) => (<ListItem key={index} divider><ListItemText primary={`${activity.action_type} by ${activity.username || 'System'}`} secondary={`${props.formatDate(activity.timestamp)} - Details: ${typeof activity.details === 'object' ? JSON.stringify(activity.details) : activity.details}`} /></ListItem>))}</List>) : (<Typography>No recent activities.</Typography>)} </Paper> ) },
    { id: WIDGET_KEYS.RECENT_ADDITIONS, name: "Recent Additions", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.RECENT_ADDITIONS)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}> <Typography variant="h6" gutterBottom>Recent Additions (Top 5)</Typography> {props.loadingStats && isInitialLoad ? <CircularProgress /> : props.dashboardStats?.recent_additions?.length ? (<List dense sx={{maxHeight: 'calc(100% - 48px)', overflow: 'auto'}}>{props.dashboardStats.recent_additions.map((item, index) => (<ListItem key={item.id || index} divider><ListItemText primary={<Link component={RouterLink} to={`/${item.type.toLowerCase().replace(' ', '')}s`}>{`${item.name} (${item.type})`}</Link>} secondary={`Added on: ${props.formatDate(item.created_at)}`} /></ListItem>))}</List>) : (<Typography>No recent additions.</Typography>)} </Paper> ) },
    { id: WIDGET_KEYS.DOCS_PER_SOFTWARE, name: "Documents per Software", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.DOCS_PER_SOFTWARE)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}> <Typography variant="h6" gutterBottom>Documents per Software</Typography> {props.loadingStats && isInitialLoad ? <CircularProgress /> : props.dashboardStats?.documents_per_software?.length ? (<Box sx={{ flexGrow: 1, height: 'calc(100% - 48px)'}}><Bar data={props.documentsPerSoftwareChartData} options={{...props.chartBaseOptions, plugins: {...props.chartBaseOptions.plugins, title: {...props.chartBaseOptions.plugins.title, display: true, text: 'Documents per Software'}}}} /></Box>) : (<Typography sx={{textAlign: 'center', mt: 4}}>No document data available for chart.</Typography>)} </Paper> ) },
    { id: WIDGET_KEYS.POPULAR_DOWNLOADS, name: "Popular Downloads", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.POPULAR_DOWNLOADS)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}> <Typography variant="h6" gutterBottom>Popular Downloads (Top 5)</Typography> {props.loadingStats && isInitialLoad ? <CircularProgress /> : props.dashboardStats?.popular_downloads?.length ? (<Box sx={{ flexGrow: 1, height: 'calc(100% - 48px)'}}><Pie data={props.popularDownloadsChartData} options={{...props.chartBaseOptions, plugins: {...props.chartBaseOptions.plugins, title: {...props.chartBaseOptions.plugins.title, display: true, text: 'Popular Downloads'}}}} /></Box>) : (<Typography sx={{textAlign: 'center', mt: 4}}>No download data available for chart.</Typography>)} </Paper> ) },
    { id: WIDGET_KEYS.MISSING_DESCRIPTIONS, name: "Missing Descriptions", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.MISSING_DESCRIPTIONS)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}> <Typography variant="h6" gutterBottom>Content: Missing Descriptions</Typography> {props.loadingStats && isInitialLoad ? <CircularProgress /> : props.renderHealthStatsList(props.dashboardStats?.content_health?.missing_descriptions, 'missing')} </Paper> ) },
    { id: WIDGET_KEYS.STALE_CONTENT, name: "Stale Content", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.STALE_CONTENT)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}> <Typography variant="h6" gutterBottom>Content: Stale Items (Older than 1 year)</Typography> {props.loadingStats && isInitialLoad ? <CircularProgress /> : props.renderHealthStatsList(props.dashboardStats?.content_health?.stale_content, 'stale')} </Paper> ) },
    { id: WIDGET_KEYS.QUICK_LINKS, name: "Quick Links", defaultLayout: initialLayoutLg.find(l => l.i === WIDGET_KEYS.QUICK_LINKS)!, component: (props: WidgetComponentProps) => ( <Paper sx={{ p: 2, height: '100%' }}> <Typography variant="h6" gutterBottom>Quick Links</Typography> <List dense> <ListItemButton component={RouterLink} to="/admin/versions"><ListItemText primary="Manage Versions" /></ListItemButton> <ListItemButton component={RouterLink} to="/admin/audit-logs"><ListItemText primary="View Audit Logs" /></ListItemButton> <ListItemButton component={RouterLink} to="/superadmin"><ListItemText primary="Manage Users (Super Admin)" /></ListItemButton> </List> </Paper> ) },
  ], [isInitialLoad]); // Added isInitialLoad to dependency array for widget components


  // Helper function for clamping
  const clamp = (value: number, min?: number, max?: number): number => {
    let clampedValue = value;
    if (min !== undefined) {
      clampedValue = Math.max(clampedValue, min);
    }
    if (max !== undefined) {
      clampedValue = Math.min(clampedValue, max);
    }
    return clampedValue;
  };

  // Helper to clamp a single layout item based on its definition
  const clampLayoutItem = (layoutItem: RglLayout, definitionLayout?: LayoutItem): RglLayout => {
    if (!definitionLayout) {
        console.warn(`No definition found for layout item ${layoutItem.i}, cannot clamp. Returning as is.`);
        return { // Ensure basic validity even if no definition
            ...layoutItem,
            x: Math.max(0, Math.round(layoutItem.x || 0)),
            y: Math.max(0, Math.round(layoutItem.y || 0)),
            w: Math.max(1, Math.round(layoutItem.w || 1)),
            h: Math.max(1, Math.round(layoutItem.h || 1)),
        };
    }
  
    const clampedW = clamp(layoutItem.w, definitionLayout.minW || 1, definitionLayout.maxW); // Default minW to 1 if undefined
    const clampedH = clamp(layoutItem.h, definitionLayout.minH || 1, definitionLayout.maxH); // Default minH to 1 if undefined
  
    return {
      ...layoutItem,
      x: Math.max(0, Math.round(layoutItem.x)), 
      y: Math.max(0, Math.round(layoutItem.y)), 
      w: clampedW,
      h: clampedH,
      ...(layoutItem.static !== undefined && { static: layoutItem.static }),
      ...(layoutItem.isDraggable !== undefined && { isDraggable: layoutItem.isDraggable }),
      ...(layoutItem.isResizable !== undefined && { isResizable: layoutItem.isResizable }),
    };
  };
  

  const formatDate = (dateString: string) => {
    // dateString is now expected to be in ISO 8601 UTC format (e.g., "YYYY-MM-DDTHH:MM:SSZ")
    
    const dateObj = new Date(dateString);
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: true 
    });
  };



  const loadData = useCallback(async () => {
    if (isInitialLoad) {
      setLoadingStats(true);
      setLoadingHealth(true);
      setError(null);
    }
    
    let statsErrorOccurred = false;
    let healthErrorOccurred = false;

    try {
      const stats = await fetchDashboardStats();
      setDashboardStats(stats);
    } catch (err: any) {
      statsErrorOccurred = true;
      const errMsg = err.response?.data?.msg || err.message || 'Failed to fetch dashboard statistics';
      if (isInitialLoad) setError(prev => prev ? `${prev}\n${errMsg}` : errMsg);
      else showErrorToast(errMsg);
      console.error(err);
    } finally {
      if (isInitialLoad || statsErrorOccurred) setLoadingStats(false);
    }

    try {
      const health = await fetchSystemHealth();
      setSystemHealth(health);
    } catch (err: any) {
      healthErrorOccurred = true;
      const errMsg = err.response?.data?.msg || err.message || 'Failed to fetch system health';
      if (isInitialLoad) setError(prev => prev ? `${prev}\n${errMsg}` : errMsg);
      else showErrorToast(errMsg);
      console.error(err);
    } finally {
      if (isInitialLoad || healthErrorOccurred) setLoadingHealth(false);
    }

    if (isInitialLoad && !statsErrorOccurred && !healthErrorOccurred) {
      setIsInitialLoad(false);
    } else if (isInitialLoad && (statsErrorOccurred || healthErrorOccurred)) {
        // Error is set, initial load remains true until successful retry
    }

  }, [isInitialLoad]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch and apply layout preferences
  useEffect(() => {
    const fetchLayout = async () => {
      setIsLoadingLayout(true);
      try {
        const userLayoutFromApi = await getUserDashboardLayout();
        let finalLayoutsToSet: RglLayouts;
        let lgLayoutForWidgetConfigs: RglLayout[];

        if (userLayoutFromApi && Object.keys(userLayoutFromApi).length > 0) {
          console.log('Fetched user layout from API (raw):', JSON.stringify(userLayoutFromApi));
          const processedApiLayouts: RglLayouts = {};
          for (const breakpointKey in userLayoutFromApi) {
            processedApiLayouts[breakpointKey] = userLayoutFromApi[breakpointKey].map(item => {
              const definition = WIDGET_DEFINITIONS_ARRAY.find(def => def.id === item.i);
              // Clamp against definition, ensuring item 'i' is always present
              return clampLayoutItem({ ...item, i: item.i || `unknown-${Math.random()}` }, definition?.defaultLayout);
            });
          }
          console.log('Fetched user layout from API (clamped):', JSON.stringify(processedApiLayouts));
          finalLayoutsToSet = processedApiLayouts;
          // Use 'lg' from processed for widgetConfigs, or default if 'lg' is missing
          lgLayoutForWidgetConfigs = processedApiLayouts.lg || initialLayoutLg.map(l => ({...l}));
        } else {
          // Using default layout for all breakpoints defined in ResponsiveGridLayout's cols prop
          // For simplicity, we often define initialLayoutLg and let RGL derive smaller breakpoints.
          // If you have specific initial layouts for other breakpoints, define them here.
          const defaultLayoutsForAllBreakpoints: RglLayouts = { lg: initialLayoutLg.map(l => ({...l})) };
          console.log('Using default layout for all breakpoints:', JSON.stringify(defaultLayoutsForAllBreakpoints));
          finalLayoutsToSet = defaultLayoutsForAllBreakpoints;
          lgLayoutForWidgetConfigs = defaultLayoutsForAllBreakpoints.lg;
        }
        
        setCurrentLayouts(finalLayoutsToSet);

        // Update widgetConfigs: x, y, w, h from 'lg' layout, constraints from definition
        setWidgetConfigs(prevConfigs => 
          prevConfigs.map(config => {
            const lgLayoutItem = lgLayoutForWidgetConfigs.find(l => l.i === config.id);
            const definition = WIDGET_DEFINITIONS_ARRAY.find(def => def.id === config.id); // Should always exist
            
            if (lgLayoutItem && definition) {
              return {
                ...config,
                layout: { // Base on definition's constraints
                  ...definition.defaultLayout, 
                  // Update x,y,w,h from the current 'lg' layout
                  x: lgLayoutItem.x,
                  y: lgLayoutItem.y,
                  w: lgLayoutItem.w,
                  h: lgLayoutItem.h,
                }
              };
            }
            // Fallback for safety, though should not be reached if WIDGET_DEFINITIONS_ARRAY is correct
            return { ...config, layout: { ...initialLayoutLg.find(l => l.i === config.id)! } }; 
          })
        );

      } catch (error) {
        showErrorToast("Failed to load dashboard layout. Using default.");
        console.error("Failed to load dashboard layout:", error);
        const defaultLgLayout = initialLayoutLg.map(l => ({...l}));
        setCurrentLayouts({ lg: defaultLgLayout }); // Set currentLayouts to default 'lg'
        
        // Update widgetConfigs to reflect default 'lg' layout on error
        setWidgetConfigs(prevConfigs => 
          prevConfigs.map(config => {
            const definition = WIDGET_DEFINITIONS_ARRAY.find(def => def.id === config.id);
            return { ...config, layout: { ...(definition?.defaultLayout || initialLayoutLg.find(l => l.i === config.id)!) } };
          })
        );
      } finally {
        setIsLoadingLayout(false);
        setInitialLayoutFetched(true);
        setHasUnsavedChanges(false); 
      }
    };
    fetchLayout();
  }, [WIDGET_DEFINITIONS_ARRAY]); 


  

  const [widgetConfigs, setWidgetConfigs] = useState<WidgetConfig[]>(() => {
    const defaultsFromDefs = WIDGET_DEFINITIONS_ARRAY.map(def => ({ id: def.id, name: def.name, layout: { ...def.defaultLayout, i: def.id }, visible: true, component: def.component }));
    const savedConfigStr = localStorage.getItem(WIDGET_CONFIG_STORAGE_KEY);
    if (savedConfigStr) {
      try {
        const savedItems: Array<{ id: string; layout: LayoutItem; visible: boolean }> = JSON.parse(savedConfigStr);
        const savedItemsMap = new Map(savedItems.map(item => [item.id, item])); // Store full saved item

        return defaultsFromDefs.map(config => {
          const savedState = savedItemsMap.get(config.id);
          const definition = WIDGET_DEFINITIONS_ARRAY.find(def => def.id === config.id); // Should always exist

          if (savedState && definition) {
            // Merge, ensuring definition constraints are part of the base
            const mergedLayout = { 
              ...definition.defaultLayout, // Start with default constraints
              ...savedState.layout, // Apply saved x,y,w,h
              i: config.id // Ensure 'i' is correct
            };
            const clampedLayout = clampLayoutItem(mergedLayout, definition.defaultLayout);
            return { ...config, layout: clampedLayout, visible: savedState.visible !== undefined ? savedState.visible : config.visible };
          }
          // If no savedState, config already has default layout from WIDGET_DEFINITIONS_ARRAY
          return config; 
        });
      } catch (e) { 
        console.error("Error parsing saved widget config from localStorage:", e); 
        // Fallback to defaultsFromDefs if parsing fails
        return defaultsFromDefs;
      }
    }
    return defaultsFromDefs;
  });

  useEffect(() => {
    // Save widgetConfigs to localStorage: only id, visible, and the x,y,w,h part of layout
    const simplifiedConfigsToSave = widgetConfigs.map(wc => ({ 
      id: wc.id, 
      layout: { // Save only current dimensions, not constraints
        i: wc.layout.i, 
        x: wc.layout.x, 
        y: wc.layout.y, 
        w: wc.layout.w, 
        h: wc.layout.h 
      }, 
      visible: wc.visible 
    }));
    localStorage.setItem(WIDGET_CONFIG_STORAGE_KEY, JSON.stringify(simplifiedConfigsToSave));
  }, [widgetConfigs]);


  const documentsPerSoftwareChartData = useMemo(() => ({
    labels: dashboardStats?.documents_per_software?.map(item => item.software_name) || [],
    datasets: [{ label: 'Documents per Software', data: dashboardStats?.documents_per_software?.map(item => item.document_count) || [], backgroundColor: 'rgba(54, 162, 235, 0.6)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1 }],
  }), [dashboardStats?.documents_per_software]);

  const popularDownloadsChartData = useMemo(() => ({
    labels: dashboardStats?.popular_downloads?.map(item => `${item.name} (${item.type})`) || [],
    datasets: [{ label: 'Popular Downloads', data: dashboardStats?.popular_downloads?.map(item => item.download_count) || [], backgroundColor: ['rgba(255, 99, 132, 0.6)', 'rgba(75, 192, 192, 0.6)', 'rgba(255, 205, 86, 0.6)', 'rgba(201, 203, 207, 0.6)', 'rgba(153, 102, 255, 0.6)'], borderColor: ['rgba(255, 99, 132, 1)', 'rgba(75, 192, 192, 1)', 'rgba(255, 205, 86, 1)', 'rgba(201, 203, 207, 1)', 'rgba(153, 102, 255, 1)'], borderWidth: 1 }],
  }), [dashboardStats?.popular_downloads]);

  const chartBaseOptions = useMemo(() => ({
    responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' as const }, tooltip: { callbacks: { label: function(context: any) { let label = context.dataset.label || ''; if (label) { label += ': '; } if (context.parsed.y !== null) { label += context.parsed.y; } else if (context.parsed !== null && context.chart.config.type === 'pie') { label += context.parsed; } return label; }}}, title: { display: false, text: '' }}, scales: { y: { beginAtZero: true }}
  }), []);

  const dailyLoginData = useMemo(() => ({
    labels: dashboardStats?.user_activity_trends?.logins?.daily?.map(item => item.date) || [],
    datasets: [{ label: 'Logins', data: dashboardStats?.user_activity_trends?.logins?.daily?.map(item => item.count) || [], fill: false, borderColor: 'rgb(75, 192, 192)', tension: 0.1 }],
  }), [dashboardStats?.user_activity_trends?.logins?.daily]);

  const dailyUploadData = useMemo(() => ({
    labels: dashboardStats?.user_activity_trends?.uploads?.daily?.map(item => item.date) || [],
    datasets: [{ label: 'Uploads', data: dashboardStats?.user_activity_trends?.uploads?.daily?.map(item => item.count) || [], fill: false, borderColor: 'rgb(255, 99, 132)', tension: 0.1 }],
  }), [dashboardStats?.user_activity_trends?.uploads?.daily]);

  const dailyDownloadData = useMemo(() => ({
    labels: dashboardStats?.download_trends?.daily?.map(item => item.date) || [],
    datasets: [{ label: 'Downloads', data: dashboardStats?.download_trends?.daily?.map(item => item.count) || [], fill: false, borderColor: 'rgb(75, 192, 75)', tension: 0.1 }],
  }), [dashboardStats?.download_trends?.daily]);

  const renderHealthStatsList = useCallback((healthData: { [key: string]: { missing?: number; stale?: number; total: number } } | undefined, dataType: 'missing' | 'stale') => {
    if (loadingStats && isInitialLoad) return <CircularProgress />; // Show spinner only on initial load for this list
    if (!healthData || Object.keys(healthData).length === 0) { return <Typography sx={{ textAlign: 'center', mt: 2 }}>No data available.</Typography>; }
    return ( <List dense sx={{ maxHeight: 300, overflow: 'auto' }}> {Object.entries(healthData).map(([key, stats]) => { const count = dataType === 'missing' ? stats.missing : stats.stale; const percentage = stats.total > 0 && count !== undefined ? ((count / stats.total) * 100).toFixed(1) : '0.0'; const displayName = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '); const itemText = `${displayName}: ${count ?? 0} / ${stats.total} (${percentage}%)`; return ( <ListItem key={key} divider><ListItemText primary={itemText} /></ListItem> ); })} </List> );
  }, [loadingStats, isInitialLoad]);

  const handleLayoutChange = (newLayout: RglLayout[], allLayouts: RglLayouts) => {
    if (initialLayoutFetched) { 
      console.log('Layout changed (handleLayoutChange):', JSON.stringify(allLayouts));
      setCurrentLayouts(allLayouts);
      if (isEditMode) {
        setHasUnsavedChanges(true);
      }
    }
  };

  const handleDragOrResizeStop = () => {
    // Now that debouncedSaveLayout is removed, this function might not be strictly necessary
    // unless other logic needs to run on drag/resize stop.
    // If setHasUnsavedChanges is handled by onLayoutChange, this could potentially be removed
    // from onDragStop and onResizeStop props of ResponsiveGridLayout.
    // For now, let's assume onLayoutChange is sufficient.
    if (isEditMode && currentLayouts) {
        // console.log('Drag or Resize Stop'); // Optional: for debugging drag/resize events
    }
  };

  const handleWidgetVisibilityChange = (widgetId: string, isVisible: boolean) => {
    setWidgetConfigs(prevConfigs =>
      prevConfigs.map(config =>
        config.id === widgetId ? { ...config, visible: isVisible } : config
      )
    );
    if (isEditMode) { // Or always, if visibility change is an unsaved change
        setHasUnsavedChanges(true);
    }
  };
  
  const handleSaveLayout = async () => {
    if (!currentLayouts) {
      showErrorToast("No layout data available to save.");
      console.error("handleSaveLayout called with null currentLayouts.");
      return;
    }

    // Deep copy currentLayouts to avoid mutating state before setCurrentLayouts
    const layoutsToProcess: RglLayouts = JSON.parse(JSON.stringify(currentLayouts));
    const fullyClampedLayouts: RglLayouts = {};

    for (const breakpointKey in layoutsToProcess) {
      if (layoutsToProcess.hasOwnProperty(breakpointKey)) {
        fullyClampedLayouts[breakpointKey] = layoutsToProcess[breakpointKey].map((item: RglLayout) => {
          const definition = WIDGET_DEFINITIONS_ARRAY.find(def => def.id === item.i);
          return clampLayoutItem(item, definition?.defaultLayout);
        });
      }
    }
    
    console.log('Attempting to save layout (handleSaveLayout, fully clamped):', JSON.stringify(fullyClampedLayouts));
    try {
      await saveUserDashboardLayout(fullyClampedLayouts); // Save the fully clamped layout
      showSuccessToast("Dashboard layout saved successfully!", { autoClose: 2000 });
      console.log('Layout save API call successful (frontend).');
      
      setCurrentLayouts(fullyClampedLayouts); // Reflect the exact saved state in UI

      // Update widgetConfigs based on the 'lg' breakpoint of the saved (and clamped) layout
      const savedLgLayout = fullyClampedLayouts.lg;
      if (savedLgLayout) {
        setWidgetConfigs(prevConfigs =>
          prevConfigs.map(config => {
            const savedLgItem = savedLgLayout.find(l => l.i === config.id);
            const definition = WIDGET_DEFINITIONS_ARRAY.find(def => def.id === config.id); // For constraints
            if (savedLgItem && definition) {
              return {
                ...config,
                layout: {
                  ...definition.defaultLayout, // Keep original constraints
                  x: savedLgItem.x,
                  y: savedLgItem.y,
                  w: savedLgItem.w,
                  h: savedLgItem.h,
                },
              };
            }
            return config; // Should not happen if data is consistent
          })
        );
      }
      setHasUnsavedChanges(false);
    } catch (error) {
      showErrorToast("Failed to save dashboard layout.");
      console.error('Layout save API call failed (frontend):', error);
      // Optionally, revert currentLayouts to a previous stable state or re-fetch
    }
  };

  const handleToggleEditMode = () => {
    const newEditMode = !isEditMode;
    if (!newEditMode && hasUnsavedChanges) { 
      const revertedLgLayoutFromWidgetConfigs = widgetConfigs.map(wc => wc.layout);
      setCurrentLayouts({ lg: revertedLgLayoutFromWidgetConfigs }); 
      // RGL will derive other breakpoints from this 'lg' layout.
      // This effectively reverts to the last saved state for 'lg', 
      // and other breakpoints adjust accordingly.
      showSuccessToast("Unsaved layout changes were discarded.", { autoClose: 2000 });
    }
    setIsEditMode(newEditMode);
    setHasUnsavedChanges(false); 
  };


  if (isLoadingLayout || (isInitialLoad && (loadingStats || loadingHealth))) {
    return <LoadingState message="Loading Dashboard Data..." />;
  }

  if (isInitialLoad && error && !isLoadingLayout) { 
    return <ErrorState message={error} onRetry={loadData} />;
  }
  
  return (
    <Box sx={{ flexGrow: 1, p: 3, backgroundColor: 'background.default' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" gutterBottom component="div" sx={{ color: 'primary.main', mb: 0 }}>Admin Dashboard</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button variant="outlined" onClick={() => setIsSettingsModalOpen(true)} sx={{ mr: 2 }}>Customize Widgets</Button>
          
          {isEditMode && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleSaveLayout} 
              disabled={!hasUnsavedChanges && isEditMode} 
              sx={{ mr: 2 }} 
            >
              Save Layout
            </Button>
          )}

          <FormControlLabel control={<Switch checked={isEditMode} onChange={handleToggleEditMode} />} label="Edit Mode" />
        </Box>
      </Box>

      <Modal open={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} aria-labelledby="widget-visibility-settings-title">
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 400, bgcolor: 'background.paper', border: 2, borderColor: 'divider', boxShadow: 24, p: 4 }}>
          <Typography id="widget-visibility-settings-title" variant="h6" component="h2">Widget Visibility</Typography>
          <List sx={{ maxHeight: 300, overflow: 'auto' }}>
            {widgetConfigs.map((widget) => ( <ListItem key={widget.id} dense><FormControlLabel control={ <Checkbox checked={widget.visible} onChange={(e) => handleWidgetVisibilityChange(widget.id, e.target.checked)} />} label={widget.name} /></ListItem> ))}
          </List>
          <Button onClick={() => setIsSettingsModalOpen(false)} sx={{ mt: 2 }}>Close</Button>
        </Box>
      </Modal>
      
      {initialLayoutFetched && currentLayouts && ( 
        <ResponsiveGridLayout 
          className="layout" 
          layouts={currentLayouts} 
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }} 
          rowHeight={30} 
          // Control editability directly on ResponsiveGridLayout
          isDraggable={isEditMode}
          isResizable={isEditMode}
          measureBeforeMount={false} 
          useCSSTransforms={true} 
          onLayoutChange={handleLayoutChange}
          // onDragStop and onResizeStop are less critical now if onLayoutChange handles hasUnsavedChanges
          onDragStop={handleDragOrResizeStop} 
          onResizeStop={handleDragOrResizeStop} 
          compactType="vertical"
        >
          {widgetConfigs.filter(w => w.visible).map(widget => {
            const widgetProps: WidgetComponentProps = { dashboardStats, systemHealth, loadingStats, loadingHealth, formatBytes, formatDate, chartBaseOptions, documentsPerSoftwareChartData, popularDownloadsChartData, dailyLoginData, dailyUploadData, dailyDownloadData, renderHealthStatsList };
            // Children no longer need data-grid; RGL uses layouts prop and item keys
            return ( <div key={widget.id} style={{ pointerEvents: 'auto', height: '100%' }}>{widget.component(widgetProps)}</div> );
          })}
        </ResponsiveGridLayout>
      )}
    </Box>
  );
};

export default AdminDashboardPage;