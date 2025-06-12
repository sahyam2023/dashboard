import * as yup from 'yup';

// Fixed regex - made protocol truly optional by moving the ? outside the group
export const URL_REGEX = /^((http|https):\/\/)?((www\.)?)(localhost|([a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+))(:[0-9]+)?(\/[^\s]*)?$/;

export const yupIsValidUrl = () => {
  return yup.string().test({
    name: 'isValidUrl',
    message: 'Please enter a valid URL. Examples: https://www.google.com, example.com/path. Ensure there are no spaces and the domain is correct (e.g., no "www.com", "http://.com").',
    test: (value) => {
      if (!value) { 
        return true; 
      }

      const lowercasedValue = value.toLowerCase();

      // Heuristic to specifically reject patterns like "www.com", "www.org"
      // This regex looks for "www." followed by a TLD-like part (alphanumeric, short), with no further subdomains.
      const wwwOnlyDomainPattern = /^(?:(?:http|https):?\/\/)?www\.([a-zA-Z0-9]+)$/;
      
      const match = lowercasedValue.match(wwwOnlyDomainPattern);
      if (match) {
        const tldPart = match[1];
        // Consider it a "www.com" like pattern if the tldPart is short (e.g. <=4 chars)
        // and a common TLD structure (alphanumeric).
        // This avoids flagging something like "www.website" if "website" is not a TLD.
        if (tldPart.length > 0 && tldPart.length <= 4 && /^[a-z0-9]+$/.test(tldPart)) {
          // Further check to ensure it's not something like www.c.om (which URL_REGEX would catch)
          // but specifically www.com, www.net etc.
          if (!tldPart.includes('.')) { // ensure tldPart itself is not a domain like co.uk
             // Check if what follows www. is just a simple tld.
             const domainParts = lowercasedValue.replace(/^(?:(?:http|https):?\/\/)?/, '').split('.');
             if (domainParts.length === 2 && domainParts[0] === 'www') {
                return false; // Reject patterns like www.com, www.net
             }
          }
        }
      }
      
      // Test against the main comprehensive URL_REGEX
      return URL_REGEX.test(value); // Use original `value` for case-sensitive parts if any in regex
    },
  });
};




// Example of how it might be used (for context, not part of this file):
// const schema = yup.object().shape({
//   website: yupIsValidUrl().required("Website URL is required"),
// });