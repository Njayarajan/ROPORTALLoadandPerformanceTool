

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CheckCircleIcon } from './icons';

interface ErrorDistributionChartProps {
  errorDistribution: { [key: string]: number };
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];

const CustomTooltipContent = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    const percentage = data.payload.percent * 100;
    return (
      <div className="p-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl text-sm">
        <p className="text-gray-300">{`${data.name}: ${data.value} (${percentage.toFixed(1)}%)`}</p>
      </div>
    );
  }
  return null;
};

const ErrorDistributionChart: React.FC<ErrorDistributionChartProps> = ({ errorDistribution }) => {
    const data = Object.entries(errorDistribution).map(([name, value]) => ({ name, value }));
    const total = data.reduce((sum, entry) => sum + (entry.value as number), 0);

    if (data.length === 0) {
        return (
             <div style={{ minHeight: 250 }} className="flex flex-col items-center justify-center text-gray-500 bg-gray-800/50 rounded-md p-4">
                <CheckCircleIcon className="w-12 h-12 text-green-500 mb-2" />
                <p className="font-semibold">No Errors Recorded</p>
                <p className="text-sm">The application performed flawlessly.</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: 250 }} className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip content={<CustomTooltipContent />} />
                    <Legend iconSize={10} wrapperStyle={{fontSize: '12px', bottom: 0}}/>
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ErrorDistributionChart;