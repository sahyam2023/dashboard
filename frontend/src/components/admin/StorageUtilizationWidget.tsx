import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fetchStorageUtilization, StorageUtilizationResponse, StorageCategoryUsage } from '../../services/api';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AA00FF', '#FF00AA'];

const StorageUtilizationWidget: React.FC = () => {
  const [storageData, setStorageData] = useState<StorageUtilizationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const data = await fetchStorageUtilization();
        setStorageData(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load storage utilization data.');
        setStorageData(null);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const pieData = useMemo(() => {
    if (!storageData) return [];
    return storageData.by_category.map(item => ({
      name: item.category,
      value: item.size_gb,
    }));
  }, [storageData]);

  if (isLoading) {
    return <div className="text-center text-gray-500 py-4">Loading storage data...</div>;
  }

  if (error) {
    return <div className="text-center text-red-500 py-4">Error: {error}</div>;
  }

  if (!storageData) {
    return <div className="text-center text-gray-500 py-4">No storage data available.</div>;
  }

  const usedPercentage = storageData.total_storage_gb > 0 
    ? (storageData.used_storage_gb / storageData.total_storage_gb) * 100 
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
          <span>
            {storageData.used_storage_gb.toFixed(2)} GB used of {storageData.total_storage_gb.toFixed(2)} GB
          </span>
          <span>{usedPercentage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
          <div 
            className="bg-blue-600 h-2.5 rounded-full" 
            style={{ width: `${usedPercentage}%` }}
          ></div>
        </div>
      </div>

      {pieData.length > 0 ? (
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number, name: string) => [`${value.toFixed(2)} GB`, name]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-center text-gray-500 py-2">No category breakdown available.</p>
      )}
    </div>
  );
};

export default StorageUtilizationWidget;
