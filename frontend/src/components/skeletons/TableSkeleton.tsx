import React from 'react';

interface TableSkeletonProps {
  rows?: number;
}

const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 3 }) => {
  return (
    <div className="p-4 w-full mx-auto rounded-md shadow">
      {/* Header Placeholder */}
      <div className="animate-pulse flex space-x-4 mb-4">
        <div className="h-8 bg-gray-200 rounded flex-1"></div>
        <div className="h-8 bg-gray-200 rounded flex-1"></div>
        <div className="h-8 bg-gray-200 rounded flex-1"></div>
        <div className="h-8 bg-gray-200 rounded flex-1"></div>
      </div>

      {/* Data Row Placeholders */}
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="animate-pulse flex space-x-4 mb-2">
          <div className="h-8 bg-gray-300 rounded flex-1"></div>
          <div className="h-8 bg-gray-300 rounded flex-1"></div>
          <div className="h-8 bg-gray-300 rounded flex-1"></div>
          <div className="h-8 bg-gray-300 rounded flex-1"></div>
        </div>
      ))}
    </div>
  );
};

export default TableSkeleton;
