import React from 'react';

const CardSkeleton: React.FC = () => {
  return (
    <div className="p-4 w-full mx-auto rounded-md shadow border border-gray-200">
      <div className="animate-pulse flex flex-col space-y-4">
        {/* Title Placeholder */}
        <div className="h-6 bg-gray-300 rounded w-3/4"></div>
        
        {/* Content Placeholder Lines */}
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
        </div>
        
        {/* Optional: A button-like placeholder */}
        <div className="h-8 bg-gray-300 rounded w-1/3 self-end"></div>
      </div>
    </div>
  );
};

export default CardSkeleton;
