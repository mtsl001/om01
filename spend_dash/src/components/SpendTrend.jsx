import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import './SpendTrend.css';

const data = [
  { month: 'Jan', spend: 10 },
  { month: 'Feb', spend: 12 },
  { month: 'Mar', spend: 15 },
  { month: 'Apr', spend: 14 },
  { month: 'May', spend: 18 },
  { month: 'Jun', spend: 20 },
  { month: 'Jul', spend: 22 },
  { month: 'Aug', spend: 21 },
  { month: 'Sep', spend: 23 },
  { month: 'Oct', spend: 25 },
  { month: 'Nov', spend: 27 },
  { month: 'Dec', spend: 30 },
];

function SpendTrend() {
  return (
    <section className="spend-trend">
      <h2>Plant Alpha - Spend (YoY, MoM)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="spend" stroke="#8884d8" activeDot={{ r: 8 }} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

export default SpendTrend;
