import React from 'react';
import { render, screen } from '@testing-library/react';
import CardListSkeleton from './CardListSkeleton'; // Component to test

// Mock CardSkeleton component
// The mock should be an ES module with a default export if the original is.
// The original CardSkeleton.tsx is: export default CardSkeleton;
// So the mock should be: jest.mock('./CardSkeleton', () => ({ __esModule: true, default: () => <div data-testid="mock-card-skeleton">Mock Card</div> }));
// However, the simpler form often works with Jest's automocking or if the component is imported as `import CardSkeleton from './CardSkeleton'`.
// Let's use the more robust __esModule: true version.

jest.mock('./CardSkeleton', () => ({
  __esModule: true, // This is important for ES6 modules
  default: () => <div data-testid="mock-card-skeleton">Mock Card</div>
}));

describe('CardListSkeleton Component', () => {
  describe('Default Rendering', () => {
    it('renders the default number of CardSkeleton components (3) when count is not provided', () => {
      render(<CardListSkeleton />);
      const mockCards = screen.getAllByTestId('mock-card-skeleton');
      expect(mockCards).toHaveLength(3);
      mockCards.forEach(card => {
        expect(card).toHaveTextContent('Mock Card');
      });
    });
  });

  describe('Custom Count', () => {
    it('renders the specified number of CardSkeleton components when count prop is provided', () => {
      const customCount = 5;
      render(<CardListSkeleton count={customCount} />);
      const mockCards = screen.getAllByTestId('mock-card-skeleton');
      expect(mockCards).toHaveLength(customCount);
    });

    it('renders zero CardSkeleton components when count is 0', () => {
      render(<CardListSkeleton count={0} />);
      const mockCards = screen.queryAllByTestId('mock-card-skeleton');
      expect(mockCards).toHaveLength(0);
    });
  });

  describe('Layout and Styling', () => {
    let container: HTMLElement;
    beforeEach(() => {
        const { container: renderedContainer } = render(<CardListSkeleton />);
        // The CardListSkeleton renders a single div as its root.
        container = renderedContainer.firstChild as HTMLElement;
    });

    it('list container has appropriate flexbox styling for layout', () => {
      expect(container).toHaveClass('flex', 'flex-wrap', 'justify-start', '-m-2');
    });

    it('each child item wrapper has appropriate padding and width classes', () => {
      // Render with at least one item to check the wrapper
      const { getAllByTestId } = render(<CardListSkeleton count={1} />);
      const mockCard = getAllByTestId('mock-card-skeleton')[0];
      // The mock card is inside a div wrapper
      const wrapperDiv = mockCard.parentElement; 
      expect(wrapperDiv).toBeInTheDocument();
      expect(wrapperDiv).toHaveClass('p-2', 'w-full', 'sm:w-1/2', 'md:w-1/3', 'lg:w-1/4');
    });
  });
});
