import React, { useState, useEffect } from 'react';
import { fetchContentHealthStats, ContentHealthStats } from '../../services/api';
import { AlertTriangle, CheckCircle, FileText, Link2, Package, Puzzle, History, Info } from 'lucide-react'; // Icons

interface StatDisplayProps {
  label: string;
  value: number;
  total: number;
  icon?: React.ReactNode;
  warningThreshold?: number; // If value > threshold, show warning icon
  infoOnly?: boolean; // If true, just show info, no warning/success
}

const StatDisplay: React.FC<StatDisplayProps> = ({ label, value, total, icon, warningThreshold, infoOnly }) => {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const isWarning = warningThreshold !== undefined && value > warningThreshold;

  let textColor = 'text-gray-700';
  let iconColor = 'text-gray-500';
  let statusIcon = infoOnly ? <Info size={16} className="mr-2 text-blue-500" /> : 
                   isWarning ? <AlertTriangle size={16} className="mr-2 text-red-500" /> : 
                               <CheckCircle size={16} className="mr-2 text-green-500" />;
  
  if (!infoOnly) {
    if (isWarning) {
      textColor = 'text-red-600';
      iconColor = 'text-red-500';
    } else if (value === 0 && total > 0) { // Perfect score for this metric
      textColor = 'text-green-700';
      iconColor = 'text-green-600';
    }
  }


  return (
    <div className={`p-3 bg-gray-50 rounded-md shadow-sm flex items-start ${isWarning && !infoOnly ? 'border-l-4 border-red-500' : ''}`}>
      {icon && <span className={`mr-3 mt-1 ${iconColor}`}>{icon}</span>}
      <div>
        <div className="flex items-center">
          {statusIcon}
          <span className={`font-medium ${textColor}`}>{label}:</span>
        </div>
        <span className={`ml-1 text-sm ${textColor}`}>
          {value} {total > 0 ? `/ ${total} (${percentage.toFixed(1)}%)` : ''}
        </span>
      </div>
    </div>
  );
};


const ContentHealthWidget: React.FC = () => {
  const [healthStats, setHealthStats] = useState<ContentHealthStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const data = await fetchContentHealthStats();
        setHealthStats(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load content health statistics.');
        setHealthStats(null);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  if (isLoading) {
    return <div className="text-center text-gray-500 py-4">Loading content health data...</div>;
  }

  if (error) {
    return <div className="text-center text-red-500 py-4">Error: {error}</div>;
  }

  if (!healthStats) {
    return <div className="text-center text-gray-500 py-4">No content health data available.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Documents Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center"><FileText size={20} className="mr-2 text-blue-600" />Documents ({healthStats.documents.total})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatDisplay label="Missing Description" value={healthStats.documents.missing_description} total={healthStats.documents.total} warningThreshold={0}/>
          <StatDisplay label="Missing File URL/Path" value={healthStats.documents.missing_file_url} total={healthStats.documents.total} warningThreshold={0}/>
          <StatDisplay label="Missing Software Association" value={healthStats.documents.missing_software_association} total={healthStats.documents.total} warningThreshold={0}/>
        </div>
      </div>

      {/* Patches Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center"><Puzzle size={20} className="mr-2 text-green-600" />Patches ({healthStats.patches.total})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatDisplay label="Missing Description" value={healthStats.patches.missing_description} total={healthStats.patches.total} warningThreshold={0}/>
          <StatDisplay label="Missing File URL/Path" value={healthStats.patches.missing_file_url} total={healthStats.patches.total} warningThreshold={0}/>
          <StatDisplay label="Missing Version Association" value={healthStats.patches.missing_version_association} total={healthStats.patches.total} warningThreshold={0}/>
          <StatDisplay label="Stale (>90 days)" value={healthStats.patches.stale_older_than_90_days} total={healthStats.patches.total} icon={<History size={18}/>} warningThreshold={5} />
        </div>
      </div>

      {/* Links Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center"><Link2 size={20} className="mr-2 text-purple-600" />Links ({healthStats.links.total})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatDisplay label="Missing Description" value={healthStats.links.missing_description} total={healthStats.links.total} warningThreshold={0}/>
        </div>
      </div>
      
      {/* Misc Files Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center"><Package size={20} className="mr-2 text-yellow-600" />Misc Files ({healthStats.misc_files.total})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatDisplay label="Missing Description" value={healthStats.misc_files.missing_description} total={healthStats.misc_files.total} warningThreshold={0}/>
          <StatDisplay label="Missing Category Association" value={healthStats.misc_files.missing_category_association} total={healthStats.misc_files.total} warningThreshold={0}/>
        </div>
      </div>

      {/* Software Versions Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center"><Info size={20} className="mr-2 text-teal-600" />Software Versions ({healthStats.software_versions.total})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatDisplay label="Missing Download Link" value={healthStats.software_versions.missing_download_link} total={healthStats.software_versions.total} warningThreshold={0}/>
          <StatDisplay label="Missing Release Date" value={healthStats.software_versions.missing_release_date} total={healthStats.software_versions.total} warningThreshold={0}/>
          <StatDisplay label="Missing Changelog" value={healthStats.software_versions.missing_changelog} total={healthStats.software_versions.total} warningThreshold={5}/>
        </div>
      </div>
    </div>
  );
};

export default ContentHealthWidget;
