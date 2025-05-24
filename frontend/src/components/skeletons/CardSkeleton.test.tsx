import React from 'react';
import { render, screen } from '@testing-library/react';
import CardSkeleton from './CardSkeleton'; // Component to test

describe('CardSkeleton Component', () => {
  let container: HTMLElement;

  beforeEach(() => {
    const { container: renderedContainer } = render(<CardSkeleton />);
    // The CardSkeleton component renders a single div as its root.
    // This root div contains an inner div with animate-pulse and then the structure.
    container = renderedContainer.firstChild as HTMLElement;
  });

  describe('Structure Verification', () => {
    it('renders the main card container with correct base classes', () => {
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('p-4', 'w-full', 'mx-auto', 'rounded-md', 'shadow', 'border', 'border-gray-200');
    });

    it('renders the inner animated container', () => {
      const animatedContainer = container.firstChild as HTMLElement;
      expect(animatedContainer).toBeInTheDocument();
      expect(animatedContainer).toHaveClass('animate-pulse', 'flex', 'flex-col', 'space-y-4');
    });

    it('renders a title placeholder with correct styling', () => {
      const animatedContainer = container.firstChild as HTMLElement;
      const titlePlaceholder = animatedContainer.children[0]; // First child is the title
      expect(titlePlaceholder).toBeInTheDocument();
      expect(titlePlaceholder).toHaveClass('h-6', 'bg-gray-300', 'rounded', 'w-3/4');
    });

    it('renders content line placeholders with correct styling', () => {
      const animatedContainer = container.firstChild as HTMLElement;
      const contentLinesContainer = animatedContainer.children[1]; // Second child is the space-y-2 div for content lines
      expect(contentLinesContainer).toBeInTheDocument();
      expect(contentLinesContainer).toHaveClass('space-y-2');
      
      const contentLine1 = contentLinesContainer.children[0];
      const contentLine2 = contentLinesContainer.children[1];
      const contentLine3 = contentLinesContainer.children[2];

      expect(contentLine1).toHaveClass('h-4', 'bg-gray-200', 'rounded', 'w-full');
      expect(contentLine2).toHaveClass('h-4', 'bg-gray-200', 'rounded', 'w-5/6');
      expect(contentLine3).toHaveClass('h-4', 'bg-gray-200', 'rounded', 'w-full');
    });

    it('renders a button-like placeholder with correct styling', () => {
      const animatedContainer = container.firstChild as HTMLElement;
      const buttonPlaceholder = animatedContainer.children[2]; // Third child is the button placeholder
      expect(buttonPlaceholder).toBeInTheDocument();
      expect(buttonPlaceholder).toHaveClass('h-8', 'bg-gray-300', 'rounded', 'w-1/3', 'self-end');
    });
  });

  describe('Styling/Animation', () => {
    it('ensures the main animated container has animate-pulse class', () => {
      const animatedContainer = container.firstChild as HTMLElement;
      expect(animatedContainer).toHaveClass('animate-pulse');
    });

    // Individual elements' styling (bg-color, h, w, rounded) are checked in Structure Verification.
    // animate-pulse is on the parent of these elements, so all children effectively pulse.
  });
});
