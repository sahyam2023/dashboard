import React from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import LoadingState from './LoadingState';

// 1. Define/Update Props
export interface ColumnDef<T> {
  key: keyof T | string; // Accessor key for the data
  header: string;        // Column header text
  render?: (item: T) => React.ReactNode; // Custom render function
  sortable?: boolean;     // Is the column sortable?
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  isLoading?: boolean;
  // Pagination Props
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemsPerPage?: number; // Optional
  totalItems?: number;   // Optional
  // Sorting Props
  sortColumn: string | null;
  sortOrder: 'asc' | 'desc' | null;
  onSort: (columnKey: string) => void;
}

const DataTable = <T extends Record<string, any>>({
  data,
  columns,
  isLoading = false,
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage, // Not used in rendering logic directly, but available if needed
  totalItems,   // Not used in rendering logic directly, but available if needed
  sortColumn,
  sortOrder,
  onSort,
}: DataTableProps<T>) => {
  if (isLoading) {
    return (
      <LoadingState type="table" count={itemsPerPage || 5} message="Loading entries..." />
    );
  }

  // Add this check for undefined data
  if (!data && !isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <p className="text-gray-500">No data available (data is undefined)</p> 
      </div>
    );
  }

  if (data.length === 0 && !isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg shadow-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((column) => (
                <th
                  key={column.key as string}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {column.sortable ? (
                    <button
                      onClick={() => onSort(column.key as string)}
                      className="flex items-center space-x-1 hover:text-gray-700 focus:outline-none"
                    >
                      <span>{column.header}</span>
                      {sortColumn === column.key && (
                        sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((item, index) => (
              <tr key={item.id || index} className="hover:bg-gray-50 transition-colors"> {/* Use item.id if available */}
                {columns.map((column) => (
                  <td key={column.key as string} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {column.render ? column.render(item) : item[column.key as keyof T]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 3. Implement Pagination UI and Logic */}
      {totalPages > 0 && (
        <div className="py-4 flex items-center justify-between bg-white px-4 rounded-b-lg shadow-sm border-t border-gray-200">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{totalPages}</span>
                {totalItems && itemsPerPage && (
                     <span className="ml-2">
                        (Showing {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}
                        - {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} items)
                     </span>
                )}
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => onPageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                {/* Basic Page Numbers - could be expanded */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5 && currentPage > 3) {
                        pageNum = currentPage - 2 + i;
                        if (pageNum > totalPages - 2 && totalPages > 5) pageNum = totalPages - 4 + i; // ensure last 5 pages are shown
                    }
                    if (pageNum < 1 || pageNum > totalPages) return null; // Don't render invalid page numbers

                    return (
                         <button
                            key={pageNum}
                            onClick={() => onPageChange(pageNum)}
                            aria-current={currentPage === pageNum ? 'page' : undefined}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium
                                ${currentPage === pageNum 
                                    ? 'z-10 bg-blue-50 border-blue-500 text-blue-600' 
                                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                }`}
                         >
                            {pageNum}
                         </button>
                    );
                })}
                <button
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;