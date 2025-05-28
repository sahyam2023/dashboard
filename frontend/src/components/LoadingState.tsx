import React from 'react';
import TableSkeleton from './skeletons/TableSkeleton';
import CardListSkeleton from './skeletons/CardListSkeleton';
import GeneralSkeleton from './skeletons/GeneralSkeleton'; // Assuming this exists

interface LoadingStateProps {
  message?: string;
  type?: 'table' | 'cardList' | 'general';
  count?: number; // Number of skeleton rows/cards/blocks
}

const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading data...',
  type,
  count
}) => {

  const renderSkeleton = () => {
    switch (type) {
      case 'table':
        return <TableSkeleton rows={count} />;
      case 'cardList':
        return <CardListSkeleton count={count} />;
      case 'general':
      default:
        // Default to a GeneralSkeleton if type is not specified or recognized
        return <GeneralSkeleton blocks={count} />;
    }
  };

  return (
    // The container for the loading state message and skeleton.
    // It has a white background in light mode and a dark gray background in dark mode.
    <div className="w-full flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      {renderSkeleton()}
      {/* The loading message text will be gray-600 in light mode and gray-300 in dark mode */}
      <p className="text-gray-600 dark:text-gray-300 mt-4">{message}</p>
    </div>
  );
};

export default LoadingState;