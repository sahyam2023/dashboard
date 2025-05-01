//src/views/MiscView.tsx
import React from 'react';

const MiscView: React.FC = () => {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Miscellaneous</h2>
        <p className="text-gray-600">Additional resources and information</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Resources</h3>
        
        <div className="space-y-4">
          <p className="text-gray-600">
            This section is for miscellaneous content and information that doesn't fit into the other categories.
          </p>
          
          <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
            <h4 className="font-medium text-blue-800 mb-2">Did you know?</h4>
            <p className="text-blue-700 text-sm">
              This dashboard is powered by a React frontend and Flask backend. Data is fetched via API endpoints with proper error handling and state management.
            </p>
          </div>
          
          <p className="text-gray-600">
            You can customize this section to include any additional information or functionality needed for your dashboard.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MiscView;