import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } from 'recharts';
import type { LoadTestConfig } from '../types';

const LoadProfileChart: React.FC<{ config: Partial<LoadTestConfig> }> = ({ config }) => {
  const { users, duration, rampUp, loadProfile, initialUsers, stepUsers, stepDuration } = config;

  const chartData = useMemo(() => {
    if (!duration || duration <= 0 || !users || users <= 0) return [];

    const data: Array<{ time: number; users: number }> = [];

    if (loadProfile === 'stair-step' && stepDuration && stepDuration > 0 && stepUsers && stepUsers > 0 && initialUsers !== undefined) {
      // Create points for each step start time
      data.push({time: 0, users: 0}); // Ensure chart starts at 0,0
      
      const stepCount = Math.ceil(duration / stepDuration);

      for (let i = 0; i <= stepCount; i++) {
        const time = Math.min(i * stepDuration, duration);
        const userCount = (i === 0) 
            ? Math.min(initialUsers, users)
            : Math.min(initialUsers + (i * stepUsers), users);
            
        // To create a clear step, we need a point at the start and end of the horizontal line
        const prevPoint = data[data.length - 1];
        if (prevPoint && prevPoint.time < time) {
            data.push({ time, users: prevPoint.users });
        }
        
        data.push({ time, users: userCount });
        
        if (time >= duration || userCount >= users) {
             const lastUserCount = data[data.length - 1].users;
             if (time < duration) {
                 data.push({ time: duration, users: lastUserCount });
             }
             break;
        }
      }
    } else { // Ramp-up
      const effectiveRampUp = Math.min(rampUp || 0, duration);
      data.push({ time: 0, users: 1 });
      data.push({ time: effectiveRampUp, users: users });
      if (effectiveRampUp < duration) {
        data.push({ time: duration, users: users });
      }
    }
    return data;
  }, [users, duration, rampUp, loadProfile, initialUsers, stepUsers, stepDuration]);
  
  if (!chartData || chartData.length === 0) return null;

  return (
    <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
      <p className="text-sm font-medium text-white mb-3">Load Profile Visualizer</p>
      <div style={{ width: '100%', height: 120 }}>
        <ResponsiveContainer>
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 20, left: -10, bottom: 25 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#484f58" />
            <XAxis 
              dataKey="time" 
              type="number" 
              domain={[0, duration]}
              stroke="#9ca3af"
              fontSize={11}
              tick={{ fill: '#9ca3af' }}
              unit="s"
            >
                <Label value="Time" offset={-20} position="insideBottom" fill="#9ca3af" fontSize={12} />
            </XAxis>
            <YAxis 
              dataKey="users" 
              type="number" 
              domain={[0, 'dataMax']}
              stroke="#9ca3af"
              fontSize={11}
              tick={{ fill: '#9ca3af' }}
              allowDecimals={false}
            >
                 <Label value="Users" angle={-90} offset={10} position="insideLeft" fill="#9ca3af" fontSize={12} style={{textAnchor: 'middle'}} />
            </YAxis>
            <Tooltip
              cursor={{ stroke: '#484f58' }}
              contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', fontSize: '12px' }}
              labelStyle={{ color: '#c9d1d9' }}
              formatter={(value: number, name: string) => [`${Math.round(value)}`, 'Users']}
              labelFormatter={(label: number) => `Time: ${label}s`}
            />
            <Area
              type={loadProfile === 'stair-step' ? 'step' : 'linear'}
              dataKey="users"
              stroke="#3b82f6"
              fill="#3b82f6"
              strokeWidth={2}
              fillOpacity={0.2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default LoadProfileChart;
