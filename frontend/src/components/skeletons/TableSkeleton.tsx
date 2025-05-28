import React from 'react';

interface TableSkeletonProps {
  rows?: number;
}

const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 3 }) => {
  return (
    // This container doesn't explicitly need a bg-color here if LoadingState wrapper provides it.
    // However, if used standalone, you might add a bg-color.
    <div className="p-4 w-full mx-auto rounded-md shadow">
      {/* Header Placeholder */}
      <div className="animate-pulse flex space-x-4 mb-4">
        {/* In light mode: bg-gray-200. In dark mode: dark:bg-gray-700. */}
        <div className="h-8 bg-gray-200 rounded flex-1 dark:bg-gray-700"></div>
        <div className="h-8 bg-gray-200 rounded flex-1 dark:bg-gray-700"></div>
        <div className="h-8 bg-gray-200 rounded flex-1 dark:bg-gray-700"></div>
        <div className="h-8 bg-gray-200 rounded flex-1 dark:bg-gray-700"></div>
      </div>

      {/* Data Row Placeholders */}
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="animate-pulse flex space-x-4 mb-2">
          {/* In light mode: bg-gray-300. In dark mode: dark:bg-gray-600. */}
          <div className="h-8 bg-gray-300 rounded flex-1 dark:bg-gray-600"></div>
          <div className="h-8 bg-gray-300 rounded flex-1 dark:bg-gray-600"></div>
          <div className="h-8 bg-gray-300 rounded flex-1 dark:bg-gray-600"></div>
          <div className="h-8 bg-gray-300 rounded flex-1 dark:bg-gray-600"></div>
        </div>
      ))}
    </div>
  );
};

export default TableSkeleton;