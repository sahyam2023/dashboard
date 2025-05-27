// src/utils/toastUtils.ts
import { toast, ToastOptions, Id as ToastId } from 'react-toastify';

const defaultOptions: ToastOptions = {
  position: "top-right",
  autoClose: 5000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
  theme: "colored",
};

let lastErrorMessage: string | null = null;
let lastErrorToastTimestamp: number = 0;
const ERROR_DEBOUNCE_DURATION_MS = 5000; // 5 seconds

// Global offline state
let isGloballyOffline: boolean = false;
let offlineToastId: ToastId | null = null;
const OFFLINE_MESSAGE_TEXT = "Backend is unavailable. Please check your connection."; // Define it here to be accessible

export const setGlobalOfflineStatus = (status: boolean) => {
  isGloballyOffline = status;
  if (!status) { // Connection restored
    if (offlineToastId !== null) {
      toast.dismiss(offlineToastId);
      offlineToastId = null;
    }
    resetErrorToastDebounce(); // Reset debounce for other errors
  } else {
  }
};

export const showSuccessToast = (message: string, options?: ToastOptions) => {
  toast.success(message, { ...defaultOptions, ...options });
};

export const showErrorToast = (message: string, options?: ToastOptions) => {
  const now = Date.now();

  if (isGloballyOffline) {
    if (message === OFFLINE_MESSAGE_TEXT) {
      // This is the specific offline message
      if (offlineToastId !== null) {
        return; // Offline toast already active, do nothing
      }
      // Show the offline toast and store its ID
      // Use different options for the offline toast, like no autoClose
      const offlineToastOptions: ToastOptions = { ...defaultOptions, ...options, autoClose: false, closeOnClick: false, draggable: false };
      offlineToastId = toast.error(message, offlineToastOptions);
      lastErrorMessage = message; // Still apply debounce logic for this specific message
      lastErrorToastTimestamp = now;
      return;
    } else {
      // Different error message while offline, suppress it
      return;
    }
  }

  // Standard error handling (not offline, or connection just came back)
  if (message === lastErrorMessage && (now - lastErrorToastTimestamp) < ERROR_DEBOUNCE_DURATION_MS) {
    return; // Do not show the toast
  }
  toast.error(message, { ...defaultOptions, ...options });
  lastErrorMessage = message;
  lastErrorToastTimestamp = now;
};

export const showInfoToast = (message: string, options?: ToastOptions) => {
  toast.info(message, { ...defaultOptions, ...options });
};

export const showWarningToast = (message: string, options?: ToastOptions) => {
  toast.warn(message, { ...defaultOptions, ...options });
};

export const resetErrorToastDebounce = () => {
  lastErrorMessage = null;
  lastErrorToastTimestamp = 0;
};
