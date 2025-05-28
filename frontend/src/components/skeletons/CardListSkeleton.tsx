import React from 'react';
import CardSkeleton from './CardSkeleton';

interface CardListSkeletonProps {
  count?: number;
}

const CardListSkeleton: React.FC<CardListSkeletonProps> = ({ count = 3 }) => {
  return (
    <div className="flex flex-wrap justify-start -m-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="p-2 w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
          <CardSkeleton />
        </div>
      ))}
    </div>
  );
};

export default CardListSkeleton;