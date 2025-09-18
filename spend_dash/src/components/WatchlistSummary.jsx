import React from 'react';
import './WatchlistSummary.css';

function WatchlistSummary({ watchlist }) {
  return (
    <section className="watchlist-summary">
      <h3>My Watchlist Alerts</h3>
      <ul>
        {watchlist.map((item) => (
          <li key={item.id}>
            <a href={item.link} className="watchlist-item-link">
              {item.item}: {item.alert}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default WatchlistSummary;
