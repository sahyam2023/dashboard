// frontend/src/utils/dateUtils.ts
export function formatDateDisplay(dateString: string | null | undefined): string {
  if (!dateString) {
    return 'N/A';
  }
  try {
    // Assuming dateString is 'YYYY-MM-DD' and represents a specific day.
    const parts = dateString.split('-');
    if (parts.length !== 3) {
        console.warn('Invalid dateString format in formatDateDisplay:', dateString);
        return 'Invalid Date Input';
    }

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10); // 1-12
    const day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
        console.warn('NaN date parts in formatDateDisplay for:', dateString);
        return 'Invalid Date Parts';
    }

    // Create a new Date object treating the input as calendar date components in UTC.
    const date = new Date(Date.UTC(year, month - 1, day));
    if (isNaN(date.getTime())) { // Add this check for robustness
        console.error('Invalid Date object created in formatDateDisplay for:', dateString);
        return 'Invalid Date';
    }

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
    // console.log('Incoming isoTimestamp for formatToISTLocaleString:', isoTimestamp); // Debugging line

    const date = new Date(isoTimestamp); // Parses ISO 8601 strings (e.g., "YYYY-MM-DDTHH:MM:SSZ" for UTC)
    if (isNaN(date.getTime())) { // Check if date is valid
        console.error('Invalid Date object created for formatToISTLocaleString:', isoTimestamp);
        return 'Invalid Date';
    }

    // Format date and time parts using 'en-IN' locale and IST timezone.
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      hourCycle: 'h12', // Explicitly setting hourCycle to 'h12' to resolve 'am0'/'pm0' issue
      timeZone: 'Asia/Kolkata', // Ensures the output is IST
    };

    const formattedString = date.toLocaleString('en-IN', options);
    // console.log('Formatted string from formatToISTLocaleString:', formattedString); // Debugging line
    return formattedString;
  } catch (error) {
    console.error('Error formatting timestamp to IST locale string:', isoTimestamp, error);
    // Check if the original string was "Invalid Date" or similar from backend already
    if (typeof isoTimestamp === 'string' && isoTimestamp.toLowerCase().includes('invalid date')) {
        return isoTimestamp;
    }
    return 'Invalid Date'; // Fallback for other invalid timestamps
  }
}

export function formatTimeToIST(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) {
    return 'N/A';
  }

  try {
    // console.log('Incoming isoTimestamp for formatTimeToIST:', isoTimestamp); // Debugging line

    const date = new Date(isoTimestamp);
    if (isNaN(date.getTime())) { // Check if date is valid
        console.error('Invalid Date object created for formatTimeToIST:', isoTimestamp);
        return 'Invalid Time';
    }

    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      // second: '2-digit', // Omitting seconds for typical chat message time display
      hour12: true,
      hourCycle: 'h12', // Explicitly setting hourCycle to 'h12'
      timeZone: 'Asia/Kolkata',
    };

    const formattedString = date.toLocaleTimeString('en-IN', options);
    // console.log('Formatted string from formatTimeToIST:', formattedString); // Debugging line
    return formattedString; // e.g., "10:00 AM"
  } catch (error) {
    console.error('Error formatting timestamp to IST time string:', isoTimestamp, error);
    if (typeof isoTimestamp === 'string' && isoTimestamp.toLowerCase().includes('invalid date')) {
        return isoTimestamp;
    }
    return 'Invalid Time'; // Fallback for other invalid timestamps
  }
}

// Utility to format just the date part in YYYY-MM-DD for input fields
export function formatDateForInput(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) {
    return '';
  }
  try {
    const date = new Date(isoTimestamp);
    if (isNaN(date.getTime())) { // Check for invalid date
        console.error('Invalid Date object created for formatDateForInput:', isoTimestamp);
        return '';
    }

    // Adjust for timezone offset to get the correct date in 'Asia/Kolkata'
    // then format as YYYY-MM-DD
    const year = date.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Kolkata' });
    const month = date.toLocaleDateString('en-US', { month: '2-digit', timeZone: 'Asia/Kolkata' });
    const day = date.toLocaleDateString('en-US', { day: '2-digit', timeZone: 'Asia/Kolkata' });

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Error formatting date for input:', isoTimestamp, error);
    return '';
  }
}