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

export function formatISTWithOffset(isoTimestamp: string): string {
  if (!isoTimestamp) {
    return 'N/A';
  }

  try {
    const date = new Date(isoTimestamp); // Correctly parses "YYYY-MM-DDTHH:MM:SS+05:30"

    // Format date and time parts using 'en-IN' locale and IST timezone.
    // This ensures the date/time values are correct for IST.
    const dateOptions: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Kolkata', // Ensure interpretation as IST
    };
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true, // Or false for 24-hour format
      timeZone: 'Asia/Kolkata', // Ensure interpretation as IST
    };

    const datePart = date.toLocaleDateString('en-IN', dateOptions); // e.g., "27/10/2023"
    const timePart = date.toLocaleTimeString('en-IN', timeOptions); // e.g., "10:00:00 AM"

    // The input isoTimestamp already contains the offset. We can extract it,
    // or, since we are standardizing on IST, we can hardcode "+05:30".
    // Extracting it to be robust, though for this project it will always be +05:30 from backend.
    const offsetMatch = isoTimestamp.match(/[+-]\d{2}:\d{2}$/);
    const offsetString = offsetMatch ? offsetMatch[0] : '+05:30'; // Default to +05:30

    return `${datePart}, ${timePart} ${offsetString}`; // e.g., "27/10/2023, 10:00:00 AM +05:30"
  } catch (error) {
    console.error('Error formatting timestamp:', isoTimestamp, error);
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
