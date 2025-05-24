import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PopularDownloadItem } from '../../services/api';

interface PopularDownloadsChartProps {
  data: PopularDownloadItem[];
}

const PopularDownloadsChart: React.FC<PopularDownloadsChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="text-center text-gray-500 py-4">No data available to display chart.</div>;
  }

  // Enhance data with a combined name for display and tooltip
  const processedData = data.map(item => ({
    ...item,
    displayName: `${item.name} (${item.type})`,
  }));

  return (
    <div style={{ width: '100%', height: 400 }}> 
      <ResponsiveContainer>
        <BarChart
          data={processedData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 70, // Increased bottom margin for better label visibility if names are long
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="displayName" 
            angle={-45} // Angle labels to prevent overlap
            textAnchor="end" // Anchor angled labels at the end
            interval={0} // Show all labels
            tick={{ fontSize: 10 }} // Adjust font size if needed
          />
          <YAxis allowDecimals={false} />
          <Tooltip formatter={(value, name, props) => [`${props.payload.download_count} downloads`, `Item: ${props.payload.name}, Type: ${props.payload.type}`]} />
          <Legend />
          {/* 
            If you want to color bars by type, you would need a more complex setup:
            1. Identify unique types.
            2. Create a <Bar> component for each type.
            3. Or, process data to have separate keys for each type if doing a stacked or grouped chart.
            For simplicity, a single color is used here, and type is distinguished in the tooltip and X-axis label.
          */}
          <Bar dataKey="download_count" fill="#82ca9d" name="Downloads" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PopularDownloadsChart;
