// frontend/src/utils/dateUtils.ts
export function formatDateDisplay(dateString: string | null | undefined): string {
  if (!dateString) {
    return 'N/A';
  }
  try {
    // Assuming dateString is 'YYYY-MM-DD' and represents a specific day.
    // Create date as UTC to avoid timezone shifts during parsing by `new Date()`.
    const parts = dateString.split('-');
    if (parts.length !== 3) return 'Invalid Date Input';

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10); // 1-12
    const day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return 'Invalid Date Parts';
    }

    // Create a new Date object treating the input as calendar date components.
    // Date.UTC expects month to be 0-11.
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC', // Format the UTC date as is, without converting to local system time.
    });
  } catch (e) {
    console.error('Error formatting date display:', dateString, e);
    return 'Invalid Date';
  }
}

export function formatToISTLocaleString(isoTimestamp: string): string {
  if (!isoTimestamp) {
    return 'N/A';
  }

  try {
    const date = new Date(isoTimestamp); // Correctly parses "YYYY-MM-DDTHH:MM:SS+05:30"

    // Format date and time parts using 'en-IN' locale and IST timezone.
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata', // Ensures the output is IST
    };

    return date.toLocaleString('en-IN', options); // e.g., "dd/mm/yyyy, h:mm:ss AM/PM"
  } catch (error) {
    console.error('Error formatting timestamp to IST locale string:', isoTimestamp, error);
    // Check if the original string was "Invalid Date" or similar from backend already
    if (typeof isoTimestamp === 'string' && isoTimestamp.toLowerCase().includes('invalid date')) {
        return isoTimestamp;
    }
    return 'Invalid Date'; // Fallback for other invalid timestamps
  }
}

// Utility to format just the date part in YYYY-MM-DD for input fields
export function formatDateForInput(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) {
    return '';
  }
  try {
    const date = new Date(isoTimestamp);
    // Adjust for timezone offset to get the correct date in 'Asia/Kolkata'
    // then format as YYYY-MM-DD

    // Create a new date object that represents the date in IST.
    // Date.toLocaleDateString with specific options can give parts, but direct formatting is easier.
    // We need to be careful: `new Date(isoTimestamp)` creates a Date object whose internal value is UTC.
    // `getFullYear`, `getMonth`, `getDate` operate on the *local* time of the system running the JS.
    // To get the correct YYYY-MM-DD for IST from an IST-offsetted ISO string:
    const year = date.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Kolkata' });
    const month = date.toLocaleDateString('en-US', { month: '2-digit', timeZone: 'Asia/Kolkata' });
    const day = date.toLocaleDateString('en-US', { day: '2-digit', timeZone: 'Asia/Kolkata' });

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Error formatting date for input:', isoTimestamp, error);
    return '';
  }
}
