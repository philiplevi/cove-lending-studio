import Script from 'next/script';
import './studio.css';
import './premium.css';
import './executive.css';

export default function Studio() {
  return <>
    <div className="shell">
      <aside className="sidebar" id="sidebar">
        <a className="brand" href="#dashboard" aria-label="Cove Lending dashboard">
          <span className="brand-mark"><svg viewBox="0 0 44 44" aria-hidden="true"><path d="M7 31L18.5 12L26.5 25L34 13L39 31" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
          <span><strong>Cove<span className="brand-dot">.</span></strong><small>LENDING STUDIO</small></span>
        </a>
        <div className="sidebar-workspace"><span className="workspace-badge">PRIVATE WORKSPACE</span><strong>Portfolio console</strong><small>Financial operations</small></div>
        <div className="sidebar-eyebrow">MANAGE</div>
        <nav id="nav" className="nav" aria-label="Primary navigation">
          <button type="button" className="nav-item active" data-page="dashboard"><span data-icon="layout-dashboard"/> Dashboard</button>
          <button type="button" className="nav-item" data-page="loans"><span data-icon="layers"/> Loans</button>
          <button type="button" className="nav-item" data-page="borrowers"><span data-icon="users"/> Borrowers</button>
          <button type="button" className="nav-item" data-page="collections"><span data-icon="hand-coins"/> Collections</button>
          <button type="button" className="nav-item" data-page="schedule"><span data-icon="calendar-days"/> Collection planner</button>
          <button type="button" className="nav-item" data-page="transactions"><span data-icon="arrow-left-right"/> Cashbook</button>
          <a className="nav-item" href="/studio/command"><span data-icon="chart-no-axes-combined"/> V3 Operations Center</a>
        </nav>
        <div className="sidebar-eyebrow nav-group-second">ANALYZE</div>
        <nav className="nav" aria-label="Insights and controls">
          <button type="button" className="nav-item" data-page="reports"><span data-icon="chart-no-axes-combined"/> Insights &amp; reports</button>
          <button type="button" className="nav-item" data-page="controls"><span data-icon="shield-check"/> Reconciliation <span id="nav-warning" className="nav-dot"/></button>
        </nav>
        <div className="sidebar-bottom">
          <button type="button" className="sidebar-create" data-modal="loan"><span data-icon="plus"/> New loan <span data-icon="arrow-right"/></button>
          <div className="status-block"><span className="status-pulse"/><div><strong>Secure workspace</strong><small>Supabase · Authenticated</small></div></div>
          <div className="operator"><span className="avatar">CO</span><span><strong>Portfolio owner</strong><small>Workspace administrator</small></span></div>
          <a className="cloud-link" href="/import">Import historical records</a>
          <form action="/api/signout" method="POST"><button className="cloud-signout" type="submit">Sign out</button></form>
        </div>
      </aside>
      <div className="sidebar-scrim" id="sidebar-scrim" aria-hidden="true" />
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left"><button type="button" className="mobile-menu" id="mobile-menu" aria-label="Toggle menu" aria-expanded="false"><span data-icon="menu"/></button><span className="breadcrumb">COVE / <strong id="breadcrumb">Dashboard</strong></span></div>
          <div className="topbar-right"><span className="secure-label"><span className="top-live"/> WORKSPACE LIVE</span><button type="button" className="top-quick-pay" data-modal="payment"><span data-icon="plus"/> Record collection</button><button type="button" className="icon-btn" id="quick-refresh" title="Refresh data" aria-label="Refresh portfolio"><span data-icon="refresh-cw"/></button><span className="top-avatar" title="Portfolio owner">CO</span></div>
        </header>
        <main className="main" id="main"><div className="loading"><div className="spinner"/><h2>Preparing your portfolio</h2><p>Loading your lending workspace...</p></div></main>
      </div>
    </div>
    <div id="modal-root"/><div id="drawer-root"/><div id="toast-root" role="status" aria-live="polite"/>
    <Script src="/studio-app.js" strategy="afterInteractive"/>
  </>;
}
