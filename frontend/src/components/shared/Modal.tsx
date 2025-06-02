import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  showCloseButton?: boolean; // Added this prop
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  showCloseButton = true // Default to true
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-start px-4 pt-12"> {/* Changed items-center to items-start, added pt-12 */}
      <div className="relative mx-auto p-4 sm:p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white dark:bg-gray-800 overflow-y-auto max-h-[calc(90vh-3rem)]"> {/* Adjusted max-h to account for pt-12. 3rem is 48px. */}
        <div className="text-center"> {/* Removed mt-3 */}
          {title && (
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
          )}
          {/* Changed text-center to text-left for form/children content consistency */}
          <div className="text-left">
            {children}
          </div>
          {showCloseButton && ( // Conditionally render the close button section
            <div className="items-center px-4 py-3 mt-5 sm:mt-6 border-t border-gray-200 dark:border-gray-700">
              <button
                id="modal-close-button" // Changed id for clarity
                className="px-4 py-2 bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200 text-base font-medium rounded-md w-auto shadow-sm hover:bg-gray-300 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal;
