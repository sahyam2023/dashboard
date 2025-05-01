//src/views/DocumentsView.tsx
import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { fetchDocuments, fetchSoftware } from '../services/api';
import { Document, Software } from '../types';
import DataTable from '../components/DataTable';
import FilterTabs from '../components/FilterTabs';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';

interface OutletContextType {
  searchTerm: string;
}

const DocumentsView: React.FC = () => {
  const { searchTerm } = useOutletContext<OutletContextType>();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [software, setSoftware] = useState<Software[]>([]);
  const [selectedSoftwareId, setSelectedSoftwareId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [docsData, softwareData] = await Promise.all([
          fetchDocuments(selectedSoftwareId),
          fetchSoftware()
        ]);
        
        setDocuments(docsData);
        setSoftware(softwareData);
        setError(null);
      } catch (err) {
        setError('Failed to fetch documents. Please try again later.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedSoftwareId]);

  const handleFilterChange = (softwareId: number | null) => {
    setSelectedSoftwareId(softwareId);
  };

  const filteredDocuments = searchTerm
    ? documents.filter(doc => 
        doc.doc_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.software_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : documents;

  const columns = [
    { key: 'doc_name', header: 'Name' },
    { key: 'doc_type', header: 'Type' },
    { key: 'software_name', header: 'Software' },
    { key: 'description', header: 'Description' },
    { 
      key: 'download_link', 
      header: 'Download',
      render: (document: Document) => (
        <a
          href={document.download_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center text-blue-600 hover:text-blue-800"
        >
          Download
          <ExternalLink size={14} className="ml-1" />
        </a>
      )
    }
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Documents</h2>
        <p className="text-gray-600">Browse and download documentation</p>
      </div>

      {!isLoading && !error && (
        <FilterTabs 
          software={software} 
          selectedSoftwareId={selectedSoftwareId} 
          onSelectFilter={handleFilterChange} 
        />
      )}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => handleFilterChange(selectedSoftwareId)} />
      ) : (
        <DataTable 
          data={filteredDocuments} 
          columns={columns} 
        />
      )}
    </div>
  );
};

export default DocumentsView;