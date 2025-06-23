// frontend/src/downloadWorker.ts

interface DownloadWorkerData {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string | null; // Body for POST requests, stringified JSON
  originalFilename: string;
  isBulkDownload?: boolean; // To know if the final result in main thread is a direct blob or needs objectURL
}

self.onmessage = async (event: MessageEvent<DownloadWorkerData>) => {
  const { url, method, headers, body, originalFilename, isBulkDownload } = event.data;

  try {
    // Re-fetch the data within the worker
    const response = await fetch(url, {
      method: method,
      headers: headers,
      body: body,
    });

    if (!response.ok) {
      // Try to get error details if possible, though full error handling might be complex here
      let errorText = `Worker: Download failed for ${originalFilename} with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorText = errorData.msg || errorData.message || errorText;
      } catch (e) {
        // Ignore if error response is not JSON
      }
      self.postMessage({ error: errorText, originalFilename });
      return;
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    // Send the object URL back to the main thread
    self.postMessage({ objectUrl, originalFilename, blob }); // Sending blob back too for bulk download case

  } catch (error: any) {
    console.error(`Worker: Error processing download for ${originalFilename}:`, error);
    self.postMessage({ error: error.message || 'Worker: Unknown error occurred during download.', originalFilename });
  }
};

// Ensure TypeScript knows this is a module if not automatically inferred.
export {};
