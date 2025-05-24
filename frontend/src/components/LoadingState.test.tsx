import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingState from './LoadingState'; // Component to test

// Mock child skeleton components
jest.mock('./skeletons/GeneralSkeleton', () => ({
  __esModule: true, // This is important for ES6 modules
  default: ({ blocks }: { blocks?: number }) => <div data-testid="general-skeleton" data-blocks={blocks}>GeneralSkeleton</div>
}));

jest.mock('./skeletons/TableSkeleton', () => ({
  __esModule: true,
  default: ({ rows }: { rows?: number }) => <div data-testid="table-skeleton" data-rows={rows}>TableSkeleton</div>
}));

jest.mock('./skeletons/CardListSkeleton', () => ({
  __esModule: true,
  default: ({ count }: { count?: number }) => <div data-testid="card-list-skeleton" data-count={count}>CardListSkeleton</div>
}));


describe('LoadingState Component', () => {
  // Test 1: Default Rendering (General Skeleton)
  describe('Default Rendering (General Skeleton)', () => {
    it('renders GeneralSkeleton when no type prop is provided', () => {
      render(<LoadingState />);
      expect(screen.getByTestId('general-skeleton')).toBeInTheDocument();
      expect(screen.getByText('GeneralSkeleton')).toBeInTheDocument(); // Check content from mock
    });

    it('displays the default message "Loading data..." when no message prop is provided', () => {
      render(<LoadingState />);
      expect(screen.getByText('Loading data...')).toBeInTheDocument();
    });

    it('passes the count prop to GeneralSkeleton as blocks', () => {
      render(<LoadingState count={2} />);
      const generalSkeleton = screen.getByTestId('general-skeleton');
      expect(generalSkeleton).toBeInTheDocument();
      expect(generalSkeleton).toHaveAttribute('data-blocks', '2');
    });

    it('GeneralSkeleton uses its own default for blocks if count is not provided', () => {
      render(<LoadingState />);
      const generalSkeleton = screen.getByTestId('general-skeleton');
      expect(generalSkeleton).toBeInTheDocument();
      // Check if data-blocks attribute is not set, or is set to the default of GeneralSkeleton (which is 3)
      // The mock doesn't implement the default, so it will be undefined if not passed.
      // The actual GeneralSkeleton component has a default of 3 for its 'blocks' prop.
      // Our mock will receive `undefined` for `blocks` if `count` is not passed to LoadingState.
      expect(generalSkeleton).not.toHaveAttribute('data-blocks');
    });
  });

  // Test 2: Table Skeleton Rendering
  describe('Table Skeleton Rendering', () => {
    it('renders TableSkeleton when type="table" is provided', () => {
      render(<LoadingState type="table" />);
      expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
      expect(screen.getByText('TableSkeleton')).toBeInTheDocument();
    });

    it('passes the count prop to TableSkeleton as rows', () => {
      render(<LoadingState type="table" count={5} />);
      const tableSkeleton = screen.getByTestId('table-skeleton');
      expect(tableSkeleton).toBeInTheDocument();
      expect(tableSkeleton).toHaveAttribute('data-rows', '5');
    });
    
    it('TableSkeleton uses its own default for rows if count is not provided', () => {
      render(<LoadingState type="table" />);
      const tableSkeleton = screen.getByTestId('table-skeleton');
      expect(tableSkeleton).toBeInTheDocument();
      // Similar to GeneralSkeleton, our mock will receive `undefined` for `rows`
      expect(tableSkeleton).not.toHaveAttribute('data-rows');
    });

    it('displays the custom message when a message prop is provided', () => {
      render(<LoadingState type="table" message="Loading table data..." />);
      expect(screen.getByText('Loading table data...')).toBeInTheDocument();
    });
  });

  // Test 3: CardList Skeleton Rendering
  describe('CardList Skeleton Rendering', () => {
    it('renders CardListSkeleton when type="cardList" is provided', () => {
      render(<LoadingState type="cardList" />);
      expect(screen.getByTestId('card-list-skeleton')).toBeInTheDocument();
      expect(screen.getByText('CardListSkeleton')).toBeInTheDocument();
    });

    it('passes the count prop to CardListSkeleton', () => {
      render(<LoadingState type="cardList" count={10} />);
      const cardListSkeleton = screen.getByTestId('card-list-skeleton');
      expect(cardListSkeleton).toBeInTheDocument();
      expect(cardListSkeleton).toHaveAttribute('data-count', '10');
    });

    it('CardListSkeleton uses its own default for count if count prop is not provided', () => {
      render(<LoadingState type="cardList" />);
      const cardListSkeleton = screen.getByTestId('card-list-skeleton');
      expect(cardListSkeleton).toBeInTheDocument();
      expect(cardListSkeleton).not.toHaveAttribute('data-count');
    });

    it('displays the custom message', () => {
      render(<LoadingState type="cardList" message="Loading cards..." />);
      expect(screen.getByText('Loading cards...')).toBeInTheDocument();
    });
  });

  // Test 4: Message Handling
  describe('Message Handling', () => {
    it('ensures the message is displayed correctly below the rendered skeleton', () => {
      render(<LoadingState message="Custom test message" />);
      const messageElement = screen.getByText('Custom test message');
      expect(messageElement).toBeInTheDocument();
      // Check it's a <p> tag and has the correct class for margin
      expect(messageElement.tagName).toBe('P');
      expect(messageElement).toHaveClass('text-gray-600 mt-4');
    });

    it('displays default message when message prop is empty string', () => {
      render(<LoadingState message="" />);
      expect(screen.getByText('Loading data...')).toBeInTheDocument();
    });
  });
});
