import React, { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import LoadingState from './LoadingState';
import Modal from './shared/Modal'; // Assuming a Modal component exists

// 1. Define/Update Props
export interface ModalControlSetters {
  showModal: (description: string) => void;
}

export interface ColumnDef<T> {
  key: keyof T | string; // Accessor key for the data
  header: string;        // Column header text
  render?: (item: T, modalControls: ModalControlSetters) => React.ReactNode; // Updated signature
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
  rowClassName?: string | ((item: T, index: number) => string); // New prop
  highlightedRowId?: string | number | null; // Added for highlighting
  // Selection Props
  isSelectionEnabled?: boolean;
  selectedItemIds?: Set<number>;
  onSelectItem?: (itemId: number, isSelected: boolean) => void;
  onSelectAllItems?: (isSelected: boolean) => void;
}

// Ensure T has an 'id' property of type number for selection logic
const DataTable = <T extends { id: number }>({
  data,
  columns,
  isLoading = false,
  currentPage,
  totalPages,
  onPageChange,
  itemsPerPage, 
  totalItems,   
  sortColumn,
  sortOrder,
  onSort,
  rowClassName,
  // Selection Props
  isSelectionEnabled = false, // Default to false if not provided
  selectedItemIds = new Set(), // Default to an empty set
  onSelectItem,
  onSelectAllItems,
  highlightedRowId = null, // Added prop with default
}: DataTableProps<T>) => {
  const [showFullDescriptionModal, setShowFullDescriptionModal] = useState(false);
  const [fullDescription, setFullDescription] = useState('');
  const selectAllCheckboxRef = React.useRef<HTMLInputElement>(null);

  const modalControls: ModalControlSetters = {
    showModal: (description: string) => {
      setFullDescription(description);
      setShowFullDescriptionModal(true);
    }
  };

  React.useEffect(() => {
    if (isSelectionEnabled && selectAllCheckboxRef.current) {
      const visibleItemIds = data.map(item => item.id);
      const numSelected = visibleItemIds.filter(id => selectedItemIds.has(id)).length;
      
      if (numSelected === 0) {
        selectAllCheckboxRef.current.checked = false;
        selectAllCheckboxRef.current.indeterminate = false;
      } else if (numSelected === visibleItemIds.length && visibleItemIds.length > 0) {
        selectAllCheckboxRef.current.checked = true;
        selectAllCheckboxRef.current.indeterminate = false;
      } else {
        selectAllCheckboxRef.current.checked = false;
        selectAllCheckboxRef.current.indeterminate = true;
      }
    }
  }, [isSelectionEnabled, selectedItemIds, data]);


  if (isLoading) {
    return (
      <LoadingState type="table" count={itemsPerPage || 5} message="Loading entries..." />
    );
  }

  // Add this check for undefined data
  if (!data && !isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">No data available (data is undefined)</p> 
      </div>
    );
  }

  if (data.length === 0 && !isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">No data available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              {isSelectionEnabled && (
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    ref={selectAllCheckboxRef}
                    className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:checked:bg-blue-600 dark:checked:border-transparent"
                    onChange={(e) => {
                      if (onSelectAllItems) {
                        // If indeterminate or unchecked, next state is checked (select all)
                        // If checked, next state is unchecked (deselect all)
                        onSelectAllItems(e.target.checked);
                      }
                    }}
                    // Checked state is handled by useEffect and indeterminate logic
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key as string}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                >
                  {column.sortable ? (
                    <button
                      onClick={() => onSort(column.key as string)}
                      className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-100 focus:outline-none"
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
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {data.map((item, index) => {
              const customRowClass = typeof rowClassName === 'function' 
                ? rowClassName(item, index) 
                : rowClassName;
              const isSelected = selectedItemIds.has(item.id);
              
              return (
              <tr 
                key={item.id || index} 
                className={`transition-colors 
                            ${customRowClass || ''} 
                            ${isSelected ? 'bg-sky-100 dark:bg-sky-800 hover:bg-sky-200 dark:hover:bg-sky-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}
                            ${highlightedRowId !== null && String(item.id) === String(highlightedRowId) ? 'bg-yellow-200 dark:bg-yellow-700 ring-2 ring-yellow-500 ring-offset-1 dark:ring-offset-gray-800' : ''}`}
              >
                {isSelectionEnabled && (
                  <td className="px-4 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:checked:bg-blue-600 dark:checked:border-transparent"
                      checked={isSelected}
                      onChange={(e) => {
                        if (onSelectItem) {
                          onSelectItem(item.id, e.target.checked);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()} // Prevent row click if any defined by parent
                    />
                  </td>
                )}
                {columns.map((column) => {
                  // Branch 1: This is a 'description' column AND no custom column.render is provided.
                  // Apply special line-clamping and "Read More" button with correct truncation logic.
                  if (column.key === 'description' && !column.render) {
                    const descriptionRef = React.useRef<HTMLSpanElement>(null);
                    const [isTruncated, setIsTruncated] = React.useState(false);
                    const descriptionText = String(item[column.key as keyof T] ?? ''); 

                    useEffect(() => {
                      if (descriptionRef.current) {
                        // Corrected: For line-clamp, truncation occurs if scrollHeight > clientHeight
                        const { scrollHeight, clientHeight } = descriptionRef.current;
                        if (scrollHeight > clientHeight) {
                          setIsTruncated(true);
                        } else {
                          setIsTruncated(false);
                        }
                      }
                      // Dependencies: descriptionText ensures this runs if the text changes.
                      // data is included because table re-renders might require re-evaluation.
                      // item.id (or a unique key for the row) ensures the effect is specific to this row's content.
                    }, [descriptionText, data, item.id]); 

                    return (
                      <td key={`${column.key as string}-desc`} className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300"> {/* Removed whitespace-nowrap for description column */}
                        <div className="flex items-center justify-between">
                          <span
                            ref={descriptionRef}
                            className="block line-clamp-3" 
                          >
                            {descriptionText}
                          </span>
                          {isTruncated && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFullDescription(descriptionText); 
                                setShowFullDescriptionModal(true);
                              }}
                              className="ml-2 p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex-shrink-0"
                              title="Read More"
                            >
                              <Eye size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  }
                  
                  // Branch 2: All other cases:
                  // - Not a 'description' column.
                  // - Is a 'description' column BUT a custom column.render IS provided.
                  // In these cases, use the standard rendering path.
                  const cellContent = column.render 
                    ? column.render(item, modalControls) 
                    : String(item[column.key as keyof T] ?? '');
                  
                  let tdClassName = "px-6 py-4 text-sm text-gray-700 dark:text-gray-300";
                  if (column.key !== 'description') {
                    tdClassName += " whitespace-nowrap";
                  }

                  return (
                    <td key={column.key as string} className={tdClassName}>
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={showFullDescriptionModal}
        onClose={() => setShowFullDescriptionModal(false)}
        title="Full Description"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {fullDescription}
        </p>
      </Modal>

      {/* Pagination UI and Logic */}
      {totalPages > 0 && (
        <div className="py-4 flex items-center justify-between bg-white dark:bg-gray-800 px-4 rounded-b-lg shadow-sm border-t border-gray-200 dark:border-gray-700">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
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
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
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
                                    ? 'z-10 bg-blue-50 dark:bg-blue-800 border-blue-500 dark:border-blue-700 text-blue-600 dark:text-blue-300' 
                                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                                }`}
                         >
                            {pageNum}
                         </button>
                    );
                })}
                <button
                  onClick={() => onPageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
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