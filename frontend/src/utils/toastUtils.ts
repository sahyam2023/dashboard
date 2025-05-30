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

const GLOBAL_TOAST_DEBOUNCE_DURATION_MS = 1500;
let lastAnyToastTimestamp: number = 0;

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

  // Global debounce check (new)
  if ((now - lastAnyToastTimestamp) < GLOBAL_TOAST_DEBOUNCE_DURATION_MS) {
    // console.log("Global success toast suppressed by global_debounce:", message); // Optional
    return; 
  }

  // Existing message-specific debounce check
  if (message === lastSuccessMessage && (now - lastSuccessToastTimestamp) < SUCCESS_DEBOUNCE_DURATION_MS) {
    // console.log("Duplicate success toast suppressed by message_debounce:", message); // Optional
    return; 
  }

  toast.success(message, { ...defaultOptions, ...options });
  lastSuccessMessage = message;
  lastSuccessToastTimestamp = now;
  lastAnyToastTimestamp = now; // Update global timestamp
};

export const showErrorToast = (message: string, options?: ToastOptions) => {
  const now = Date.now();

  if (isGloballyOffline) {
    if (message === OFFLINE_MESSAGE_TEXT) {
      if (offlineToastId !== null) {
        return; 
      }
      const offlineToastOptions: ToastOptions = { ...defaultOptions, ...options, autoClose: false, closeOnClick: false, draggable: false };
      offlineToastId = toast.error(message, offlineToastOptions);
      lastErrorMessage = message; 
      lastErrorToastTimestamp = now;
      lastAnyToastTimestamp = now; // Offline toast also updates global timestamp
      return;
    } else {
      return; // Different error message while offline, suppress it
    }
  }

  // Global debounce check (new) - for non-offline errors
  if (message !== OFFLINE_MESSAGE_TEXT && (now - lastAnyToastTimestamp) < GLOBAL_TOAST_DEBOUNCE_DURATION_MS) {
    // console.log("Global error toast suppressed by global_debounce:", message); // Optional
    return;
  }

  // Standard error message debounce (existing)
  if (message === lastErrorMessage && (now - lastErrorToastTimestamp) < ERROR_DEBOUNCE_DURATION_MS) {
    // console.log("Duplicate error toast suppressed by message_debounce:", message); // Optional
    return; 
  }
  toast.error(message, { ...defaultOptions, ...options });
  lastErrorMessage = message;
  lastErrorToastTimestamp = now;
  lastAnyToastTimestamp = now; // Update global timestamp
};

export const showInfoToast = (message: string, options?: ToastOptions) => {
  const now = Date.now();

  // Global debounce check (new)
  if ((now - lastAnyToastTimestamp) < GLOBAL_TOAST_DEBOUNCE_DURATION_MS) {
    // console.log("Global info toast suppressed by global_debounce:", message); // Optional
    return; 
  }

  // Existing message-specific debounce check
  if (message === lastInfoMessage && (now - lastInfoToastTimestamp) < INFO_DEBOUNCE_DURATION_MS) {
    // console.log("Duplicate info toast suppressed by message_debounce:", message); // Optional
    return;
  }
  toast.info(message, { ...defaultOptions, ...options });
  lastInfoMessage = message;
  lastInfoToastTimestamp = now;
  lastAnyToastTimestamp = now; // Update global timestamp
};

export const showWarningToast = (message: string, options?: ToastOptions) => {
  const now = Date.now();

  // Global debounce check (new)
  if ((now - lastAnyToastTimestamp) < GLOBAL_TOAST_DEBOUNCE_DURATION_MS) {
    // console.log("Global warning toast suppressed by global_debounce:", message); // Optional
    return; 
  }

  // Existing message-specific debounce check
  if (message === lastWarningMessage && (now - lastWarningToastTimestamp) < WARNING_DEBOUNCE_DURATION_MS) {
    // console.log("Duplicate warning toast suppressed by message_debounce:", message); // Optional
    return;
  }
  toast.warn(message, { ...defaultOptions, ...options });
  lastWarningMessage = message;
  lastWarningToastTimestamp = now;
  lastAnyToastTimestamp = now; // Update global timestamp
};

export const resetAllToastDebounces = () => { // Renamed and generalized
  lastErrorMessage = null;
  lastErrorToastTimestamp = 0;
  lastAnyToastTimestamp = 0; // Reset global timestamp
  lastSuccessMessage = null;
  lastSuccessToastTimestamp = 0;
  lastInfoMessage = null;
  lastInfoToastTimestamp = 0;
  lastWarningMessage = null;
  lastWarningToastTimestamp = 0;
  lastAnyToastTimestamp = 0; // Ensure it's reset here as well, if not already covered
  // console.log("All toast debounces reset."); // Optional log
};
