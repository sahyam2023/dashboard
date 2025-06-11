import * as yup from 'yup';

export const URL_REGEX = /^((http|https):\/\/)?(www\.)?([a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)(:[0-9]+)?(\/[^\s]*)?$/;

export const yupIsValidUrl = () => {
  return yup.string().test({
    name: 'isValidUrl',
    message: 'Please enter a valid URL. Examples: https://www.google.com, example.com/path. Ensure there are no spaces and the domain is correct (e.g., no "www.com", "http://.com").',
    test: (value) => {
      if (!value) {
        return true; // Allow empty values, yup.required() should handle if it's mandatory
      }
      // Test against the regex
      return URL_REGEX.test(value);
    },
  });
};

// Example of how it might be used (for context, not part of this file):
// const schema = yup.object().shape({
//   website: yupIsValidUrl().required("Website URL is required"),
// });
