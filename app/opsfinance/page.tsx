'use client';

import { useState } from 'react';

const features = [
  {
    title: 'Transaksi',
    description: 'Money In, Money Out,\nTransfer & Journal Entry',
    icon: '↗',
    accent: 'pink',
  },
  {
    title: 'Akaun Kewangan',
    description: 'Bank, Tunai, E-Wallet\n& Kad Kredit',
    icon: '◌',
    accent: 'orange',
  },
  {
    title: 'Carta Akaun',
    description: 'Lengkap & fleksibel\nuntuk perniagaan anda',
    icon: '▣',
    accent: 'purple',
  },
  {
    title: 'Muat Naik & Tukar',
    description: 'Penyata bank, invois,\nresit, PDF, CSV & Excel',
    icon: '⇄',
    accent: 'green',
  },
  {
    title: 'Laporan Kewangan',
    description: 'P&L, Balance Sheet,\nTrial Balance, General Ledger',
    icon: '◫',
    accent: 'cyan',
  },
  {
    title: 'Penyelarasan Bank',
    description: 'Padanan automatik\n& manual',
    icon: '✓',
    accent: 'yellow',
  },
];

const reportLabels = [
  'Profit & Loss',
  'Balance Sheet',
  'Trial Balance',
  'General Ledger',
  'Account Statement',
  'Cash Flow',
];

const trustItems = [
  {
    title: 'Data Selamat',
    description: 'Dienkripsi & backup automatik',
    accent: 'pink',
  },
  {
    title: 'Cloud Based',
    description: 'Akses dari mana-mana sahaja',
    accent: 'purple',
  },
  {
    title: 'Sokongan Malaysia',
    description: 'Kami sentiasa sedia membantu',
    accent: 'orange',
  },
  {
    title: 'Dikemas Kini Sentiasa',
    description: 'Ciri baharu untuk perniagaan anda',
    accent: 'green',
  },
];

export default function OpsFinanceLandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <main className="opsfinance-page">
      <div className="opsfinance-shell">
        <header className="opsfinance-header">
          <div className="brand-wrap" aria-label="OpsFinance brand">
            <div className="brand-mark">OF</div>
            <div className="brand-copy">
              <div className="brand-name">OpsFinance</div>
              <div className="brand-tagline">Accounting Made Simple</div>
            </div>
          </div>

          <nav id="opsfinance-mobile-nav" className={`main-nav ${mobileMenuOpen ? 'nav-open' : ''}`} aria-label="Primary navigation">
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#about" onClick={() => setMobileMenuOpen(false)}>About Us</a>
            <a href="#resources" onClick={() => setMobileMenuOpen(false)}>Resources</a>
            <a href="#contact" onClick={() => setMobileMenuOpen(false)}>Contact</a>
          </nav>

          <div className="header-tools">
            <div className="language-picker" aria-label="Language selector">
              EN | BM | 中文 | தமிழ்
            </div>
            <div className="header-actions">
              <a href="/login" className="ghost-button">
                Login
              </a>
              <a href="/register" className="primary-button">
                Open OpsFinance
              </a>
            </div>
          </div>

          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label="Toggle navigation menu"
            aria-controls="opsfinance-mobile-nav"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((value) => !value)}
          >
            <span />
            <span />
            <span />
          </button>
        </header>

        <section className="hero-section" aria-labelledby="hero-heading">
          <div className="hero-copy">
            <div className="eyebrow">OpsFinance</div>
            <h1 id="hero-heading">
              Urus Akaun Perniagaan
              <span>Dengan Lebih Mudah</span>
            </h1>
            <p className="hero-supporting">
              Catat transaksi, muat naik penyata bank,
              invois dan resit, serta jana laporan kewangan
              dengan mudah dalam satu sistem.
            </p>

            <div className="hero-actions">
              <a href="/register" className="primary-button large">
                Daftar Masuk
              </a>
              <a href="#features" className="secondary-button">
                Lihat Ciri
              </a>
            </div>

            <p className="hero-note">Akses diterima melalui MYOPS dan identiti perniagaan yang sah.</p>

            <div className="feature-badges" aria-label="Product highlights">
              <span>Mudah Digunakan</span>
              <span>Cloud Based</span>
              <span>Data Selamat</span>
              <span>Laporan Lengkap</span>
            </div>
          </div>

          <div className="hero-visual" aria-label="OpsFinance dashboard illustration">
            <div className="dashboard-surface">
              <div className="surface-header">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>

              <div className="dashboard-window">
                <div className="top-metrics">
                  <div className="metric-box accent-pink">
                    <span className="metric-label">Pendapatan</span>
                    <strong>RM 48,200</strong>
                  </div>
                  <div className="metric-box accent-cyan">
                    <span className="metric-label">Belanja</span>
                    <strong>RM 21,500</strong>
                  </div>
                </div>

                <div className="chart-area">
                  <div className="chart-bars">
                    <span style={{ height: '36%' }} />
                    <span style={{ height: '48%' }} />
                    <span style={{ height: '73%' }} />
                    <span style={{ height: '52%' }} />
                    <span style={{ height: '90%' }} />
                    <span style={{ height: '68%' }} />
                    <span style={{ height: '100%' }} />
                  </div>
                  <div className="chart-ring">
                    <div className="ring-inner">
                      <strong>76%</strong>
                    </div>
                  </div>
                </div>

                <div className="bottom-row">
                  <div className="cash-card">
                    <span>Baki Semasa</span>
                    <strong>RM 26,700</strong>
                  </div>
                  <div className="cash-card soft">
                    <span>Hasil</span>
                    <strong>+12.4%</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="floating-card balance-card">
              <span className="mini-label">Baki</span>
              <strong>RM 63,240</strong>
            </div>
            <div className="floating-card invoice-card">
              <span className="mini-label">Invoice</span>
              <strong>12 baru</strong>
            </div>
            <div className="floating-card analytics-card">
              <span className="mini-label">Trend</span>
              <strong>+18.2%</strong>
            </div>
          </div>
        </section>

        <section className="feature-strip" id="features" aria-label="Core features">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <div className={`feature-icon ${feature.accent}`}>{feature.icon}</div>
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="document-section" id="resources" aria-labelledby="upload-heading">
          <div className="document-copy">
            <div className="eyebrow">Muat Naik &amp; Tukar</div>
            <h2 id="upload-heading">
              Muat Naik Penyata Bank,
              <span>Invois &amp; Resit</span>
            </h2>

            <ul className="benefit-list">
              <li>Sokong PDF, CSV, Excel</li>
              <li>Ekstrak data secara automatik</li>
              <li>Semak &amp; kemas sebelum catat</li>
              <li>Jimat masa &amp; kurangkan kesilapan</li>
            </ul>
          </div>

          <div className="document-visual" aria-label="Document upload illustration">
            <div className="file-stack file-one">
              <div className="file-header" />
              <div className="file-body">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="file-stack file-two">
              <div className="file-header" />
              <div className="file-body">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="receipt-card">
              <div className="receipt-check" />
              <div className="receipt-lines">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="bank-badge">Bank Statement</div>
          </div>
        </section>

        <section className="reports-section" id="about" aria-labelledby="reports-heading">
          <div className="reports-copy">
            <div className="eyebrow">Laporan</div>
            <h2 id="reports-heading">
              Lihat Laporan Kewangan
              <span>Perniagaan Anda</span>
            </h2>
            <div className="report-grid" aria-label="Supported financial reports">
              {reportLabels.map((label) => (
                <div className="report-pill" key={label}>
                  {label}
                </div>
              ))}
            </div>
            <p className="report-note">
              Menyemak laporan adalah PERCUMA sepanjang tempoh 7 hari percubaan.
            </p>
          </div>

          <div className="reports-panel" aria-label="Financial reporting preview">
            <div className="report-panel-header">
              <span className="report-badge">P&amp;L</span>
              <span className="report-badge muted">RM 126,400</span>
            </div>
            <div className="report-bars">
              <span style={{ height: '36%' }} />
              <span style={{ height: '52%' }} />
              <span style={{ height: '72%' }} />
              <span style={{ height: '66%' }} />
              <span style={{ height: '88%' }} />
              <span style={{ height: '60%' }} />
            </div>
            <div className="report-summary">
              <div>
                <small>Untung Bersih</small>
                <strong>RM 18,540</strong>
              </div>
              <div>
                <small>Cash Flow</small>
                <strong>RM 23,900</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="trial-section" aria-labelledby="trial-heading">
          <div className="trial-copy">
            <div className="eyebrow">Trial</div>
            <h2 id="trial-heading">7-Day Free Trial</h2>
            <p>
              Semasa percubaan, anda boleh memasukkan transaksi, memuat naik dokumen, dan melihat laporan kewangan.
            </p>
            <div className="trial-list-wrap">
              <div>
                <h3>Semasa trial</h3>
                <ul>
                  <li>Masukkan transaksi</li>
                  <li>Muat naik dokumen</li>
                  <li>Lihat laporan kewangan</li>
                </ul>
              </div>
              <div>
                <h3>Fungsi Asas</h3>
                <ul>
                  <li>Print</li>
                  <li>Download</li>
                  <li>Export</li>
                  <li>Bank Reconciliation</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="benefits-section" aria-labelledby="benefits-heading">
          <div className="section-header centered">
            <div className="eyebrow">Kenapa OpsFinance</div>
            <h2 id="benefits-heading">Nikmati pengalaman akaun yang tenang</h2>
          </div>
          <div className="trust-grid">
            {trustItems.map((item) => (
              <article className="trust-card" key={item.title}>
                <div className={`trust-icon ${item.accent}`} />
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="opsfinance-footer" id="contact">
          <div className="footer-brand">
            <div className="brand-mark small">OF</div>
            <div>
              <div className="brand-name">OpsFinance</div>
              <div className="brand-tagline">Accounting Made Simple</div>
            </div>
          </div>
          <div className="footer-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#about">About Us</a>
            <a href="#resources">Resources</a>
          </div>
          <a href="/register" className="primary-button small-button">
            Cuba Percuma 7 Hari
          </a>
        </footer>
      </div>
    </main>
  );
}
