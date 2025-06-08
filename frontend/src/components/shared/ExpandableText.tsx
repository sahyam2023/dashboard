// frontend/src/components/shared/ExpandableText.tsx
import React, { useState, useMemo } from 'react';

interface ExpandableTextProps {
  text: string | null | undefined;
  charLimit?: number;
  className?: string; // Allow passing additional class names for the container
}

const DEFAULT_CHAR_LIMIT = 100; // Default character limit for truncation

const ExpandableText: React.FC<ExpandableTextProps> = ({
  text,
  charLimit = DEFAULT_CHAR_LIMIT,
  className = 'text-sm text-gray-600 dark:text-gray-300 block max-w-xs', // Default styling from views
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const fullText = text || '-'; // Display '-' if text is null or undefined

  const isTruncatable = useMemo(() => fullText.length > charLimit, [fullText, charLimit]);

  const displayText = useMemo(() => {
    if (!isTruncatable || isExpanded) {
      return fullText;
    }
    return `${fullText.substring(0, charLimit)}...`;
  }, [fullText, charLimit, isExpanded, isTruncatable]);

  const toggleReadMore = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation(); // Prevent row click or other parent events
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={className}>
      <span style={{ whiteSpace: isExpanded ? 'normal' : 'nowrap', overflow: isExpanded ? 'visible' : 'hidden', textOverflow: isExpanded ? 'clip' : 'ellipsis' }}>
        {displayText}
      </span>
      {isTruncatable && (
        <button
          onClick={toggleReadMore}
          className="ml-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium focus:outline-none"
          aria-expanded={isExpanded}
        >
          {isExpanded ? 'Read Less' : 'Read More'}
        </button>
      )}
    </div>
  );
};

export default ExpandableText;
