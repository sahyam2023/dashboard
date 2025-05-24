//src/components/LoadingState.tsx
import React from 'react';
import TableSkeleton from './skeletons/TableSkeleton';
import CardListSkeleton from './skeletons/CardListSkeleton';
import GeneralSkeleton from './skeletons/GeneralSkeleton';

interface LoadingStateProps {
  message?: string;
  type?: 'table' | 'cardList' | 'general';
  count?: number;
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
        return <GeneralSkeleton blocks={count} />;
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center py-12">
      {renderSkeleton()}
      <p className="text-gray-600 mt-4">{message}</p>
    </div>
  );
};

export default LoadingState;