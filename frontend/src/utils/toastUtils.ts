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

let lastSuccessMessage: string | null = null;
let lastSuccessToastTimestamp: number = 0;
const SUCCESS_DEBOUNCE_DURATION_MS = 3000;

let lastInfoMessage: string | null = null;
let lastInfoToastTimestamp: number = 0;
const INFO_DEBOUNCE_DURATION_MS = 3000;

let lastWarningMessage: string | null = null;
let lastWarningToastTimestamp: number = 0;
const WARNING_DEBOUNCE_DURATION_MS = 3000;

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
    resetAllToastDebounces(); // Reset debounce for other errors
  } else {
    // When going offline, reset debounces so the offline error toast isn't suppressed
    resetAllToastDebounces(); 
  }
};

export const showSuccessToast = (message: string, options?: ToastOptions) => {
  const now = Date.now();
  if (message === lastSuccessMessage && (now - lastSuccessToastTimestamp) < SUCCESS_DEBOUNCE_DURATION_MS) {
    // console.log("Duplicate success toast suppressed:", message); // Optional: for debugging
    return; 
  }
  toast.success(message, { ...defaultOptions, ...options });
  lastSuccessMessage = message;
  lastSuccessToastTimestamp = now;
};

export const showErrorToast = (message: string, options?: ToastOptions) => {
  const now = Date.now();

  // Note: Offline check should happen before standard debounce for other errors
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
  // This debounce is for non-offline related errors.
  if (message === lastErrorMessage && (now - lastErrorToastTimestamp) < ERROR_DEBOUNCE_DURATION_MS) {
    // console.log("Duplicate error toast suppressed:", message); // Optional: for debugging
    return; // Do not show the toast
  }
  toast.error(message, { ...defaultOptions, ...options });
  lastErrorMessage = message;
  lastErrorToastTimestamp = now;
};

export const showInfoToast = (message: string, options?: ToastOptions) => {
  const now = Date.now();
  if (message === lastInfoMessage && (now - lastInfoToastTimestamp) < INFO_DEBOUNCE_DURATION_MS) {
    // console.log("Duplicate info toast suppressed:", message); // Optional: for debugging
    return;
  }
  toast.info(message, { ...defaultOptions, ...options });
  lastInfoMessage = message;
  lastInfoToastTimestamp = now;
};

export const showWarningToast = (message: string, options?: ToastOptions) => {
  const now = Date.now();
  if (message === lastWarningMessage && (now - lastWarningToastTimestamp) < WARNING_DEBOUNCE_DURATION_MS) {
    // console.log("Duplicate warning toast suppressed:", message); // Optional: for debugging
    return;
  }
  toast.warn(message, { ...defaultOptions, ...options });
  lastWarningMessage = message;
  lastWarningToastTimestamp = now;
};

export const resetAllToastDebounces = () => { // Renamed and generalized
  lastErrorMessage = null;
  lastErrorToastTimestamp = 0;
  lastSuccessMessage = null;
  lastSuccessToastTimestamp = 0;
  lastInfoMessage = null;
  lastInfoToastTimestamp = 0;
  lastWarningMessage = null;
  lastWarningToastTimestamp = 0;
  // console.log("All toast debounces reset."); // Optional log
};
