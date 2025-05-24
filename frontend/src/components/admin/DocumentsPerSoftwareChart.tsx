import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DocumentsPerSoftwareItem } from '../../services/api';

interface DocumentsPerSoftwareChartProps {
  data: DocumentsPerSoftwareItem[];
}

const DocumentsPerSoftwareChart: React.FC<DocumentsPerSoftwareChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="text-center text-gray-500 py-4">No data available to display chart.</div>;
  }

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="software_name" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="document_count" fill="#8884d8" name="Documents" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DocumentsPerSoftwareChart;
