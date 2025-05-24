import React from 'react';

interface GeneralSkeletonProps {
  blocks?: number;
}

const GeneralSkeleton: React.FC<GeneralSkeletonProps> = ({ blocks = 3 }) => {
  return (
    <div className="p-4 w-full mx-auto rounded-md shadow">
      <div className="animate-pulse flex flex-col space-y-4">
        {Array.from({ length: blocks }).map((_, index) => (
          <div key={index} className="space-y-3 py-2"> {/* Added py-2 for spacing between blocks */}
            <div className="h-10 bg-gray-300 rounded w-5/6"></div>
            <div className="h-6 bg-gray-200 rounded w-full"></div>
            <div className="h-6 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GeneralSkeleton;
