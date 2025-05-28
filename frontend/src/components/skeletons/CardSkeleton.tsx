import React from 'react';

const CardSkeleton: React.FC = () => {
  return (
    // In light mode: white background with light border.
    // In dark mode: gray-800 background with darker border.
    <div className="p-4 w-full mx-auto rounded-md shadow border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700">
      <div className="animate-pulse flex flex-col space-y-4">
        {/* Title Placeholder */}
        {/* In light mode: bg-gray-300. In dark mode: dark:bg-gray-600. */}
        <div className="h-6 bg-gray-300 rounded w-3/4 dark:bg-gray-600"></div>

        {/* Content Placeholder Lines */}
        <div className="space-y-2">
          {/* In light mode: bg-gray-200. In dark mode: dark:bg-gray-700. */}
          <div className="h-4 bg-gray-200 rounded w-full dark:bg-gray-700"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6 dark:bg-gray-700"></div>
          <div className="h-4 bg-gray-200 rounded w-full dark:bg-gray-700"></div>
        </div>

        {/* Optional: A button-like placeholder */}
        {/* In light mode: bg-gray-300. In dark mode: dark:bg-gray-600. */}
        <div className="h-8 bg-gray-300 rounded w-1/3 self-end dark:bg-gray-600"></div>
      </div>
    </div>
  );
};

export default CardSkeleton;