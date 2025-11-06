import React, { useMemo } from 'react';
import { ComposedChart, Area, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush, Label } from 'recharts';
import { TestResultSample, LoadTestConfig } from '../types';

interface ResponseTimeChartProps {
  data: TestResultSample[];
  config: LoadTestConfig | null;
}

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const time = new Date(label).toLocaleTimeString();
    
    return (
      <div className="p-3 bg-gray-800 border border-gray-600 rounded-lg shadow-xl text-sm w-48">
        <p className="font-bold text-white mb-2">{time}</p>
        <ul className="space-y-1">
          <li className="flex items-center justify-between space-x-4">
            <span className="text-gray-400">Users:</span>
            <span className="font-mono text-green-400 font-semibold">{data.users}</span>
          </li>
          <li className="flex items-center justify-between space-x-4">
            <span className="text-gray-400">Errors:</span>
            <span className="font-mono text-red-400 font-semibold">{`${data.errorRate.toFixed(1)}%`}</span>
          </li>
           <li className="flex items-center justify-between space-x-4">
            <span className="text-gray-400">Min Latency:</span>
            <span className="font-mono text-cyan-400 font-semibold">{data.minLatency ?? 'N/A'} ms</span>
          </li>
          <li className="flex items-center justify-between space-x-4">
            <span className="text-gray-400">Avg Latency:</span>
            <span className="font-mono text-blue-400 font-semibold">{data.avgLatency ?? 'N/A'} ms</span>
          </li>
          <li className="flex items-center justify-between space-x-4">
            <span className="text-gray-400">Server Time:</span>
            <span className="font-mono text-red-500 font-semibold">{data.avgTtfb ?? 'N/A'} ms</span>
          </li>
           <li className="flex items-center justify-between space-x-4">
            <span className="text-gray-400">Max Latency:</span>
            <span className="font-mono text-orange-400 font-semibold">{data.maxLatency ?? 'N/A'} ms</span>
          </li>
        </ul>
      </div>
    );
  }
  return null;
};


const ResponseTimeChart: React.FC<ResponseTimeChartProps> = ({ data, config }) => {
    const processedData = useMemo(() => {
    if (!data || data.length === 0 || !config) return [];

    const startTime = data[0].timestamp;
    const bucketSize = 1000; // 1 second buckets
    const numBuckets = config.duration;
    if (numBuckets <= 0) return [];

    const buckets = Array.from({ length: numBuckets }, (_, i) => {
      const bucketStartTime = startTime + i * bucketSize;
      const elapsedSeconds = (bucketStartTime - startTime) / 1000;
      let activeUsers = 0;
      if (config.loadProfile === 'ramp-up') {
         activeUsers = (config.rampUp > 0 && elapsedSeconds < config.rampUp)
            ? Math.round(((elapsedSeconds + 1) / config.rampUp) * config.users)
            : config.users;
      } else { // stair-step
          let currentStep = Math.floor(elapsedSeconds / config.stepDuration);
          activeUsers = config.initialUsers + (currentStep * config.stepUsers);
      }
      activeUsers = Math.min(config.users, Math.max(0, activeUsers));

      return {
        timestamp: bucketStartTime,
        results: [] as TestResultSample[],
        users: activeUsers
      };
    });

    for (const result of data) {
      const bucketIndex = Math.floor((result.timestamp - startTime) / bucketSize);
      if (bucketIndex >= 0 && bucketIndex < numBuckets) {
        buckets[bucketIndex].results.push(result);
      }
    }

    return buckets.map(bucket => {
      const latencies = bucket.results.map(r => r.latency);
      const errors = bucket.results.filter(r => !r.success).length;
      
      const ttfbValues = bucket.results
        .map(r => r.networkTimings?.ttfb)
        .filter((ttfb): ttfb is number => ttfb !== undefined && ttfb >= 0);
      const avgTtfb = ttfbValues.length > 0 ? Math.round(ttfbValues.reduce((a, b) => a + b, 0) / ttfbValues.length) : null;

      const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
      const minLatency = latencies.length > 0 ? Math.round(Math.min(...latencies)) : null;
      const maxLatency = latencies.length > 0 ? Math.round(Math.max(...latencies)) : null;

      return {
        timestamp: bucket.timestamp,
        avgLatency,
        minLatency,
        maxLatency,
        latencyRange: [minLatency, maxLatency],
        errorRate: bucket.results.length > 0 ? (errors / bucket.results.length) * 100 : 0,
        users: bucket.users,
        avgTtfb,
      };
    });
  }, [data, config]);
  
  if (!data || data.length < 2 || !processedData || processedData.length === 0) {
    return (
        <div 
          style={{ width: '100%', height: 400 }} 
          className="flex items-center justify-center text-gray-500 bg-gray-800/50 rounded-md"
        >
            Not enough data to display chart.
        </div>
    );
  }

  return (
    <div>
        <p className="text-xs text-gray-400 mb-4 text-center">
            Charts are synchronized. The top shows Latency Profile, the bottom shows Load & Error Profile.
        </p>

        {/* Latency Profile Chart */}
        <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
                <ComposedChart data={processedData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }} syncId="perfTimeline">
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                    <XAxis dataKey="timestamp" tickFormatter={() => ''} stroke="#30363d" tickLine={false} />
                    <YAxis 
                        yAxisId="latency"
                        orientation="left"
                        stroke="#9ca3af"
                        fontSize={12}
                        tick={{ fill: '#9ca3af' }}
                        label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft', fill: '#9ca3af', dx: -15 }}
                        allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{top: -5}}/>
                    <Area yAxisId="latency" dataKey="latencyRange" stroke="none" fill="#f97316" fillOpacity={0.25} name="Latency Range" />
                    <Line yAxisId="latency" type="monotone" dataKey="avgLatency" stroke="#3b82f6" strokeWidth={2} dot={false} name="Avg Latency" />
                    <Line yAxisId="latency" type="monotone" dataKey="avgTtfb" stroke="#ef4444" strokeWidth={2} dot={false} name="Avg Server Time (TTFB)" />
                </ComposedChart>
            </ResponsiveContainer>
        </div>

        {/* Load & Error Profile Chart */}
        <div style={{ width: '100%', height: 150 }}>
            <ResponsiveContainer>
                <ComposedChart data={processedData} margin={{ top: 5, right: 20, left: 20, bottom: 40 }} syncId="perfTimeline">
                    <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                     <XAxis 
                        dataKey="timestamp" 
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString()}
                        stroke="#9ca3af"
                        fontSize={12}
                        tick={{ fill: '#9ca3af' }}
                        minTickGap={60}
                    >
                         <Label value="Time" offset={-25} position="insideBottom" fill="#9ca3af" fontSize={12} />
                    </XAxis>
                    <YAxis 
                        yAxisId="users"
                        orientation="right"
                        stroke="#9ca3af"
                        fontSize={12}
                        tick={{ fill: '#9ca3af' }}
                        label={{ value: 'Users / Errors', angle: -90, position: 'insideRight', fill: '#9ca3af', dx: 25 }}
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar yAxisId="users" dataKey="errorRate" barSize={20} fill="#ef4444" name="Error Rate (%)" fillOpacity={0.6} />
                    <Line yAxisId="users" type="step" dataKey="users" stroke="#10b981" strokeWidth={2} dot={false} name="Virtual Users" />
                    {processedData.length > 10 && (
                        <Brush 
                            dataKey="timestamp" 
                            height={30} 
                            stroke="#3b82f6"
                            fill="#1f2937"
                            tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString()}
                            y={110}
                        />
                    )}
                </ComposedChart>
            </ResponsiveContainer>
        </div>

        <div className="text-xs text-gray-500 mt-2 text-center">
            <strong>Note:</strong> Gaps in latency lines indicate intervals where no requests completed, often a sign of high latency or server overload.
        </div>
    </div>
  );
};

export default ResponseTimeChart;