import React from 'react';
import './ActionableInsights.css';

function InsightCard({ insight }) {
  const { title, detail, impact, link } = insight;

  const impactColor = impact === 'High' ? 'orange' : impact === 'Critical' ? 'red' : 'black';

  return (
    <div className="insight-card">
      <h4 className="insight-title" style={{ color: impactColor }}>{title}</h4>
      <p className="insight-detail">{detail}</p>
      <a href={link} className="view-details-button" aria-label={`View details for ${title}`}>
        View Details
      </a>
    </div>
  );
}

function ActionableInsights({ insights }) {
  return (
    <section className="actionable-insights">
      <h2>My Actionable Insights</h2>
      <div className="insights-list">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </section>
  );
}

export default ActionableInsights;
