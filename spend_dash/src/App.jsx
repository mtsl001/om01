import React from 'react';
import Header from './components/Header';
import KpiCards from './components/KpiCards';
import ActionableInsights from './components/ActionableInsights';
import SpendTrend from './components/SpendTrend';
import WatchlistSummary from './components/WatchlistSummary';
import QuickLinks from './components/QuickLinks';

import './App.css';

function App() {
  // Sample data for KPIs
  const kpisRow1 = [
    {
      id: 1,
      title: 'Overall Spend',
      value: '₹120.5 Cr (YTD)',
      trend: { direction: 'up', percent: 5 },
      target: null,
      clickable: true,
      link: '/spend-analysis',
    },
    {
      id: 2,
      title: 'Actionable Insights',
      value: '5 New Insights (3 Cost, 2 Risk)',
      trend: null,
      target: null,
      clickable: true,
      link: '/opportunities-risks',
    },
    {
      id: 3,
      title: 'Average Payment Days',
      value: '42 Days',
      trend: null,
      target: { value: 45, status: 'below' },
      clickable: true,
      link: '/payment-performance',
    },
  ];

  const kpisRow2 = [
    {
      id: 4,
      title: 'Spend on Contract',
      value: '85%',
      trend: null,
      target: { value: 90, status: 'below' },
      clickable: true,
      link: '/compliance-dashboard',
    },
    {
      id: 5,
      title: 'Top Spend Category % Change',
      value: 'Copper Wires: +12% (MoM)',
      trend: null,
      target: null,
      clickable: true,
      link: '/commodity-intelligence',
    },
    {
      id: 6,
      title: 'Critical Single-Sourced Items',
      value: '3 Items',
      trend: null,
      target: { value: 0, status: 'above' },
      clickable: true,
      link: '/sourcing-risk-optimization',
    },
  ];

  // Sample data for actionable insights
  const insights = [
    {
      id: 1,
      title: 'Price Alert: Copper Wires',
      detail: 'Paying 15% above group avg. Potential Saving: ₹2.5 Lacs',
      impact: 'High',
      link: '/insights/copper-wires',
    },
    {
      id: 2,
      title: 'Single Source Risk: Connector X123',
      detail: '100% volume from Supplier Z. High supply disruption risk.',
      impact: 'Critical',
      link: '/insights/connector-x123',
    },
    {
      id: 3,
      title: 'Payment Term Opportunity: ElectroParts Global',
      detail: 'Your term Net 30 vs. Group Net 60. DPO gain possible.',
      impact: 'Medium',
      link: '/insights/payment-term',
    },
  ];

  // Sample data for watchlist
  const watchlist = [
    { id: 1, item: 'Item ABC', alert: 'Price +5% (Last 7d)', link: '/watchlist/item-abc' },
    { id: 2, item: 'Supplier XYZ', alert: 'New Risk Flag', link: '/watchlist/supplier-xyz' },
  ];

  return (
    <div className="app-container">
      <Header userName="Priya Sharma" plant="Plant Alpha" division="Wiring Harness" />
      <main className="dashboard-main">
        <section className="kpi-section">
          <KpiCards kpis={kpisRow1} />
          <KpiCards kpis={kpisRow2} />
        </section>
        <section className="content-section">
          <div className="insights-container">
            <ActionableInsights insights={insights} />
            <a href="/opportunities-risks" className="view-all-link">See More Insights</a>
          </div>
          <div className="spend-trend-container">
            <SpendTrend />
            <WatchlistSummary watchlist={watchlist} />
          </div>
        </section>
        <QuickLinks />
      </main>
    </div>
  );
}

export default App;
