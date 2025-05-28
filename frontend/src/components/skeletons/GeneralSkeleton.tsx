import React from 'react';

interface GeneralSkeletonProps {
  blocks?: number;
}

const GeneralSkeleton: React.FC<GeneralSkeletonProps> = ({ blocks = 5 }) => {
  return (
    <div className="w-full px-4 max-w-lg mx-auto py-4">
      <div className="animate-pulse space-y-4">
        {Array.from({ length: blocks }).map((_, index) => (
          // In light mode: bg-gray-200. In dark mode: dark:bg-gray-700.
          // This ensures the skeleton bars are light gray on light background,
          // and darker gray on dark background.
          <div
            key={index}
            className={`h-6 rounded ${
              index % 2 === 0 ? 'w-full' : 'w-5/6'
            } bg-gray-200 dark:bg-gray-700`}
          ></div>
        ))}
      </div>
    </div>
  );
};

export default GeneralSkeleton;