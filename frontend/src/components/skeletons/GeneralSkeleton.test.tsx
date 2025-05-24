import React from 'react';
import { render, screen } from '@testing-library/react';
import GeneralSkeleton from './GeneralSkeleton'; // Component to test

describe('GeneralSkeleton Component', () => {
  const defaultBlocks = 3; // As per the component's default prop value

  // Helper function to check the internal structure of a single block
  const checkBlockStructure = (blockElement: HTMLElement) => {
    // Each block (div with class 'space-y-3 py-2') should have 3 children
    expect(blockElement.children).toHaveLength(3);
    
    const line1 = blockElement.children[0];
    const line2 = blockElement.children[1];
    const line3 = blockElement.children[2];

    expect(line1).toHaveClass('h-10', 'bg-gray-300', 'rounded', 'w-5/6');
    expect(line2).toHaveClass('h-6', 'bg-gray-200', 'rounded', 'w-full');
    expect(line3).toHaveClass('h-6', 'bg-gray-200', 'rounded', 'w-3/4');
  };

  describe('Default Rendering', () => {
    let animatedContainer: HTMLElement;
    let blockElements: HTMLElement[];

    beforeEach(() => {
      const { container } = render(<GeneralSkeleton />);
      // The structure is: rootDiv > animatedContainer > [blockElement, blockElement, ...]
      const rootDiv = container.firstChild as HTMLElement;
      animatedContainer = rootDiv.firstChild as HTMLElement;
      blockElements = Array.from(animatedContainer.children) as HTMLElement[];
    });

    it('renders the correct number of default blocks when blocks prop is not provided', () => {
      expect(blockElements).toHaveLength(defaultBlocks);
    });

    it('each default block has the expected internal structure and styling', () => {
      blockElements.forEach(block => {
        checkBlockStructure(block);
      });
    });
  });

  describe('Custom Block Count', () => {
    it('renders the specified number of blocks when blocks prop is provided', () => {
      const customBlocks = 5;
      const { container } = render(<GeneralSkeleton blocks={customBlocks} />);
      const rootDiv = container.firstChild as HTMLElement;
      const animatedContainer = rootDiv.firstChild as HTMLElement;
      const blockElements = Array.from(animatedContainer.children) as HTMLElement[];
      
      expect(blockElements).toHaveLength(customBlocks);
      blockElements.forEach(block => {
        checkBlockStructure(block);
      });
    });

    it('renders zero blocks when blocks prop is 0', () => {
      const { container } = render(<GeneralSkeleton blocks={0} />);
      const rootDiv = container.firstChild as HTMLElement;
      const animatedContainer = rootDiv.firstChild as HTMLElement;
      const blockElements = Array.from(animatedContainer.children) as HTMLElement[];
      expect(blockElements).toHaveLength(0);
    });
  });

  describe('Styling and Animation', () => {
    let rootDiv: HTMLElement;
    let animatedContainer: HTMLElement;
    let blockElements: HTMLElement[];

    beforeEach(() => {
      const { container } = render(<GeneralSkeleton />);
      rootDiv = container.firstChild as HTMLElement;
      animatedContainer = rootDiv.firstChild as HTMLElement;
      blockElements = Array.from(animatedContainer.children) as HTMLElement[];
    });

    it('main container has appropriate base styling', () => {
      expect(rootDiv).toHaveClass('p-4', 'w-full', 'mx-auto', 'rounded-md', 'shadow');
    });
    
    it('inner container holding blocks has animate-pulse and flex styling', () => {
      expect(animatedContainer).toHaveClass('animate-pulse', 'flex', 'flex-col', 'space-y-4');
    });

    it('each block container has correct spacing classes', () => {
        blockElements.forEach(block => {
            expect(block).toHaveClass('space-y-3', 'py-2');
        });
    });

    // The animate-pulse is on the parent `animatedContainer`.
    // Individual line styling (bg-color, h, w, rounded) is checked by checkBlockStructure.
  });
});
