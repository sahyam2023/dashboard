// src/components/shared/ConfirmationModal.tsx
import React from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming?: boolean;
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmButtonVariant?: 'primary' | 'danger' | 'warning';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  isConfirming = false,
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  confirmButtonVariant = 'primary',
}) => {
  if (!isOpen) return null;

  let confirmButtonClasses = "px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2";
  if (confirmButtonVariant === 'danger') {
    confirmButtonClasses += " text-white bg-red-600 hover:bg-red-700 focus:ring-red-500 disabled:bg-red-300";
  } else if (confirmButtonVariant === 'warning') {
    confirmButtonClasses += " text-white bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400 disabled:bg-yellow-300";
  } else { // primary
    confirmButtonClasses += " text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 disabled:bg-blue-300";
  }
  const cancelButtonClasses = "px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800";


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md transform transition-all">
        <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">{title}</h3>
        <div className="mt-2">
          {typeof message === 'string' ? <p className="text-sm text-gray-500 dark:text-gray-300">{message}</p> : message}
        </div>
        <div className="mt-5 sm:mt-6 sm:flex sm:flex-row-reverse">
          <button
            type="button"
            className={`${confirmButtonClasses} w-full sm:ml-3 sm:w-auto`}
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? 'Processing...' : confirmButtonText}
          </button>
          <button
            type="button"
            className={`${cancelButtonClasses} mt-3 w-full sm:mt-0 sm:w-auto`}
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;