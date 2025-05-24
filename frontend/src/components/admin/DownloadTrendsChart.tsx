import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { fetchDownloadTrends, DownloadTrendsResponse, DownloadTrendItem } from '../../services/api';

const COLORS = ['#FF6633', '#FFB399', '#FF33FF', '#FFFF99', '#00B3E6', 
                '#E6B333', '#3366E6', '#999966', '#99FF99', '#B34D4D',
                '#80B300', '#809900', '#E6B3B3', '#6680B3', '#66991A', 
                '#FF99E6', '#CCFF1A', '#FF1A66', '#E6331A', '#33FFCC',
                '#66994D', '#B366CC', '#4D8000', '#B33300', '#CC80CC', 
                '#66664D', '#991AFF', '#E666FF', '#4DB3FF', '#1AB399',
                '#E666B3', '#33991A', '#CC9999', '#B3B31A', '#00E680', 
                '#4D8066', '#809980', '#E6FF80', '#1AFF33', '#999933',
                '#FF3380', '#CCCC00', '#66E64D', '#4D80CC', '#9900B3', 
                '#E64D66', '#4DB380', '#FF4D4D', '#99E6E6', '#6666FF'];


const DownloadTrendsChart: React.FC = () => {
  const [trendsData, setTrendsData] = useState<DownloadTrendsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const data = await fetchDownloadTrends();
        setTrendsData(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load download trends.');
        setTrendsData(null);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const processedChartData = useMemo(() => {
    if (!trendsData) return [];

    const allDates = new Set<string>(trendsData.overall.map(item => item.date));
    if (trendsData.by_type) {
      Object.values(trendsData.by_type).forEach(typeSpecificTrends => {
        typeSpecificTrends.forEach(item => allDates.add(item.date));
      });
    }

    const sortedDates = Array.from(allDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return sortedDates.map(date => {
      const overallEntry = trendsData.overall.find(item => item.date === date);
      const entry: { date: string; Overall?: number; [type: string]: number | string | undefined } = {
        date,
        Overall: overallEntry ? overallEntry.count : 0,
      };
      if (trendsData.by_type) {
        for (const type in trendsData.by_type) {
          const typeEntry = trendsData.by_type[type].find(item => item.date === date);
          entry[type] = typeEntry ? typeEntry.count : 0;
        }
      }
      return entry;
    });
  }, [trendsData]);

  if (isLoading) {
    return <div className="text-center text-gray-500 py-4">Loading download trends data...</div>;
  }

  if (error) {
    return <div className="text-center text-red-500 py-4">Error: {error}</div>;
  }

  if (!trendsData || processedChartData.length === 0) {
    return <div className="text-center text-gray-500 py-4">No download trends data available.</div>;
  }

  return (
    <div style={{ width: '100%', height: 350 }}>
      <ResponsiveContainer>
        <LineChart
          data={processedChartData}
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
          <Line type="monotone" dataKey="Overall" stroke="#8884d8" name="Overall Downloads" activeDot={{ r: 6 }} />
          {trendsData?.by_type && Object.keys(trendsData.by_type).map((type, index) => (
            <Line 
              key={type}
              type="monotone" 
              dataKey={type} 
              stroke={COLORS[index % COLORS.length]} // Cycle through predefined colors
              name={type} 
              activeDot={{ r: 6 }} 
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DownloadTrendsChart;
