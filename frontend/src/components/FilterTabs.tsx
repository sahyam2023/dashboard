//src/components/FilterTabs.tsx
import React from 'react';
import { Software } from '../types';

interface FilterTabsProps {
  software: Software[];
  selectedSoftwareId: number | null;
  onSelectFilter: (id: number | null) => void;
}

const FilterTabs: React.FC<FilterTabsProps> = ({ 
  software, 
  selectedSoftwareId, 
  onSelectFilter 
}) => {
  return (
    <div className="mb-6 border-b border-gray-200">
      <div className="flex flex-wrap items-center -mb-px">
        <button
          onClick={() => onSelectFilter(null)}
          className={`
            mr-4 py-3 px-4 text-sm font-medium border-b-2 transition-colors duration-150
            ${selectedSoftwareId === null 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
          `}
        >
          All
        </button>
        
        {software.map((sw) => (
          <button
            key={sw.id}
            onClick={() => onSelectFilter(sw.id)}
            className={`
              mr-4 py-3 px-4 text-sm font-medium border-b-2 transition-colors duration-150
              ${selectedSoftwareId === sw.id 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
            `}
          >
            {sw.name}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FilterTabs;