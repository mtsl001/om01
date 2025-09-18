import React from 'react';
import './Header.css';

function Header({ userName, plant, division }) {
  return (
    <header className="header">
      <div className="header-left">
        <img src="/logo192.png" alt="Org Logo" className="org-logo" />
        <h1 className="page-title">My Dashboard - {userName} ({plant}, {division})</h1>
      </div>
      <div className="header-right">
        <button className="icon-button" title="User Profile" aria-label="User Profile">
          <span role="img" aria-label="User">👤</span>
        </button>
        <button className="icon-button" title="Help" aria-label="Help">
          <span role="img" aria-label="Help">❓</span>
        </button>
      </div>
    </header>
  );
}

export default Header;
