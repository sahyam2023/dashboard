import React, { useState, useEffect } from 'react';
import { AdminSoftwareVersion, AddAdminVersionPayload, EditAdminVersionPayload, Software } from '../../../services/api'; // Adjust path as needed
import { addAdminVersion, updateAdminVersion, fetchSoftware } from '../../../services/api'; // Adjust path as needed

interface AdminVersionFormProps {
  initialData?: AdminSoftwareVersion | null;
  onSubmitSuccess: () => void;
  onCancel: () => void;
}

const AdminVersionForm: React.FC<AdminVersionFormProps> = ({ initialData, onSubmitSuccess, onCancel }) => {
  const [softwareId, setSoftwareId] = useState<number | ''>(initialData?.software_id || '');
  const [versionNumber, setVersionNumber] = useState<string>(initialData?.version_number || '');
  const [releaseDate, setReleaseDate] = useState<string>(initialData?.release_date?.substring(0, 10) || ''); // YYYY-MM-DD
  const [mainDownloadLink, setMainDownloadLink] = useState<string>(initialData?.main_download_link || '');
  const [changelog, setChangelog] = useState<string>(initialData?.changelog || '');
  const [knownBugs, setKnownBugs] = useState<string>(initialData?.known_bugs || '');

  const [softwareList, setSoftwareList] = useState<Software[]>([]);
  const [isLoadingSoftware, setIsLoadingSoftware] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadSoftware = async () => {
      setIsLoadingSoftware(true);
      try {
        const data = await fetchSoftware();
        setSoftwareList(data);
      } catch (err) {
        console.error("Error fetching software list:", err);
        setError("Failed to load software list.");
      } finally {
        setIsLoadingSoftware(false);
      }
    };
    loadSoftware();
  }, []);

  useEffect(() => {
    if (initialData) {
      setSoftwareId(initialData.software_id || '');
      setVersionNumber(initialData.version_number || '');
      setReleaseDate(initialData.release_date?.substring(0, 10) || '');
      setMainDownloadLink(initialData.main_download_link || '');
      setChangelog(initialData.changelog || '');
      setKnownBugs(initialData.known_bugs || '');
    } else {
      // Reset form for 'add' mode
      setSoftwareId('');
      setVersionNumber('');
      setReleaseDate('');
      setMainDownloadLink('');
      setChangelog('');
      setKnownBugs('');
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!softwareId) {
      setError("Software is required.");
      return;
    }
    if (!versionNumber.trim()) {
      setError("Version number is required.");
      return;
    }

    setIsSubmitting(true);

    const payload: AddAdminVersionPayload | EditAdminVersionPayload = {
      software_id: Number(softwareId),
      version_number: versionNumber.trim(),
      release_date: releaseDate || null, // Send null if empty
      main_download_link: mainDownloadLink.trim() || null,
      changelog: changelog.trim() || null,
      known_bugs: knownBugs.trim() || null,
    };

    try {
      if (initialData) {
        await updateAdminVersion(initialData.id, payload as EditAdminVersionPayload);
        setSuccessMessage("Version updated successfully!");
      } else {
        await addAdminVersion(payload as AddAdminVersionPayload);
        setSuccessMessage("Version added successfully!");
      }
      if (onSubmitSuccess) {
        setTimeout(() => { // Allow user to see success message briefly
            onSubmitSuccess();
        }, 1000);
      }
    } catch (err: any) {
      console.error("Error submitting version form:", err);
      const apiErrorMessage = err.response?.data?.msg || err.message || (initialData ? 'Failed to update version.' : 'Failed to add version.');
      setError(apiErrorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-4 bg-white dark:bg-gray-800 dark:border dark:border-gray-700 shadow-md rounded-lg">
      {error && <div className="bg-red-100 border border-red-400 text-red-700 dark:bg-red-900 dark:border-red-700 dark:text-red-300 px-4 py-3 rounded relative" role="alert">{error}</div>}
      {successMessage && <div className="bg-green-100 border border-green-400 text-green-700 dark:bg-green-900 dark:border-green-700 dark:text-green-300 px-4 py-3 rounded relative" role="alert">{successMessage}</div>}

      <div>
        <label htmlFor="softwareId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Software <span className="text-red-500">*</span></label>
        <select
          id="softwareId"
          value={softwareId}
          onChange={(e) => setSoftwareId(Number(e.target.value))}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600"
          disabled={isLoadingSoftware || isSubmitting}
          required
        >
          <option value="" disabled>Select Software</option>
          {softwareList.map((sw) => (
            <option key={sw.id} value={sw.id}>{sw.name}</option>
          ))}
        </select>
        {isLoadingSoftware && <p className="text-sm text-gray-500 dark:text-gray-400">Loading software...</p>}
      </div>

      <div>
        <label htmlFor="versionNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Version Number <span className="text-red-500">*</span></label>
        <input
          type="text"
          id="versionNumber"
          value={versionNumber}
          onChange={(e) => setVersionNumber(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400"
          disabled={isSubmitting}
          required
        />
      </div>

      <div>
        <label htmlFor="releaseDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Release Date</label>
        <input
          type="date"
          id="releaseDate"
          value={releaseDate}
          onChange={(e) => setReleaseDate(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600"
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label htmlFor="mainDownloadLink" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Main Download Link</label>
        <input
          type="url"
          id="mainDownloadLink"
          value={mainDownloadLink}
          onChange={(e) => setMainDownloadLink(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400"
          placeholder="https://example.com/download"
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label htmlFor="changelog" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Changelog</label>
        <textarea
          id="changelog"
          value={changelog}
          onChange={(e) => setChangelog(e.target.value)}
          rows={4}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400"
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label htmlFor="knownBugs" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Known Bugs</label>
        <textarea
          id="knownBugs"
          value={knownBugs}
          onChange={(e) => setKnownBugs(e.target.value)}
          rows={4}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:text-gray-300 dark:bg-gray-700 dark:border-gray-500 dark:hover:bg-gray-600"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          disabled={isSubmitting || isLoadingSoftware}
        >
          {isSubmitting ? (initialData ? 'Updating...' : 'Adding...') : (initialData ? 'Update Version' : 'Add Version')}
        </button>
      </div>
    </form>
  );
};

export default AdminVersionForm;
