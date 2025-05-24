import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { fetchUserActivityTrends, UserActivityTrendsResponse, UserActivityTrendItem } from '../../services/api';

const UserActivityTrendsChart: React.FC = () => {
  const [activityData, setActivityData] = useState<UserActivityTrendsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const data = await fetchUserActivityTrends();
        setActivityData(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load user activity trends.');
        setActivityData(null);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  if (isLoading) {
    return <div className="text-center text-gray-500 py-4">Loading user activity data...</div>;
  }

  if (error) {
    return <div className="text-center text-red-500 py-4">Error: {error}</div>;
  }

  if (!activityData || (!activityData.logins.length && !activityData.uploads.length)) {
    return <div className="text-center text-gray-500 py-4">No user activity data available.</div>;
  }
  
  // Combine data for Recharts if necessary or use directly if format is suitable
  // For this example, assuming logins and uploads might have different date points
  // A more robust solution might involve merging these into a single array of objects
  // with { date, loginCount, uploadCount } for easier plotting if dates align.
  // However, Recharts can handle separate data arrays for lines if XAxis dataKey is common
  // or if we ensure all dates are present in one array and use that for XAxis.

  // For simplicity with current mock, we'll assume dates align or Recharts handles it.
  // A common approach is to create a unified dataset.
  const allDates = new Set<string>();
  activityData.logins.forEach(item => allDates.add(item.date));
  activityData.uploads.forEach(item => allDates.add(item.date));

  const sortedDates = Array.from(allDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const chartData = sortedDates.map(date => {
    const loginEntry = activityData.logins.find(l => l.date === date);
    const uploadEntry = activityData.uploads.find(u => u.date === date);
    return {
      date,
      logins: loginEntry ? loginEntry.count : 0, // Or undefined if you prefer gaps
      uploads: uploadEntry ? uploadEntry.count : 0, // Or undefined
    };
  });


  return (
    <div style={{ width: '100%', height: 350 }}>
      <ResponsiveContainer>
        <LineChart
          data={chartData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="date" 
            tickFormatter={(tick) => new Date(tick).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} 
          />
          <YAxis allowDecimals={false} />
          <Tooltip 
            labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          />
          <Legend />
          <Line type="monotone" dataKey="logins" stroke="#8884d8" name="Logins" activeDot={{ r: 8 }} />
          <Line type="monotone" dataKey="uploads" stroke="#82ca9d" name="Uploads" activeDot={{ r: 8 }} />
          {/* Example of a ReferenceLine if needed, e.g., average logins */}
          {/* <ReferenceLine y={50} label="Avg Logins" stroke="red" strokeDasharray="3 3" /> */}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default UserActivityTrendsChart;
