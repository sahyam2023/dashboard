//src/components/LinkCard.tsx
import React from 'react';
import { Link as LinkType } from '../types';
import { ExternalLink } from 'lucide-react';

interface LinkCardProps {
  link: LinkType;
}

const LinkCard: React.FC<LinkCardProps> = ({ link }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="p-5">
        <div className="flex justify-between items-start">
          <h3 className="font-medium text-lg text-gray-900 mb-1">{link.title}</h3>
          <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full">
            {link.software_name}
          </span>
        </div>
        
        <p className="text-gray-600 text-sm mb-4">{link.description}</p>
        
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {link.category}
          </span>
          
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
          >
            Visit Link
            <ExternalLink size={14} className="ml-1" />
          </a>
        </div>
      </div>
    </div>
  );
};

export default LinkCard;