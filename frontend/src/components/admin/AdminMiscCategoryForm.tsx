// src/components/admin/AdminMiscCategoryForm.tsx
import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler, FieldErrors } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { toast } from 'react-toastify'; // Keep for toast.info, or remove if toastUtils handles info too
import { showSuccessToast, showErrorToast } from '../../utils/toastUtils';
import { MiscCategory, AddCategoryPayload, EditCategoryPayload } from '../../types';
import { addAdminMiscCategory, editAdminMiscCategory } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { MinusCircle } from 'lucide-react';

interface AdminMiscCategoryFormProps {
  categoryToEdit?: MiscCategory | null;
  onSuccess: (category: MiscCategory) => void;
  onCancel?: () => void;
}

// Form data interface
interface MiscCategoryFormData {
  name: string;
  description?: string;
}

// Yup validation schema
const categoryValidationSchema = yup.object().shape({
  name: yup.string().required("Category name is required.").max(100, "Category name cannot exceed 100 characters."),
  description: yup.string().optional().max(500, "Description cannot exceed 500 characters.").nullable(), // Allow null for optional fields
});

const AdminMiscCategoryForm: React.FC<AdminMiscCategoryFormProps> = ({
  categoryToEdit,
  onSuccess,
  onCancel,
}) => {
  const isEditMode = !!categoryToEdit;
  const { register, handleSubmit, formState: { errors }, reset} = useForm<MiscCategoryFormData>({
    resolver: yupResolver(categoryValidationSchema),
    defaultValues: {
      name: '',
      description: '',
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  // Removed error and successMessage state

  const { isAuthenticated, user } = useAuth();
const role = user?.role; // Access role safely, as user can be null

  useEffect(() => {
    if (isEditMode && categoryToEdit) {
      reset({
        name: categoryToEdit.name,
        description: categoryToEdit.description || '',
      });
    } else {
      reset({
        name: '',
        description: '',
      });
    }
    // Clear toasts or other global messages if necessary when form reinitializes
  }, [categoryToEdit, isEditMode, reset]);

  const onSubmit: SubmitHandler<MiscCategoryFormData> = async (data) => {
    setIsLoading(true);

    try {
      let resultCategory: MiscCategory;
      if (isEditMode && categoryToEdit) {
        const payload: EditCategoryPayload = {};
        let changed = false;
        if (data.name.trim() !== categoryToEdit.name) {
          payload.name = data.name.trim();
          changed = true;
        }
        // Ensure description is handled correctly: undefined if empty, otherwise trimmed value
        const currentDescription = categoryToEdit.description || "";
        const newDescription = data.description?.trim() || "";
        if (newDescription !== currentDescription) {
            payload.description = newDescription || undefined; // Send undefined if empty
            changed = true;
        }
        
        if (!changed) {
          toast.info("No changes detected.");
          setIsLoading(false);
          if (onSuccess) onSuccess(categoryToEdit);
          return;
        }
        resultCategory = await editAdminMiscCategory(categoryToEdit.id, payload);
      } else {
        const payload: AddCategoryPayload = {
          name: data.name.trim(),
          description: data.description?.trim() || undefined,
        };
        resultCategory = await addAdminMiscCategory(payload);
      }
      // toast.success(`Category "${resultCategory.name}" ${isEditMode ? 'updated' : 'added'} successfully!`);
      showSuccessToast('Category saved successfully!');
      
      if (!isEditMode) {
        reset({ name: '', description: '' }); // Reset form on successful add
      }
      if (onSuccess) onSuccess(resultCategory); 

    } catch (err: any) {
      const backendMessage = err.response?.data?.msg || err.message;
      let userMessage = `Failed to ${isEditMode ? 'update' : 'add'} category.`;

      if (backendMessage && typeof backendMessage === 'string' && backendMessage.includes("UNIQUE constraint failed")) {
        userMessage = "A category with this name already exists. Please use a different name.";
      } else if (backendMessage) {
        userMessage = backendMessage;
      }
      showErrorToast(userMessage);
      // Future: Add checks for other constraint errors here
    } finally {
      setIsLoading(false);
    }
  };
  
  const onFormError = (formErrors: FieldErrors<MiscCategoryFormData>) => {
    console.error("Form validation errors:", formErrors);
    toast.error("Please correct the errors in the form.");
  };


  if (!isAuthenticated || !role || !['admin', 'super_admin'].includes(role)) {
    return <p>You are not authorized to manage categories.</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onFormError)} className="space-y-4 p-4 border border-gray-200 rounded-lg bg-white shadow-sm dark:bg-gray-800 dark:border-gray-700">
      <h4 className="text-lg font-medium text-gray-800 dark:text-gray-100">
        {isEditMode ? 'Edit Miscellaneous Category' : 'Add New Miscellaneous Category'}
      </h4>
      
      {/* Removed old error/success message divs */}
      
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Name*
        </label>
        <input
          type="text"
          id="name"
          {...register("name")}
          disabled={isLoading}
          className={`mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${errors.name ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
      </div>
      
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Description
        </label>
        <textarea
          id="description"
          {...register("description")}
          rows={3}
          disabled={isLoading}
          className={`mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${errors.description ? 'border-red-500' : ''} dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:placeholder-gray-400`}
        />
        {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>}
      </div>
      
      <div className="flex items-center space-x-3 pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60"
        >
          {isLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Save Changes' : 'Add Category')}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-60"
          >
            <MinusCircle size={18} className="mr-2" />
            {isEditMode ? 'Cancel Edit' : 'Cancel'}
          </button>
        )}
      </div>
    </form>
  );
};

export default AdminMiscCategoryForm;