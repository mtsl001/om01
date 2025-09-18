import React from 'react';
import './KpiCards.css';

function TrendArrow({ direction }) {
  if (direction === 'up') return <span className="trend-arrow up">▲</span>;
  if (direction === 'down') return <span className="trend-arrow down">▼</span>;
  return null;
}

function KpiCard({ kpi }) {
  const { title, value, trend, target, clickable, link } = kpi;

  const targetStatusColor = target
    ? target.status === 'below'
      ? 'red'
      : target.status === 'above'
      ? 'red'
      : 'orange'
    : null;

  const cardContent = (
    <div className={`kpi-card ${clickable ? 'clickable' : ''}`}>
      <h3 className="kpi-title">{title}</h3>
      <div className="kpi-value">{value}</div>
      {trend && (
        <div className="kpi-trend">
          <TrendArrow direction={trend.direction} /> {trend.percent}% vs Last Month
        </div>
      )}
      {target && (
        <div className="kpi-target" style={{ color: targetStatusColor }}>
          Target: {target.value} {target.status === 'below' ? '(Red if below)' : '(Red if above)'}
        </div>
      )}
    </div>
  );

  if (clickable) {
    return (
      <a href={link} className="kpi-card-link" aria-label={`Go to ${title} details`}>
        {cardContent}
      </a>
    );
  }

  return cardContent;
}

function KpiCards({ kpis }) {
  return (
    <div className="kpi-cards-row">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.id} kpi={kpi} />
      ))}
    </div>
  );
}

export default KpiCards;
