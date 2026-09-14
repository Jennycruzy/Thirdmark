import { useMemo, useState } from "react";
import { encryptReport, type ReportAttestation } from "../../client/crypto.js";
import { hasContractConfiguration, hasIssuerConfiguration, publicAppConfig } from "./config.js";
import { deriveCompanySlot } from "./issuer.js";
import { connectThirdmark, deployExampleCounter, deployThirdmark, type CounterDeploymentReceipt, type DeploymentReceipt, type FilingReceipt, type SlotSnapshot } from "./midnight/contract.js";
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

type Operation = "company search" | "wallet connection" | "example-counter deployment" | "Thirdmark deployment" | "protected filing";

const friendlyError = (error: unknown, operation: Operation = "protected filing"): string => {
  const message = error instanceof Error ? error.message : "";
  const connectorCode = typeof error === "object" && error !== null && "code" in error
    ? String((error as { readonly code?: unknown }).code)
    : "";
  if (connectorCode === "PermissionRejected") return "1AM denied this app's wallet permission. Reconnect Thirdmark in 1AM and try again.";
  if (connectorCode === "Rejected") return "The wallet request was rejected. Approve the transaction in 1AM and try again.";
  if (connectorCode === "InvalidRequest") return `The wallet rejected the ${operation} request as invalid. Reload Thirdmark and reconnect 1AM.`;
  if (connectorCode === "Disconnected") return "The 1AM connection was lost. Reconnect the wallet and try again.";
  if (message.includes("wallet") || message.includes("network")) {
    return "The wallet is not ready. Connect a Midnight wallet on Preprod and try again.";
  }
  if (message.includes("issuer")) return "The issuer could not complete the blinded request. Try again later.";
  if (message.includes("registry")) return "The company search is unavailable. Try again or contact the registry adapter operator.";
  if (message.includes("contract")) return "The Thirdmark contract is not available on this network.";
  if (message.includes("balance") || message.includes("fund") || message.includes("DUST")) {
    return `The wallet could not balance the ${operation}. Confirm that 1AM is synced on Preprod and try again.`;
  }
  if (message.includes("prover") || message.includes("zk") || message.includes("key material") || message.includes("404")) {
    return `The proving assets for the ${operation} are unavailable. Reload the app and try again.`;
  }
  if (message.includes("ciphertext") || message.includes("report")) return "Check the filing fields and try again.";
  if (operation === "company search") return "The company search is unavailable. Try again or contact the registry adapter operator.";
  if (operation === "wallet connection") return "The wallet connection could not be completed. Unlock 1AM on Preprod and try again.";
  if (operation === "example-counter deployment") return "The example-counter deployment could not be completed. Check the 1AM approval and try again.";
  if (operation === "Thirdmark deployment") return "The Thirdmark deployment could not be completed. Check the wallet approval and try again.";
  return "The protected filing could not be completed. Check the connection and try again.";
};

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
  const [fileReceipt, setFileReceipt] = useState<FilingReceipt | null>(null);
  const [slotSnapshot, setSlotSnapshot] = useState<SlotSnapshot | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [working, setWorking] = useState(false);
  const [workingStage, setWorkingStage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [counterDeployment, setCounterDeployment] = useState<CounterDeploymentReceipt | null>(null);
  const [deployment, setDeployment] = useState<DeploymentReceipt | null>(null);

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

  const handleFile = async (): Promise<void> => {
    if (!selectedCompany || !wallet) {
      setNotice("Connect a Midnight wallet before filing.");
      return;
    }
    if (!hasIssuerConfiguration() || !hasContractConfiguration()) {
      setNotice("This deployment is not connected to the issuer and Thirdmark contract yet.");
      return;
    }
    setNotice(null);
    setWorking(true);
    setWorkingStage("Deriving a blinded company slot");
    let filingFinalized = false;
    try {
      const report: ReportAttestation = {
        amountOverdueMinorUnits: amount,
        daysLate: Number(daysLate),
        invoiceReference,
      };
      const completed = await deriveCompanySlot(selectedCompany.subject.registrationNumber);
      setWorkingStage("Encrypting the attestation in this browser");
      const ciphertext = await encryptReport(completed.slotSecret, report);
      setWorkingStage("Preparing the Midnight contract call");
      const contract = await connectThirdmark(wallet, completed);
      setWorkingStage("Proving and submitting the protected filing");
      const receipt = await contract.file(completed, ciphertext);
      filingFinalized = true;
      setFileReceipt(receipt);
      setPrepared(true);
      setWorkingStage("Reading the finalized public state");
      const snapshot = await contract.readSlot(completed);
      setSlotSnapshot(snapshot);
      setStep(receipt.unlocked ? "unlocked" : "sealed");
      setNotice(receipt.unlocked ? "The threshold bit is true. The three records are available only in this browser." : "Filing finalized. The record remains sealed until the threshold is met.");
    } catch (error) {
      if (!filingFinalized) setPrepared(false);
      setNotice(friendlyError(error, "protected filing"));
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
    setWorkingStage("Preparing the Midnight wallet deployment");
    try {
      setWorkingStage("The Midnight wallet is balancing and signing the deployment");
      const receipt = await deployThirdmark(wallet);
      setDeployment(receipt);
      setNotice("Deployment submitted through the connected Midnight wallet. Keep this receipt for the Preprod record.");
    } catch (error) {
      setNotice(friendlyError(error, "Thirdmark deployment"));
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
      setNotice(`${friendlyError(error, "example-counter deployment")} Last stage: ${lastStage}.`);
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

      {!hasContractConfiguration() && (
        <section className="panel deployment-panel" aria-labelledby="deployment-title">
          <p className="eyebrow">Preprod deployment</p>
          <h2 id="deployment-title">Deploy through a Midnight wallet, not the headless CLI.</h2>
          <p className="muted">
            The browser wallet keeps its own synchronized state. Approve the deployment in your connected wallet;
            no seed, wallet key, or local historical replay is used here.
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
              <form className="filing-form" onSubmit={(event) => { event.preventDefault(); void handleFile(); }}>
                <label htmlFor="amount">Amount overdue <span>minor units</span></label>
                <input id="amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/gu, ""))} placeholder="e.g. 250000" required />
                <label htmlFor="days-late">Days late</label>
                <input id="days-late" type="number" min="90" value={daysLate} onChange={(event) => setDaysLate(event.target.value)} required />
                <label htmlFor="invoice">Invoice reference</label>
                <input id="invoice" value={invoiceReference} onChange={(event) => setInvoiceReference(event.target.value)} maxLength={256} placeholder="Your internal reference" required />
                <button className="primary-button full-width" type="submit" disabled={working || !hasIssuerConfiguration() || !hasContractConfiguration() || !wallet}>
                  {working ? (workingStage ?? "Working") : "File protected record"}
                </button>
                {!hasIssuerConfiguration() && <p className="field-note">The issuer endpoint and sealed public key are not configured for this deployment.</p>}
                {!hasContractConfiguration() && <p className="field-note">The Preprod contract address is not configured; no local-only button is offered.</p>}
                {!wallet && <p className="field-note">Connect the Midnight wallet before submitting a filing.</p>}
              </form>
              {prepared && fileReceipt && <div className="prepared-note">
                <strong>{fileReceipt.unlocked ? "Threshold met." : "Filing finalized."}</strong>
                <span>Transaction {shortValue(fileReceipt.txId)} · block {fileReceipt.blockHeight}</span>
                <span>Only the opaque envelope, nullifier, and history commitment crossed the boundary.</span>
              </div>}
            </section>
          )}

          {step === "sealed" && <StatePanel step="sealed" receipt={fileReceipt} snapshot={slotSnapshot} onBack={() => setStep("file")} />}
          {step === "unlocked" && <StatePanel step="unlocked" receipt={fileReceipt} snapshot={slotSnapshot} onBack={() => setStep("sealed")} />}
          {step === "dossier" && <StatePanel step="dossier" receipt={fileReceipt} snapshot={slotSnapshot} onBack={() => setStep("unlocked")} />}
        </div>

        <PrivacyInspector publicState={publicState} prepared={prepared} receipt={fileReceipt} />
      </section>
    </main>
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
        <span className="inspector-label">Public state</span>
        <ul>{publicState.map((item) => <li key={item}>{item}</li>)}{receipt && <li>history commitment {shortValue(Array.from(receipt.historyCommitment, (byte) => byte.toString(16).padStart(2, "0")).join(""))}</li>}</ul>
      </div>
      <div className="inspector-group private-group">
        <span className="inspector-label">Private witness</span>
        <ul><li>company subject</li><li>report plaintext</li><li>slot secret</li><li>filing history contents</li></ul>
      </div>
      <p className="inspector-footnote">An observer can see opaque public occupancy. Without the OPRF-derived subject secret, it cannot label that occupancy with a company.</p>
    </aside>
  );
}

function StatePanel({ step, receipt, snapshot, onBack }: { readonly step: "sealed" | "unlocked" | "dossier"; readonly receipt: FilingReceipt | null; readonly snapshot: SlotSnapshot | null; readonly onBack: () => void }) {
  const copy = {
    sealed: { eyebrow: "Step 03", title: "Filed. Now quiet.", body: "Nothing is visible until two independent suppliers file against the same subject. Thirdmark never shows a sub-threshold count." },
    unlocked: { eyebrow: "Step 04", title: "The third mark changed the state.", body: "Only the three authorized filers can decrypt their records locally. No operator receives the plaintext." },
    dossier: { eyebrow: "Step 05", title: "The dossier is the settlement.", body: "Dossier export follows the timestamped entry read path. This build does not invent filing dates that the current contract has not recorded." },
  }[step];
  return <section className="panel state-panel"><p className="eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2><p className="muted">{copy.body}</p><div className="state-placeholder"><Tally unlocked={step !== "sealed"} /><span>{step === "sealed" ? (receipt ? `Transaction ${shortValue(receipt.txId)} is sealed at the threshold.` : "Waiting for an actual filing transaction") : snapshot?.unlocked ? `${snapshot.records?.length ?? 0} decrypted attestations are held in this browser.` : "Unlock requires a finalized threshold transaction."}</span></div>{step === "unlocked" && snapshot?.records && <div className="record-list" aria-label="Decrypted attestations">{snapshot.records.map((record, index) => <article className="record-card" key={`${record.invoiceReference}-${index}`}><span className="label">Attestation {index + 1}</span><strong>{record.amountOverdueMinorUnits} minor units overdue</strong><span>{record.daysLate} days late · {record.invoiceReference}</span></article>)}</div>}<button className="quiet-button" type="button" onClick={onBack}>Back</button></section>;
}

export default App;
