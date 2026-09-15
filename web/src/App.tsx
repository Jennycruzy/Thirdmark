import { useMemo, useState } from "react";
import { encryptReport, type ReportAttestation } from "../../client/crypto.js";
import { hasContractConfiguration, hasIssuerConfiguration, hasSyntheticSubjectConfiguration, publicAppConfig } from "./config.js";
import { deriveCompanySlot } from "./issuer.js";
import { connectThirdmark, deployExampleCounter, deployThirdmark, type CounterDeploymentReceipt, type DeploymentReceipt, type FilingReceipt, type SlotSnapshot } from "./midnight/contract.js";
import { connectWallet, type WalletSession } from "./midnight/wallet.js";
import { createSyntheticCompany, searchCompanies, type RegistrySearchResult } from "./registry.js";
import "./styles.css";

type Step = "find" | "file" | "sealed" | "unlocked" | "dossier";
type View = "landing" | "workspace";

const steps: readonly { id: Step; label: string }[] = [
  { id: "find", label: "Find" },
  { id: "file", label: "File" },
  { id: "sealed", label: "Sealed" },
  { id: "unlocked", label: "Unlocked" },
  { id: "dossier", label: "Dossier" },
];

type Operation = "company search" | "wallet connection" | "example-counter deployment" | "Thirdmark deployment" | "protected filing";

type ConnectorFailure = {
  readonly code?: string;
  readonly reason?: string;
};

const connectorFailure = (error: unknown): ConnectorFailure => {
  let candidate: unknown = error;
  for (let depth = 0; depth < 4 && candidate && typeof candidate === "object"; depth += 1) {
    const value = candidate as { readonly code?: unknown; readonly reason?: unknown; readonly cause?: unknown; readonly failure?: unknown };
    if (typeof value.code === "string" || typeof value.reason === "string") {
      return {
        code: typeof value.code === "string" ? value.code : undefined,
        reason: typeof value.reason === "string" ? value.reason : undefined,
      };
    }
    candidate = value.cause ?? value.failure;
  }
  return {};
};

const diagnosticMessage = (error: unknown): string => {
  let candidate: unknown = error;
  const parts: string[] = [];
  for (let depth = 0; depth < 5 && candidate && typeof candidate === "object"; depth += 1) {
    const value = candidate as {
      readonly name?: unknown;
      readonly message?: unknown;
      readonly code?: unknown;
      readonly reason?: unknown;
      readonly cause?: unknown;
      readonly failure?: unknown;
    };
    for (const item of [value.name, value.code, value.reason, value.message]) {
      if (typeof item === "string" && item.trim() && !parts.includes(item.trim())) parts.push(item.trim());
    }
    candidate = value.cause ?? value.failure;
  }
  return parts
    .join(": ")
    .replace(/mn_[a-z0-9_]+/giu, "[address]")
    .replace(/\b(?:0x)?[0-9a-f]{32,}\b/giu, "[hex]")
    .replace(/\s+/gu, " ")
    .slice(0, 240);
};

const friendlyError = (error: unknown, operation: Operation = "protected filing"): string => {
  const message = error instanceof Error ? error.message : "";
  const connector = connectorFailure(error);
  const connectorCode = connector.code ?? "";
  const reason = `${connector.reason ?? ""} ${message}`.toLowerCase();
  if (reason.includes("wallet is syncing") || reason.includes("wallet syncing")) {
    return "1AM is still syncing Preprod. Keep 1AM open until sync finishes, then click Reconnect wallet in Thirdmark.";
  }
  if (connectorCode === "PermissionRejected") return "1AM denied this app's wallet permission. Reconnect Thirdmark in 1AM and try again.";
  if (connectorCode === "Rejected") return "The wallet request was rejected. Approve the transaction in 1AM and try again.";
  if (connectorCode === "InvalidRequest") return `The wallet rejected the ${operation} request as invalid. Reload Thirdmark and reconnect 1AM.`;
  if (connectorCode === "Disconnected") return "The 1AM connection was lost. Reconnect the wallet and try again.";
  if (connectorCode === "InternalError") return "1AM could not start delegated proving. Keep 1AM open, reload Thirdmark, reconnect, and try again.";
  if (reason.includes("proving") || reason.includes("prover")) {
    return "1AM could not start delegated proving. Keep 1AM open, reload Thirdmark, reconnect, and try again.";
  }
  if (message.includes("wallet") || message.includes("network")) {
    return "The wallet is not ready. Connect a Midnight wallet on Preprod and try again.";
  }
  if (message.includes("issuer")) return "The private company reference could not be derived. Check the privacy service and try again.";
  if (message.includes("registry")) return "The company search is unavailable. Check the lookup connection and try again.";
  if (message.includes("contract")) return "The Thirdmark contract is not available on this network.";
  if (message.includes("balance") || message.includes("fund") || message.includes("DUST")) {
    return `The wallet could not balance the ${operation}. Confirm that 1AM is synced on Preprod and try again.`;
  }
  if (message.includes("prover") || message.includes("zk") || message.includes("key material") || message.includes("404")) {
    return `The proving assets for the ${operation} are unavailable. Reload the app and try again.`;
  }
  if (message.includes("ciphertext") || message.includes("report")) return "Check the filing fields and try again.";
  if (operation === "company search") return "The company search is unavailable. Check the lookup connection and try again.";
  if (operation === "wallet connection") return "The wallet connection could not be completed. Unlock 1AM on Preprod and try again.";
  if (operation === "example-counter deployment") return "The example-counter deployment could not be completed. Check the 1AM approval and try again.";
  if (operation === "Thirdmark deployment") return "The Thirdmark deployment could not be completed. Check the wallet approval and try again.";
  return "The protected filing could not be completed. Check the connection and try again.";
};

const shortValue = (value: string): string =>
  value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

function App() {
  const [view, setView] = useState<View>("landing");
  const [step, setStep] = useState<Step>("find");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RegistrySearchResult[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<RegistrySearchResult | null>(null);
  const [amount, setAmount] = useState("");
  const [daysLate, setDaysLate] = useState("90");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [fileReceipt, setFileReceipt] = useState<FilingReceipt | null>(null);
  const [slotSnapshot, setSlotSnapshot] = useState<SlotSnapshot | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [working, setWorking] = useState(false);
  const [workingStage, setWorkingStage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [counterDeployment, setCounterDeployment] = useState<CounterDeploymentReceipt | null>(null);
  const [deployment, setDeployment] = useState<DeploymentReceipt | null>(null);

  const syntheticCompany = useMemo(
    () => hasSyntheticSubjectConfiguration()
      ? createSyntheticCompany(publicAppConfig.syntheticSubjectName, publicAppConfig.syntheticSubjectRc)
      : null,
    [],
  );

  const publicState = useMemo(
    () => [
      "one encrypted report envelope",
      "one repeat-submission guard",
      "one private-history commitment",
      "one threshold result",
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
      setNotice(friendlyError(error, "company search"));
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
      setNotice(friendlyError(error, "wallet connection"));
    } finally {
      setWorking(false);
    }
  };

  const handleDisconnect = (): void => {
    // The connector API has no disconnect method. This detaches the session from
    // Thirdmark so the user can reconnect after 1AM finishes syncing.
    setWallet(null);
    setNotice("Thirdmark disconnected. Keep 1AM open until syncing finishes, then reconnect.");
  };

  const handleFile = async (): Promise<void> => {
    if (!selectedCompany || !wallet) {
      setNotice("Connect a Midnight wallet before filing.");
      return;
    }
    if (!hasIssuerConfiguration() || !hasContractConfiguration()) {
      setNotice("This workspace is not connected to the deployed privacy contract yet.");
      return;
    }
    let filingFinalized = false;
    let lastStage = "starting the protected filing";
    const reportStage = (stage: string): void => {
      lastStage = stage;
      setWorkingStage(stage);
    };

    setNotice(null);
    setWorking(true);
    reportStage("Deriving a blinded company slot");
    try {
      const report: ReportAttestation = {
        amountOverdueMinorUnits: amount,
        daysLate: Number(daysLate),
        invoiceReference,
      };
      const completed = await deriveCompanySlot(selectedCompany.subject.registrationNumber);
      reportStage("Encrypting the attestation in this browser");
      const ciphertext = await encryptReport(completed.slotSecret, report);
      reportStage("Preparing the Midnight contract call");
      const contract = await connectThirdmark(wallet, completed);
      reportStage("Proving and submitting the protected filing");
      const receipt = await contract.file(completed, ciphertext);
      filingFinalized = true;
      setFileReceipt(receipt);
      setPrepared(true);
      reportStage("Reading the finalized public state");
      const snapshot = await contract.readSlot(completed);
      setSlotSnapshot(snapshot);
      setStep(receipt.unlocked ? "unlocked" : "sealed");
      setNotice(receipt.unlocked ? "The threshold bit is true. The three records are available only in this browser." : "Filing finalized. The record remains sealed until the threshold is met.");
    } catch (error) {
      if (!filingFinalized) setPrepared(false);
      const diagnostic = diagnosticMessage(error);
      setNotice(`${friendlyError(error, "protected filing")} Last stage: ${lastStage}.${diagnostic ? ` Diagnostic: ${diagnostic}.` : ""}`);
    } finally {
      setWorking(false);
      setWorkingStage(null);
    }
  };

  const handleDeploy = async (): Promise<void> => {
    if (!wallet) {
      setNotice("Connect a Midnight wallet on Preprod before deploying.");
      return;
    }
    if (!hasIssuerConfiguration()) {
      setNotice("The public issuer key is not configured for this deployment.");
      return;
    }
    setNotice(null);
    setWorking(true);
    let lastStage = "preparing the Midnight wallet deployment";
    try {
      const receipt = await deployThirdmark(wallet, (stage) => {
        lastStage = stage.toLowerCase();
        setWorkingStage(stage);
      });
      setDeployment(receipt);
      setNotice("Deployment submitted through the connected Midnight wallet. Keep this receipt for the Preprod record.");
    } catch (error) {
      const diagnostic = diagnosticMessage(error);
      setNotice(`${friendlyError(error, "Thirdmark deployment")} Last stage: ${lastStage}.${diagnostic ? ` Diagnostic: ${diagnostic}.` : ""}`);
    } finally {
      setWorking(false);
      setWorkingStage(null);
    }
  };

  const handleCounterDeploy = async (): Promise<void> => {
    if (!wallet) {
      setNotice("Connect a Midnight wallet on Preprod before deploying.");
      return;
    }
    setNotice(null);
    setWorking(true);
    let lastStage = "requesting wallet permissions";
    try {
      setWorkingStage("Requesting wallet permissions for this deployment");
      await wallet.api.hintUsage(["getProvingProvider", "balanceUnsealedTransaction", "submitTransaction"]);
      setWorkingStage("Preparing the example-counter deployment");
      lastStage = "preparing the example-counter deployment";
      const receipt = await deployExampleCounter(wallet, (stage) => {
        lastStage = stage.toLowerCase();
        setWorkingStage(stage);
      });
      setCounterDeployment(receipt);
      setNotice("The canonical example-counter deployment was submitted through the connected Midnight wallet.");
    } catch (error) {
      const diagnostic = diagnosticMessage(error);
      setNotice(`${friendlyError(error, "example-counter deployment")} Last stage: ${lastStage}.${diagnostic ? ` Diagnostic: ${diagnostic}.` : ""}`);
    } finally {
      setWorking(false);
      setWorkingStage(null);
    }
  };

  const selectCompany = (company: RegistrySearchResult): void => {
    setSelectedCompany(company);
    setStep("file");
    setNotice(null);
  };

  return (
    <main className={`app-shell ${view === "landing" ? "landing-shell" : "workspace-shell"}`}>
      <header className="topbar">
        <button className="wordmark" type="button" onClick={() => setView("landing")} aria-label="Thirdmark home">
          <span className="wordmark-mark" aria-hidden="true">///</span>
          <span>Thirdmark</span>
        </button>
        {view === "landing" ? (
          <div className="topbar-status" aria-label="Network status">
            <span className="network-label">Preprod prototype</span>
            <button className="quiet-button" type="button" onClick={() => setView("workspace")}>Open workspace</button>
          </div>
        ) : (
          <div className="topbar-status" aria-live="polite">
            <span className="network-label">{publicAppConfig.networkId}</span>
            <span className={wallet ? "status-dot connected" : "status-dot"} aria-hidden="true" />
            <span>{wallet ? `${wallet.walletName} connected` : "Wallet not connected"}</span>
            {wallet ? (
              <button className="quiet-button" type="button" onClick={handleDisconnect} disabled={working}>
                Disconnect
              </button>
            ) : (
              <button className="quiet-button" type="button" onClick={() => void handleConnect()} disabled={working}>
                Reconnect wallet
              </button>
            )}
          </div>
        )}
      </header>

      {view === "landing" ? <LandingPage onOpenWorkspace={() => setView("workspace")} /> : (<>
      <section className="intro-grid">
        <div>
          <p className="eyebrow">Private filing workspace</p>
          <h1>File without<br /><em>standing alone.</em></h1>
          <p className="lede">
            Each report stays sealed until three independent suppliers choose the same company reference.
          </p>
        </div>
        <div className="tally-panel" aria-label="Three-party threshold">
          <Tally unlocked={step === "unlocked" || step === "dossier"} />
          <p><strong>Three marks</strong><br />The tally changes only at the threshold.</p>
        </div>
      </section>

      {!hasContractConfiguration() && (
        <section className="panel deployment-panel" aria-labelledby="deployment-title">
          <p className="eyebrow">Preprod deployment</p>
          <h2 id="deployment-title">Connect the deployed privacy contract.</h2>
          <p className="muted">
            This setup panel appears only when a public contract address is missing. Approve deployment in your
            connected wallet; no seed or wallet key is handled by this page.
          </p>
          <div className="deployment-actions">
            <button className="quiet-button" type="button" onClick={() => void handleCounterDeploy()} disabled={working || !wallet}>
              {working ? "Preparing deployment…" : "Deploy canonical example-counter first"}
            </button>
            <span className="field-note">This is the required wallet and Preprod smoke test.</span>
          </div>
          {counterDeployment && (
            <dl className="deployment-receipt">
              <div><dt>Counter contract</dt><dd>{counterDeployment.contractAddress}</dd></div>
              <div><dt>Transaction</dt><dd>{counterDeployment.txId}</dd></div>
              <div><dt>Transaction hash</dt><dd>{counterDeployment.txHash}</dd></div>
              <div><dt>Block</dt><dd>{counterDeployment.blockHeight ?? "pending indexer confirmation"}</dd></div>
            </dl>
          )}
          <button className="primary-button" type="button" onClick={() => void handleDeploy()} disabled={working || !wallet || !hasIssuerConfiguration()}>
            {working ? "Preparing deployment…" : "Deploy Thirdmark through wallet"}
          </button>
          {!wallet && <p className="field-note">Connect a Midnight wallet on Preprod first.</p>}
          {!hasIssuerConfiguration() && <p className="field-note">The deployment still needs the public issuer key configuration.</p>}
          {deployment && (
            <dl className="deployment-receipt">
              <div><dt>Contract</dt><dd>{deployment.contractAddress}</dd></div>
              <div><dt>Transaction</dt><dd>{deployment.txId}</dd></div>
              <div><dt>Transaction hash</dt><dd>{deployment.txHash}</dd></div>
              <div><dt>Block</dt><dd>{deployment.blockHeight ?? "pending indexer confirmation"}</dd></div>
            </dl>
          )}
        </section>
      )}

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
                Choose a company reference. The lookup turns an approved name into a canonical CAC number so
                suppliers who have never met still point to the same subject. Free text never becomes the key.
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
                  <strong>Company lookup is not connected.</strong>
                  <span>
                    Start the local lookup service before searching. The official CAC public search is available at{" "}
                    <a href="https://icrp.cac.gov.ng/public-search/" target="_blank" rel="noreferrer">icrp.cac.gov.ng</a>,
                    but this page uses the configured adapter so no identifier needs to be typed.
                  </span>
                </div>
              )}
              {syntheticCompany && (
                <div className="synthetic-card" aria-labelledby="synthetic-subject-title">
                  <p className="eyebrow">Safe synthetic subject</p>
                  <h3 id="synthetic-subject-title">{syntheticCompany.name}</h3>
                  <p>
                    A deliberately invalid registry reference for local testing and recordings. It is not a CAC
                    company and must never be presented as one.
                  </p>
                  <button className="quiet-button" type="button" onClick={() => selectCompany(syntheticCompany)} disabled={working}>
                    Use the synthetic subject
                  </button>
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="result-list" aria-label="Company results">
                  <p className="result-heading">Live CAC results — use the synthetic subject for recordings</p>
                  {searchResults.map((company) => (
                    <button key={company.subject.canonical} type="button" className="result-row" onClick={() => selectCompany(company)}>
                      <span><strong>{company.name}</strong><small>{company.status} · live CAC result</small></span>
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
                <div><span className="label">Selected company reference</span><strong>{selectedCompany.name}</strong></div>
                <span className={selectedCompany.source === "synthetic" ? "subject-status synthetic-status" : "subject-status"}>
                  {selectedCompany.source === "synthetic" ? "synthetic only" : selectedCompany.status}
                </span>
              </div>
              {selectedCompany.source === "synthetic" ? (
                <p className="selection-note synthetic-note">Synthetic subject selected. This is the only safe subject for screenshots and recordings.</p>
              ) : (
                <p className="selection-note">Live CAC result selected. Do not use this company in a public recording.</p>
              )}
              <h2>File a late payment</h2>
              <p className="muted">The report is encrypted in this browser. Only an opaque envelope and the minimum threshold proofs cross into the public ledger.</p>
              <form className="filing-form" onSubmit={(event) => { event.preventDefault(); void handleFile(); }}>
                <label htmlFor="amount">Amount overdue <span>minor units</span></label>
                <input id="amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/gu, ""))} placeholder="e.g. 250000" required />
                <label htmlFor="days-late">Days late</label>
                <input id="days-late" type="number" min="90" value={daysLate} onChange={(event) => setDaysLate(event.target.value)} required />
                <label htmlFor="invoice">Invoice reference</label>
                <input id="invoice" value={invoiceReference} onChange={(event) => setInvoiceReference(event.target.value)} maxLength={256} placeholder="Your internal reference" required />
                <button className="primary-button full-width" type="submit" disabled={working || !hasIssuerConfiguration() || !hasContractConfiguration() || !wallet}>
                  {working ? (workingStage ?? "Working") : "Submit sealed report"}
                </button>
                {!hasIssuerConfiguration() && <p className="field-note">The privacy service is not connected for this workspace.</p>}
                {!hasContractConfiguration() && <p className="field-note">The deployed contract is not connected; this page will not claim a local-only filing.</p>}
                {!wallet && <p className="field-note">Connect the Midnight wallet before submitting a filing.</p>}
              </form>
              {prepared && fileReceipt && <div className="prepared-note">
                <strong>{fileReceipt.unlocked ? "Threshold met." : "Filing finalized."}</strong>
                <span>Transaction {shortValue(fileReceipt.txId)} · block {fileReceipt.blockHeight}</span>
                <span>Only the encrypted envelope and threshold protections crossed the boundary.</span>
              </div>}
            </section>
          )}

          {step === "sealed" && <StatePanel step="sealed" receipt={fileReceipt} snapshot={slotSnapshot} onBack={() => setStep("file")} />}
          {step === "unlocked" && <StatePanel step="unlocked" receipt={fileReceipt} snapshot={slotSnapshot} onBack={() => setStep("sealed")} />}
          {step === "dossier" && <StatePanel step="dossier" receipt={fileReceipt} snapshot={slotSnapshot} onBack={() => setStep("unlocked")} />}
        </div>

        <PrivacyInspector publicState={publicState} prepared={prepared} receipt={fileReceipt} />
      </section>
      </>)}
    </main>
  );
}

function LandingPage({ onOpenWorkspace }: { readonly onOpenWorkspace: () => void }) {
  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="eyebrow">Sealed corroboration on Midnight</p>
          <h1>Three suppliers know.<br /><em>None stands alone.</em></h1>
          <p className="landing-lede">
            Thirdmark lets suppliers report the same late payer without making the first report an exposed,
            isolated accusation. Each report stays sealed until the third independent filing.
          </p>
          <div className="landing-actions">
            <button className="primary-button" type="button" onClick={onOpenWorkspace}>Open the filing workspace</button>
            <a className="quiet-button link-button" href="https://github.com/Jennycruzy/Thirdmark" target="_blank" rel="noreferrer">View the source</a>
          </div>
          <p className="landing-caption">Wave 1 prototype · Nigeria CAC subject lookup · Midnight Preprod</p>
        </div>
        <div className="landing-threshold" aria-label="Three independent filings are required">
          <div className="threshold-marks"><i /><i /><i /></div>
          <p className="eyebrow">The rule</p>
          <strong>One is sealed.<br />Two are still sealed.<br />Three unlock.</strong>
          <span>The count itself is never shown below the threshold.</span>
        </div>
      </section>

      <section className="landing-section landing-problem">
        <div className="section-heading"><p className="eyebrow">The problem</p><h2>Late payment is easier to survive together.</h2></div>
        <div className="problem-copy"><p>A supplier can know a customer is 90+ days overdue and still keep quiet because being the only one to say it can cost them the relationship.</p><p>Thirdmark changes the decision. The first two suppliers do not become a public list. They become part of a private threshold that only opens when independent corroboration exists.</p></div>
      </section>

      <section className="landing-section landing-flow">
        <div className="section-heading"><p className="eyebrow">The flow</p><h2>Private input. One public outcome.</h2></div>
        <div className="flow-cards">
          <article><span>01</span><h3>Choose the same company</h3><p>A registry lookup gives every supplier the same canonical company reference.</p></article>
          <article><span>02</span><h3>Submit a sealed report</h3><p>The browser encrypts the amount, delay, and invoice reference before anything reaches the ledger.</p></article>
          <article><span>03</span><h3>Unlock only at three</h3><p>The third independent filing changes one public fact: the threshold has been met.</p></article>
          <article><span>04</span><h3>Settle as a dossier</h3><p>The three filers can decrypt their records locally and produce an artifact for verification.</p></article>
        </div>
      </section>

      <section className="landing-section boundary-section">
        <div className="boundary-card public-boundary"><p className="eyebrow">Visible to the ledger</p><h2>Opaque state</h2><ul><li>Encrypted report envelope</li><li>Repeat-submission guard</li><li>Private-history commitment</li><li>Threshold result</li></ul></div>
        <div className="boundary-card private-boundary"><p className="eyebrow">Kept in the browser</p><h2>Report details</h2><ul><li>Company reference</li><li>Amount and days late</li><li>Invoice reference</li><li>Filing history and slot secret</li></ul></div>
      </section>

      <section className="landing-section landing-links">
        <div className="section-heading"><p className="eyebrow">Judge in five minutes</p><h2>Start with the evidence.</h2></div>
        <div className="judge-links">
          <a href="https://github.com/Jennycruzy/Thirdmark" target="_blank" rel="noreferrer"><strong>Source repository</strong><span>Contract, client, simulator, browser, and evidence.</span>↗</a>
          <a href="https://docs.midnight.network/" target="_blank" rel="noreferrer"><strong>Midnight documentation</strong><span>The platform this selective-disclosure design depends on.</span>↗</a>
          <a href="https://icrp.cac.gov.ng/public-search/" target="_blank" rel="noreferrer"><strong>Nigeria CAC public search</strong><span>The official registry boundary used for company references.</span>↗</a>
          <a href="https://app.circleci.com/pipelines/github/Jennycruzy/Thirdmark" target="_blank" rel="noreferrer"><strong>Build evidence</strong><span>Managed full-proof validation and browser checks.</span>↗</a>
        </div>
      </section>

      <section className="landing-section limits-section">
        <p className="eyebrow">What it does not hide</p>
        <h2>Privacy has boundaries. We name them.</h2>
        <p>An observer who can derive an exact private slot key can query that slot’s aggregate occupancy. The single Wave 1 issuer can also rate-limit or refuse service. It cannot read report plaintext or force a reveal. These are design limits, not footnotes.</p>
        <button className="primary-button" type="button" onClick={onOpenWorkspace}>Open the workspace</button>
      </section>
    </div>
  );
}

function Tally({ unlocked }: { readonly unlocked: boolean }) {
  return <div className={unlocked ? "tally confirmed" : "tally"} aria-label={unlocked ? "Threshold met" : "Threshold sealed"}><i /><i /><i /></div>;
}

function PrivacyInspector({ publicState, prepared, receipt }: { readonly publicState: readonly string[]; readonly prepared: boolean; readonly receipt: FilingReceipt | null }) {
  return (
    <aside className="panel inspector">
      <div className="inspector-heading"><span className="eyebrow">Privacy inspector</span><span className="live-mark">{prepared ? "ready" : "live"}</span></div>
      <h2>What crosses the boundary</h2>
      <div className="inspector-group public-group">
        <span className="inspector-label">Visible to the ledger</span>
        <ul>{publicState.map((item) => <li key={item}>{item}</li>)}{receipt && <li>private-history proof {shortValue(Array.from(receipt.historyCommitment, (byte) => byte.toString(16).padStart(2, "0")).join(""))}</li>}</ul>
      </div>
      <div className="inspector-group private-group">
        <span className="inspector-label">Kept in this browser</span>
        <ul><li>company reference</li><li>report details</li><li>slot secret</li><li>filing history</li></ul>
      </div>
      <p className="inspector-footnote">The ledger sees opaque occupancy. Without the private company reference, it cannot label that state with a company.</p>
    </aside>
  );
}

function StatePanel({ step, receipt, snapshot, onBack }: { readonly step: "sealed" | "unlocked" | "dossier"; readonly receipt: FilingReceipt | null; readonly snapshot: SlotSnapshot | null; readonly onBack: () => void }) {
  const copy = {
    sealed: { eyebrow: "Step 03", title: "Filed. Still sealed.", body: "Nothing is visible until two more independent suppliers file against the same company reference. No sub-threshold count is shown." },
    unlocked: { eyebrow: "Step 04", title: "The third mark changed the state.", body: "Only the three participating filers can decrypt their records locally. No service receives the report details." },
    dossier: { eyebrow: "Step 05", title: "The dossier is the settlement.", body: "The final artifact joins the three attestations with public ledger evidence. Dates and approvals must come from the completed chain read path." },
  }[step];
  return <section className="panel state-panel"><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2><p className="muted">{copy.body}</p><div className="state-placeholder"><Tally unlocked={step !== "sealed"} /><span>{step === "sealed" ? (receipt ? `Transaction ${shortValue(receipt.txId)} is sealed at the threshold.` : "Waiting for an actual filing transaction") : snapshot?.unlocked ? `${snapshot.records?.length ?? 0} decrypted attestations are held in this browser.` : "Unlock requires a finalized threshold transaction."}</span></div>{step === "unlocked" && snapshot?.records && <div className="record-list" aria-label="Decrypted attestations">{snapshot.records.map((record, index) => <article className="record-card" key={`${record.invoiceReference}-${index}`}><span className="label">Attestation {index + 1}</span><strong>{record.amountOverdueMinorUnits} minor units overdue</strong><span>{record.daysLate} days late · {record.invoiceReference}</span></article>)}</div>}<button className="quiet-button" type="button" onClick={onBack}>Back</button></section>;
}

export default App;
