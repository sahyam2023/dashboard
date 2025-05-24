import React, { useState, useEffect, useCallback } from 'react';
import { FiChevronDown, FiChevronUp, FiFilter, FiLoader, FiAlertTriangle } from 'react-icons/fi'; // Using react-icons
import { fetchAuditLogEntries, AuditLogResponse, AuditLogEntry } from '../../../services/api';

// --- TypeScript Interfaces ---
// AuditLogEntry and AuditLogResponse are now imported from api.ts

interface Filters {
  user_id: string;
  username: string;
  action_type: string;
  target_table: string;
  date_from: string;
  date_to: string;
}

// --- Component ---
const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(15);
  const [totalLogs, setTotalLogs] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [sortBy, setSortBy] = useState<string>('timestamp');
  const [sortOrder, setSortOrder] = useState<string>('desc');

  const [filters, setFilters] = useState<Filters>({
    user_id: '',
    username: '',
    action_type: '',
    target_table: '',
    date_from: '',
    date_to: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<Filters>(filters);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [showFilters, setShowFilters] = useState<boolean>(false);

  const fetchAuditLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: currentPage.toString(),
      per_page: perPage.toString(),
      sort_by: sortBy,
      sort_order: sortOrder,
    });

    if (appliedFilters.user_id) params.append('user_id', appliedFilters.user_id);
    if (appliedFilters.username) params.append('username', appliedFilters.username);
    if (appliedFilters.action_type) params.append('action_type', appliedFilters.action_type);
    if (appliedFilters.target_table) params.append('target_table', appliedFilters.target_table);
    if (appliedFilters.date_from) params.append('date_from', appliedFilters.date_from);
    if (appliedFilters.date_to) params.append('date_to', appliedFilters.date_to);

    try {
      const data: AuditLogResponse = await fetchAuditLogEntries(params);
      setLogs(data.logs);
      setCurrentPage(data.page);
      setPerPage(data.per_page);
      setTotalLogs(data.total_logs);
      setTotalPages(data.total_pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      setLogs([]); // Clear logs on error
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, perPage, sortBy, sortOrder, appliedFilters]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    // Fetch will be triggered by useEffect dependency change
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleApplyFilters = () => {
    setAppliedFilters(filters);
    setCurrentPage(1); // Reset to first page when filters change
    // Fetch will be triggered by useEffect dependency change on appliedFilters
  };
  
  const handleClearFilters = () => {
    const clearedFilters = {
      user_id: '',
      username: '',
      action_type: '',
      target_table: '',
      date_from: '',
      date_to: '',
    };
    setFilters(clearedFilters);
    setAppliedFilters(clearedFilters);
    setCurrentPage(1);
  };

  const renderDetails = (details: string | null) => {
    if (!details) return <span className="text-gray-500">N/A</span>;
    try {
      const parsed = JSON.parse(details);
      return <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">{JSON.stringify(parsed, null, 2)}</pre>;
    } catch (e) {
      // If not JSON, display as plain text
      return <span className="text-sm">{details}</span>;
    }
  };
  
  const SortIcon: React.FC<{ column: string }> = ({ column }) => {
    if (sortBy !== column) return <FiChevronDown className="inline ml-1 text-gray-400" />;
    return sortOrder === 'asc' ? <FiChevronUp className="inline ml-1" /> : <FiChevronDown className="inline ml-1" />;
  };

  // --- JSX ---
  return (
    <div className="container mx-auto p-4 bg-white shadow-lg rounded-lg">
      <h1 className="text-2xl font-semibold mb-6 text-gray-700">Audit Logs</h1>

      <button
        onClick={() => setShowFilters(!showFilters)}
        className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center"
      >
        <FiFilter className="mr-2" /> {showFilters ? 'Hide' : 'Show'} Filters
      </button>

      {showFilters && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 p-4 border rounded-md bg-gray-50">
          {/* User ID */}
          <div>
            <label htmlFor="user_id" className="block text-sm font-medium text-gray-700">User ID</label>
            <input
              type="number"
              name="user_id"
              id="user_id"
              value={filters.user_id}
              onChange={handleFilterChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          {/* Username */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">Username</label>
            <input
              type="text"
              name="username"
              id="username"
              value={filters.username}
              onChange={handleFilterChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          {/* Action Type */}
          <div>
            <label htmlFor="action_type" className="block text-sm font-medium text-gray-700">Action Type</label>
            <input
              type="text"
              name="action_type"
              id="action_type"
              value={filters.action_type}
              onChange={handleFilterChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          {/* Target Table */}
          <div>
            <label htmlFor="target_table" className="block text-sm font-medium text-gray-700">Target Table</label>
            <input
              type="text"
              name="target_table"
              id="target_table"
              value={filters.target_table}
              onChange={handleFilterChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          {/* Date From */}
          <div>
            <label htmlFor="date_from" className="block text-sm font-medium text-gray-700">Date From</label>
            <input
              type="date"
              name="date_from"
              id="date_from"
              value={filters.date_from}
              onChange={handleFilterChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          {/* Date To */}
          <div>
            <label htmlFor="date_to" className="block text-sm font-medium text-gray-700">Date To</label>
            <input
              type="date"
              name="date_to"
              id="date_to"
              value={filters.date_to}
              onChange={handleFilterChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <div className="col-span-1 md:col-span-2 lg:col-span-3 flex justify-end space-x-2 mt-2">
            <button
              onClick={handleApplyFilters}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Apply Filters
            </button>
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center items-center p-6">
          <FiLoader className="animate-spin text-4xl text-blue-500" />
          <span className="ml-2 text-lg text-gray-600">Loading logs...</span>
        </div>
      )}
      {error && (
        <div className="flex items-center p-4 mb-4 text-red-700 bg-red-100 rounded-lg" role="alert">
          <FiAlertTriangle className="text-2xl mr-3"/>
          <span className="font-medium">Error:</span> {error}
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['id', 'timestamp', 'user_id', 'username', 'action_type', 'target_table', 'target_id'].map((col) => (
                    <th
                      key={col}
                      scope="col"
                      onClick={() => handleSort(col)}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      {col.replace('_', ' ')} <SortIcon column={col} />
                    </th>
                  ))}
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.length > 0 ? logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.user_id ?? 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.username ?? 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.action_type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.target_table ?? 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.target_id ?? 'N/A'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{renderDetails(log.details)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                      No audit logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalLogs > 0 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing <span className="font-medium">{(currentPage - 1) * perPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * perPage, totalLogs)}</span> of <span className="font-medium">{totalLogs}</span> results
              </div>
              <div className="space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1 || isLoading}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages || isLoading}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AuditLogViewer;
