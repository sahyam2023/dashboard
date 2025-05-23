import React, { useState, useEffect, useCallback } from 'react';
import { AdminSoftwareVersion, PaginationParams } from '../../../services/api'; // Assuming types are in api.ts or a types file imported by api.ts
import { fetchAdminVersions } from '../../../services/api';
import DataTable from '../../DataTable'; // Adjust path as needed
import { FaEdit, FaTrash } from 'react-icons/fa';

interface AdminVersionsTableProps {
  onEdit: (version: AdminSoftwareVersion) => void;
  onDelete: (versionId: number) => void;
  refreshKey?: number;
  softwareIdFilter?: number | null; // Allow filtering by software ID
}

const AdminVersionsTable: React.FC<AdminVersionsTableProps> = ({ onEdit, onDelete, refreshKey, softwareIdFilter }) => {
  const [versions, setVersions] = useState<AdminSoftwareVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // Default, can be made configurable
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [sortBy, setSortBy] = useState<string>('version_number'); // Default sort
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: PaginationParams & { softwareId?: number } = {
        page: currentPage,
        perPage: itemsPerPage,
        sortBy,
        sortOrder,
      };
      if (softwareIdFilter !== undefined && softwareIdFilter !== null) { // Ensure softwareIdFilter is checked properly
        params.softwareId = softwareIdFilter;
      }
      const response = await fetchAdminVersions(params);
      setVersions(response.versions);
      setTotalPages(response.total_pages);
      setTotalItems(response.total_versions);
      setCurrentPage(response.page); // Ensure currentPage is updated from response
    } catch (err) {
      console.error("Error loading versions:", err);
      setError(err instanceof Error ? err.message : 'Failed to load versions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, itemsPerPage, sortBy, sortOrder, softwareIdFilter]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions, refreshKey]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleSortChange = (newSortBy: string) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
    setCurrentPage(1); // Reset to first page on sort change
  };

  const formatNullableDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    // Check if dateStr is a valid date string before creating a Date object
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) ? date.toLocaleDateString() : 'Invalid Date';
  };

  const truncateText = (text: string | null | undefined, maxLength: number = 50) => {
    if (!text) return 'N/A';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Define columns with the required 'key' property
  const columns = [
    { key: 'software_name', header: 'Software', accessor: 'software_name', sortable: true },
    { key: 'version_number', header: 'Version', accessor: 'version_number', sortable: true },
    { key: 'release_date', header: 'Release Date', accessor: 'release_date', sortable: true, render: (item: AdminSoftwareVersion) => formatNullableDate(item.release_date) },
    {
      key: 'main_download_link',
      header: 'Download Link',
      accessor: 'main_download_link',
      sortable: false, // Or true if backend supports sorting by it
      render: (item: AdminSoftwareVersion) =>
        item.main_download_link ? (
          <a href={item.main_download_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">
            Link
          </a>
        ) : 'N/A'
    },
    { key: 'changelog', header: 'Changelog', accessor: 'changelog', sortable: false, render: (item: AdminSoftwareVersion) => truncateText(item.changelog) },
    { key: 'known_bugs', header: 'Known Bugs', accessor: 'known_bugs', sortable: false, render: (item: AdminSoftwareVersion) => truncateText(item.known_bugs) },
    { key: 'created_at', header: 'Created At', accessor: 'created_at', sortable: true, render: (item: AdminSoftwareVersion) => formatNullableDate(item.created_at) },
    { key: 'updated_at', header: 'Updated At', accessor: 'updated_at', sortable: true, render: (item: AdminSoftwareVersion) => formatNullableDate(item.updated_at) },
    {
      key: 'actions', // Unique key for the actions column
      header: 'Actions',
      accessor: 'actions', // This accessor might just be an identifier; actual data isn't typically pulled via 'item.actions'
      render: (item: AdminSoftwareVersion) => (
        <div className="flex space-x-2">
          <button
            onClick={() => onEdit(item)}
            className="p-1 text-blue-600 hover:text-blue-800"
            aria-label="Edit Version"
          >
            <FaEdit />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1 text-red-600 hover:text-red-800"
            aria-label="Delete Version"
          >
            <FaTrash />
          </button>
        </div>
      ),
    },
  ];

  if (error) {
    return <div className="text-red-500 p-4">Error: {error}</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <DataTable
        columns={columns}
        data={versions}
        isLoading={isLoading}
        pagination={{
          currentPage,
          totalPages,
          totalItems,
          itemsPerPage,
          onPageChange: handlePageChange,
          onItemsPerPageChange: (num: number) => { // Fixed: num explicitly typed as number
            setItemsPerPage(num);
            setCurrentPage(1); // Reset to first page
          },
        }}
        sortColumn={sortBy}
        sortOrder={sortOrder}
        onSort={handleSortChange}
      />
    </div>
  );
};

export default AdminVersionsTable;