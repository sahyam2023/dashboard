// src/components/admin/AdminMiscCategoryForm.tsx
import React, { useState, useEffect } from 'react';
import { MiscCategory, AddCategoryPayload, EditCategoryPayload } from '../../types'; // Make sure EditCategoryPayload is defined in types/index.ts
import { addAdminMiscCategory, editAdminMiscCategory } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface AdminMiscCategoryFormProps {
  categoryToEdit?: MiscCategory | null;
  onSuccess: (category: MiscCategory) => void; // Combined callback for add/update success
  onCancel?: () => void; // Optional: To explicitly handle cancel action (e.g., hide form)
}

const AdminMiscCategoryForm: React.FC<AdminMiscCategoryFormProps> = ({
  categoryToEdit,
  onSuccess,
  onCancel,
}) => {
  const isEditMode = !!categoryToEdit;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { isAuthenticated, role } = useAuth(); // For role check, though form might only be shown to admins

  useEffect(() => {
    if (isEditMode && categoryToEdit) {
      setName(categoryToEdit.name);
      setDescription(categoryToEdit.description || '');
    } else {
      // Reset for "Add New" mode
      setName('');
      setDescription('');
    }
    setError(null); // Clear errors when mode or item changes
    setSuccessMessage(null); // Clear success message
  }, [categoryToEdit, isEditMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Category name is required.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      let resultCategory: MiscCategory;
      if (isEditMode && categoryToEdit) {
        const payload: EditCategoryPayload = {};
        let changed = false;
        if (name.trim() !== categoryToEdit.name) {
          payload.name = name.trim();
          changed = true;
        }
        if ((description.trim() || null) !== (categoryToEdit.description || null) ) { // Handle empty string vs null
          payload.description = description.trim() || undefined; // Send undefined if empty to potentially clear it
          changed = true;
        }

        if (!changed) {
            setSuccessMessage("No changes detected.");
            setIsLoading(false);
            if (onSuccess) onSuccess(categoryToEdit); // Still call onSuccess to trigger view updates like closing form
            return;
        }
        resultCategory = await editAdminMiscCategory(categoryToEdit.id, payload);
      } else {
        const payload: AddCategoryPayload = {
          name: name.trim(),
          description: description.trim() || undefined,
        };
        resultCategory = await addAdminMiscCategory(payload);
      }
      setSuccessMessage(`Category "${resultCategory.name}" ${isEditMode ? 'updated' : 'added'} successfully!`);
      
      if (!isEditMode) { // Clear form only on successful add
        setName('');
        setDescription('');
      }
      // Call the external onSuccess callback (e.g., to close form in MiscView and refresh list)
      if (onSuccess) onSuccess(resultCategory); 

      // Optionally clear success message after a delay
      // setTimeout(() => setSuccessMessage(null), 3000);

    } catch (err: any) {
      setError(err.response?.data?.msg || err.message || `Failed to ${isEditMode ? 'update' : 'add'} category.`);
    } finally {
      setIsLoading(false);
    }
  };

  // This component should only be rendered if the user is an admin,
  // typically controlled by the parent component (MiscView.tsx)
  if (!isAuthenticated || role !== 'admin') {
    return <p>You are not authorized to manage categories.</p>; // Or null
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
      <h4 className="text-lg font-medium text-gray-800">
        {isEditMode ? 'Edit Miscellaneous Category' : 'Add New Miscellaneous Category'}
      </h4>
      
      {error && <div className="p-3 my-2 bg-red-100 border border-red-300 text-red-700 rounded-md text-sm">{error}</div>}
      {successMessage && <div className="p-3 my-2 bg-green-100 border border-green-300 text-green-700 rounded-md text-sm">{successMessage}</div>}
      
      <div>
        <label htmlFor="miscCategoryName" className="block text-sm font-medium text-gray-700">
          Name*
        </label>
        <input
          type="text"
          id="miscCategoryName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={isLoading}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>
      
      <div>
        <label htmlFor="miscCategoryDescription" className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="miscCategoryDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={isLoading}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>
      
      <div className="flex items-center space-x-3 pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60"
        >
          {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Save Changes' : 'Add Category')}
        </button>
        {onCancel && ( // Render cancel button only if onCancel prop is provided
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

export default AdminMiscCategoryForm;