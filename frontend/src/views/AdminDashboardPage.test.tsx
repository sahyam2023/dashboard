import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom'; // For RouterLink components
import AdminDashboardPage from './AdminDashboardPage';
import { fetchDashboardStats, fetchSystemHealth, DashboardStats, SystemHealth, RecentActivityItem, RecentAdditionItem, PopularDownloadItem, DocumentsPerSoftwareItem } from '../services/api'; 
// Import TrendItem, WeeklyTrendItem, ContentTypeHealthStats if they were moved to types/index.ts, 
// otherwise they are implicitly part of DashboardStats from api.ts

// Mock API services
jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'), // Preserve other exports
  fetchDashboardStats: jest.fn(),
  fetchSystemHealth: jest.fn(),
}));

// Mock chart components
jest.mock('react-chartjs-2', () => ({
  Line: (props: any) => <div data-testid="mock-line-chart" data-chart-title={props.options?.plugins?.title?.text}>Line Chart</div>,
  Bar: (props: any) => <div data-testid="mock-bar-chart" data-chart-title={props.options?.plugins?.title?.text}>Bar Chart</div>,
  Pie: (props: any) => <div data-testid="mock-pie-chart" data-chart-title={props.options?.plugins?.title?.text}>Pie Chart</div>,
}));

const mockFetchDashboardStats = fetchDashboardStats as jest.MockedFunction<typeof fetchDashboardStats>;
const mockFetchSystemHealth = fetchSystemHealth as jest.MockedFunction<typeof fetchSystemHealth>;

// Default mock data structures
const baseMockSystemHealth: SystemHealth = {
  api_status: 'OK',
  db_connection: 'OK',
};

const baseMockDashboardStats: DashboardStats = {
  total_users: 0,
  total_software_titles: 0,
  recent_activities: [] as RecentActivityItem[],
  recent_additions: [] as RecentAdditionItem[],
  popular_downloads: [] as PopularDownloadItem[],
  documents_per_software: [] as DocumentsPerSoftwareItem[],
  user_activity_trends: {
    logins: { daily: [], weekly: [] },
    uploads: { daily: [], weekly: [] },
  },
  total_storage_utilized_bytes: 0,
  download_trends: {
    daily: [],
    weekly: [],
  },
  content_health: {
    missing_descriptions: {
      documents: { missing: 0, total: 0 },
      patches: { missing: 0, total: 0 },
      links: { missing: 0, total: 0 },
      misc_categories: { missing: 0, total: 0 },
      software: { missing: 0, total: 0 },
      misc_files: { missing: 0, total: 0 },
    },
    stale_content: {
      documents: { stale: 0, total: 0 },
      patches: { stale: 0, total: 0 },
      links: { stale: 0, total: 0 },
      misc_files: { stale: 0, total: 0 },
      versions: { stale: 0, total: 0 },
      misc_categories: { stale: 0, total: 0 },
    },
  },
};


describe('AdminDashboardPage', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockFetchDashboardStats.mockReset();
    mockFetchSystemHealth.mockReset();
  });

  const renderPage = () => render(
    <MemoryRouter>
      <AdminDashboardPage />
    </MemoryRouter>
  );

  test('displays loading indicator while fetching data', () => {
    mockFetchDashboardStats.mockReturnValue(new Promise(() => {})); // Pending promise
    mockFetchSystemHealth.mockReturnValue(new Promise(() => {}));   // Pending promise
    renderPage();
    expect(screen.getByText(/Loading Dashboard Data.../i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  test('displays error message if fetching dashboard stats fails', async () => {
    mockFetchDashboardStats.mockRejectedValueOnce(new Error('Failed to fetch stats'));
    mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Error loading dashboard statistics: Failed to fetch stats/i)).toBeInTheDocument();
    });
  });

  test('displays error message if fetching system health fails', async () => {
    mockFetchDashboardStats.mockResolvedValueOnce(baseMockDashboardStats);
    mockFetchSystemHealth.mockRejectedValueOnce(new Error('Failed to fetch health'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Error loading system health: Failed to fetch health/i)).toBeInTheDocument();
    });
  });

  describe('User Activity Trends Widgets', () => {
    it('renders Daily Logins chart with data', async () => {
      const mockStats: DashboardStats = {
        ...baseMockDashboardStats,
        user_activity_trends: {
          ...baseMockDashboardStats.user_activity_trends!,
          logins: { daily: [{ date: '2023-01-01', count: 5 }], weekly: [] },
        },
      };
      mockFetchDashboardStats.mockResolvedValueOnce(mockStats);
      mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Daily Logins (Last 7 Days)')).toBeInTheDocument();
        expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument();
      });
    });

    it('renders Daily Uploads chart with data', async () => {
      const mockStats: DashboardStats = {
        ...baseMockDashboardStats,
        user_activity_trends: {
          ...baseMockDashboardStats.user_activity_trends!,
          uploads: { daily: [{ date: '2023-01-01', count: 3 }], weekly: [] },
        },
      };
      mockFetchDashboardStats.mockResolvedValueOnce(mockStats);
      mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Daily Uploads (Last 7 Days)')).toBeInTheDocument();
        expect(screen.getByTestId('mock-line-chart')).toBeInTheDocument(); // Will find multiple, need to be specific if testing props
      });
    });
    
    it('shows "No data available" for Daily Logins if data is empty', async () => {
        mockFetchDashboardStats.mockResolvedValueOnce({
            ...baseMockDashboardStats,
            user_activity_trends: { ...baseMockDashboardStats.user_activity_trends!, logins: { daily: [], weekly: [] } },
        });
        mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
        renderPage();
        await waitFor(() => {
            expect(screen.getByText('Daily Logins (Last 7 Days)')).toBeInTheDocument();
            expect(screen.getByText('No login trend data available.')).toBeInTheDocument();
        });
    });
  });

  describe('Storage Utilization Widget', () => {
    it('displays formatted storage size', async () => {
      mockFetchDashboardStats.mockResolvedValueOnce({ ...baseMockDashboardStats, total_storage_utilized_bytes: 1234567890 }); // Approx 1.23 GB
      mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Total Storage Utilized')).toBeInTheDocument();
        expect(screen.getByText('1.15 GB')).toBeInTheDocument(); // 1234567890 bytes = 1.15 GB
      });
    });

    it('displays "0 Bytes" for zero storage', async () => {
      mockFetchDashboardStats.mockResolvedValueOnce({ ...baseMockDashboardStats, total_storage_utilized_bytes: 0 });
      mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('0 Bytes')).toBeInTheDocument();
      });
    });

    it('displays "N/A" for null storage', async () => {
      mockFetchDashboardStats.mockResolvedValueOnce({ ...baseMockDashboardStats, total_storage_utilized_bytes: null });
      mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('N/A')).toBeInTheDocument();
      });
    });
  });

  describe('Download Trends Widget', () => {
    it('renders Daily Downloads chart with data', async () => {
      mockFetchDashboardStats.mockResolvedValueOnce({ 
        ...baseMockDashboardStats, 
        download_trends: { daily: [{ date: '2023-01-01', count: 10 }], weekly:[] } 
      });
      mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Daily Downloads (Last 7 Days)')).toBeInTheDocument();
        // This will find multiple charts if they are all Line charts.
        // If distinct testids per chart type are needed, mock should be more specific.
        expect(screen.getAllByTestId('mock-line-chart').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows "No data available" for Daily Downloads if data is empty', async () => {
        mockFetchDashboardStats.mockResolvedValueOnce({
            ...baseMockDashboardStats,
            download_trends: { daily: [], weekly: [] },
        });
        mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
        renderPage();
        await waitFor(() => {
            expect(screen.getByText('Daily Downloads (Last 7 Days)')).toBeInTheDocument();
            expect(screen.getByText('No download trend data available.')).toBeInTheDocument();
        });
    });
  });

  describe('Content Health Widgets', () => {
    it('Missing Descriptions: displays correct counts and totals', async () => {
      mockFetchDashboardStats.mockResolvedValueOnce({ 
        ...baseMockDashboardStats,
        content_health: {
          ...baseMockDashboardStats.content_health!,
          missing_descriptions: {
            ...baseMockDashboardStats.content_health!.missing_descriptions,
            documents: { missing: 2, total: 10 },
            software: { missing: 1, total: 5 },
          }
        }
      });
      mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Content: Missing Descriptions')).toBeInTheDocument();
        expect(screen.getByText(/Documents: 2 \/ 10 \(20.0%\)/i)).toBeInTheDocument();
        expect(screen.getByText(/Software: 1 \/ 5 \(20.0%\)/i)).toBeInTheDocument();
      });
    });

    it('Missing Descriptions: displays "No data available" if section is empty', async () => {
        mockFetchDashboardStats.mockResolvedValueOnce({ 
          ...baseMockDashboardStats,
          content_health: { ...baseMockDashboardStats.content_health!, missing_descriptions: {} as any } // Empty object
        });
        mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
        renderPage();
        await waitFor(() => {
          expect(screen.getByText('Content: Missing Descriptions')).toBeInTheDocument();
          expect(screen.getAllByText('No data available.')[0]).toBeInTheDocument(); // First "No data" for missing desc.
        });
    });

    it('Stale Content: displays correct counts and totals', async () => {
      mockFetchDashboardStats.mockResolvedValueOnce({ 
        ...baseMockDashboardStats,
        content_health: {
          ...baseMockDashboardStats.content_health!,
          stale_content: {
            ...baseMockDashboardStats.content_health!.stale_content,
            patches: { stale: 3, total: 15 },
            versions: { stale: 5, total: 20 },
          }
        }
      });
      mockFetchSystemHealth.mockResolvedValueOnce(baseMockSystemHealth);
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Content: Stale Items (Older than 1 year)')).toBeInTheDocument();
        expect(screen.getByText(/Patches: 3 \/ 15 \(20.0%\)/i)).toBeInTheDocument();
        expect(screen.getByText(/Versions: 5 \/ 20 \(25.0%\)/i)).toBeInTheDocument();
      });
    });
  });
});
