import { useMemo, useState } from "react";
import { encryptReport, type ReportAttestation } from "../../client/crypto.js";
import { hasContractConfiguration, hasIssuerConfiguration, publicAppConfig } from "./config.js";
import { deriveCompanySlot } from "./issuer.js";
import { connectWallet, type WalletSession } from "./midnight/wallet.js";
import { searchCompanies, type RegistrySearchResult } from "./registry.js";
import "./styles.css";

type Step = "find" | "file" | "sealed" | "unlocked" | "dossier";

const steps: readonly { id: Step; label: string }[] = [
  { id: "find", label: "Find" },
  { id: "file", label: "File" },
  { id: "sealed", label: "Sealed" },
  { id: "unlocked", label: "Unlocked" },
  { id: "dossier", label: "Dossier" },
];

const friendlyError = (error: unknown): string =>
  error instanceof Error ? error.message : "The action could not be completed. Try again.";

const shortValue = (value: string): string =>
  value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

function App() {
  const [step, setStep] = useState<Step>("find");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RegistrySearchResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<RegistrySearchResult | null>(null);
  const [amount, setAmount] = useState("");
  const [daysLate, setDaysLate] = useState("90");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const publicState = useMemo(
    () => [
      "one opaque 128-byte envelope",
      "one anti-replay nullifier",
      "one evolving history commitment",
      "one threshold boolean",
    ],
    [],
  );

  const handleSearch = async (): Promise<void> => {
    setNotice(null);
    setWorking(true);
    try {
      setSearchResults(await searchCompanies(query));
    } catch (error) {
      setSearchResults([]);
      setNotice(friendlyError(error));
    } finally {
      setWorking(false);
    }
  };

  const handleConnect = async (): Promise<void> => {
    setNotice(null);
    setWorking(true);
    try {
      setWallet(await connectWallet(publicAppConfig.networkId));
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setWorking(false);
    }
  };

  const handlePrepare = async (): Promise<void> => {
    if (!selectedCompany) return;
    setNotice(null);
    setWorking(true);
    try {
      const report: ReportAttestation = {
        amountOverdueMinorUnits: amount,
        daysLate: Number(daysLate),
        invoiceReference,
      };
      const completed = await deriveCompanySlot(selectedCompany.subject.registrationNumber);
      await encryptReport(completed.slotSecret, report);
      setPrepared(true);
      setNotice(
        hasContractConfiguration()
          ? "The encrypted filing is ready for the wallet transaction."
          : "The encrypted filing is ready locally; this deployment has no contract address yet, so nothing was submitted.",
      );
    } catch (error) {
      setPrepared(false);
      setNotice(friendlyError(error));
    } finally {
      setWorking(false);
    }
  };

  const selectCompany = (company: RegistrySearchResult): void => {
    setSelectedCompany(company);
    setStep("file");
    setNotice(null);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Thirdmark home">
          <span className="wordmark-mark" aria-hidden="true">///</span>
          <span>Thirdmark</span>
        </a>
        <div className="topbar-status" aria-live="polite">
          <span className="network-label">{publicAppConfig.networkId}</span>
          <span className={wallet ? "status-dot connected" : "status-dot"} aria-hidden="true" />
          <span>{wallet ? `${wallet.walletName} connected` : "Wallet not connected"}</span>
          <button className="quiet-button" type="button" onClick={() => void handleConnect()} disabled={working || Boolean(wallet)}>
            {wallet ? "Connected" : "Connect wallet"}
          </button>
        </div>
      </header>

      <section className="intro-grid">
        <div>
          <p className="eyebrow">Sealed corroboration on Midnight</p>
          <h1>Say it together.<br /><em>Not alone.</em></h1>
          <p className="lede">
            Three suppliers can attest to the same late payer without making the first
            supplier the only one on record.
          </p>
        </div>
        <div className="tally-panel" aria-label="Three-party threshold">
          <Tally unlocked={step === "unlocked" || step === "dossier"} />
          <p><strong>Threshold 3</strong><br />No sub-threshold count is shown.</p>
        </div>
      </section>

      <nav className="step-nav" aria-label="Filing progress">
        {steps.map((item, index) => {
          const currentIndex = steps.findIndex((candidate) => candidate.id === step);
          const reached = index < currentIndex || (item.id === step);
          return (
            <button
              className={reached ? "step reached" : "step"}
              key={item.id}
              type="button"
              onClick={() => (index <= currentIndex ? setStep(item.id) : undefined)}
              disabled={index > currentIndex}
              aria-current={item.id === step ? "step" : undefined}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>{item.label}
            </button>
          );
        })}
      </nav>

      {notice && <div className="notice" role="status">{notice}</div>}

      <section className="content-grid">
        <div className="primary-column">
          {step === "find" && (
            <section className="panel flow-panel">
              <p className="eyebrow">Step 01</p>
              <h2>Find the company</h2>
              <p className="muted">
                Search an authorized CAC adapter by company name. Thirdmark uses the
                returned RC Number as the canonical subject; it never hashes free text.
              </p>
              <form className="search-form" onSubmit={(event) => { event.preventDefault(); void handleSearch(); }}>
                <label htmlFor="company-search">Company name</label>
                <div className="input-row">
                  <input
                    id="company-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by approved name"
                    autoComplete="organization"
                  />
                  <button type="submit" className="primary-button" disabled={working || query.trim().length < 2 || !publicAppConfig.registryAdapterUrl}>
                    {working ? "Searching" : "Search"}
                  </button>
                </div>
              </form>
              {!publicAppConfig.registryAdapterUrl && (
                <div className="configuration-note">
                  <strong>Registry adapter not configured.</strong>
                  <span>
                    The official CAC public search is available at{" "}
                    <a href="https://icrp.cac.gov.ng/public-search/" target="_blank" rel="noreferrer">icrp.cac.gov.ng</a>,
                    but it does not publish an anonymous autocomplete API. No company
                    identifier is accepted directly in this app.
                  </span>
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="result-list" aria-label="Company results">
                  {searchResults.map((company) => (
                    <button key={company.subject.canonical} type="button" className="result-row" onClick={() => selectCompany(company)}>
                      <span><strong>{company.name}</strong><small>{company.status} · CAC company</small></span>
                      <span className="result-arrow" aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {step === "file" && selectedCompany && (
            <section className="panel flow-panel">
              <p className="eyebrow">Step 02</p>
              <div className="selected-company">
                <div><span className="label">Selected subject</span><strong>{selectedCompany.name}</strong></div>
                <span className="subject-status">{selectedCompany.status}</span>
              </div>
              <h2>File a late payment</h2>
              <p className="muted">The report is encrypted in this browser. Only the fixed-width envelope crosses into the contract.</p>
              <form className="filing-form" onSubmit={(event) => { event.preventDefault(); void handlePrepare(); }}>
                <label htmlFor="amount">Amount overdue <span>minor units</span></label>
                <input id="amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/gu, ""))} placeholder="e.g. 250000" required />
                <label htmlFor="days-late">Days late</label>
                <input id="days-late" type="number" min="90" value={daysLate} onChange={(event) => setDaysLate(event.target.value)} required />
                <label htmlFor="invoice">Invoice reference</label>
                <input id="invoice" value={invoiceReference} onChange={(event) => setInvoiceReference(event.target.value)} maxLength={256} placeholder="Your internal reference" required />
                <button className="primary-button full-width" type="submit" disabled={working || !hasIssuerConfiguration()}>
                  {working ? "Preparing protected filing" : "Prepare protected filing"}
                </button>
                {!hasIssuerConfiguration() && <p className="field-note">The issuer endpoint and sealed public key are not configured for this deployment.</p>}
              </form>
              {prepared && <div className="prepared-note"><strong>Prepared in memory.</strong><span>No report, slot secret, or plaintext has been persisted.</span></div>}
            </section>
          )}

          {step === "sealed" && <StatePanel step="sealed" onBack={() => setStep("file")} />}
          {step === "unlocked" && <StatePanel step="unlocked" onBack={() => setStep("sealed")} />}
          {step === "dossier" && <StatePanel step="dossier" onBack={() => setStep("unlocked")} />}
        </div>

        <PrivacyInspector publicState={publicState} prepared={prepared} />
      </section>
    </main>
  );
}

function Tally({ unlocked }: { readonly unlocked: boolean }) {
  return <div className={unlocked ? "tally confirmed" : "tally"} aria-label={unlocked ? "Threshold met" : "Threshold sealed"}><i /><i /><i /></div>;
}

function PrivacyInspector({ publicState, prepared }: { readonly publicState: readonly string[]; readonly prepared: boolean }) {
  return (
    <aside className="panel inspector">
      <div className="inspector-heading"><span className="eyebrow">Privacy inspector</span><span className="live-mark">{prepared ? "ready" : "live"}</span></div>
      <h2>What crosses the boundary</h2>
      <div className="inspector-group public-group">
        <span className="inspector-label">Public state</span>
        <ul>{publicState.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <div className="inspector-group private-group">
        <span className="inspector-label">Private witness</span>
        <ul><li>company subject</li><li>report plaintext</li><li>slot secret</li><li>filing history contents</li></ul>
      </div>
      <p className="inspector-footnote">An observer can see opaque public occupancy. Without the OPRF-derived subject secret, it cannot label that occupancy with a company.</p>
    </aside>
  );
}

function StatePanel({ step, onBack }: { readonly step: "sealed" | "unlocked" | "dossier"; readonly onBack: () => void }) {
  const copy = {
    sealed: { eyebrow: "Step 03", title: "Filed. Now quiet.", body: "Nothing is visible until two independent suppliers file against the same subject. Thirdmark never shows a sub-threshold count." },
    unlocked: { eyebrow: "Step 04", title: "The third mark changed the state.", body: "Only the three authorized filers can decrypt their records locally. No operator receives the plaintext." },
    dossier: { eyebrow: "Step 05", title: "The dossier is the settlement.", body: "The signed JSON artifact binds the three attestations to the contract, slot, threshold, entry keys, and indexer filing times." },
  }[step];
  return <section className="panel state-panel"><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2><p className="muted">{copy.body}</p><div className="state-placeholder"><Tally unlocked={step !== "sealed"} /><span>{step === "sealed" ? "Waiting for independent corroboration" : "Unlock state requires a real Preprod transaction"}</span></div><button className="quiet-button" type="button" onClick={onBack}>Back</button></section>;
}

export default App;
