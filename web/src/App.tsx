import { useMemo, useState, type ChangeEvent } from "react";
import { encryptReport, type ReportAttestation } from "../../client/crypto.js";
import {
  createDossier,
  parseSignedDossier,
  serializeSignedDossier,
  signDossier,
  verifySignedDossier,
  type Dossier,
  type DossierSignature,
  type SignedDossier,
} from "../../client/dossier.js";
import { getContractAddress, hasContractConfiguration, hasIssuerConfiguration, hasSyntheticSubjectConfiguration, rememberContractAddress, publicAppConfig } from "./config.js";
import { deriveCompanySlot } from "./issuer.js";
import { connectThirdmark, deployExampleCounter, deployThirdmark, type CounterDeploymentReceipt, type DeploymentReceipt, type FilingReceipt, type SlotSnapshot } from "./midnight/contract.js";
import { fetchDossierTransactions, type IndexedTransaction } from "./midnight/indexer.js";
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
  const [recoveredSlotKey, setRecoveredSlotKey] = useState<Uint8Array | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [working, setWorking] = useState(false);
  const [workingStage, setWorkingStage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [counterDeployment, setCounterDeployment] = useState<CounterDeploymentReceipt | null>(null);
  const [deployment, setDeployment] = useState<DeploymentReceipt | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierEvidence, setDossierEvidence] = useState<readonly IndexedTransaction[]>([]);
  const [dossierSignatures, setDossierSignatures] = useState<readonly DossierSignature[]>([]);
  const [dossierVerification, setDossierVerification] = useState<boolean | null>(null);
  const [uploadedVerification, setUploadedVerification] = useState<boolean | null>(null);

  const syntheticCompany = useMemo(
    () => hasSyntheticSubjectConfiguration()
      ? createSyntheticCompany(publicAppConfig.syntheticSubjectName, publicAppConfig.syntheticSubjectRc)
      : null,
    [],
  );

  const publicState = useMemo(
    () => [
      "one encrypted report envelope",
      "one opaque filer nullifier",
      "one ciphertext replay guard",
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
      setRecoveredSlotKey(receipt.slotKey);
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

  const handleRecoverUnlocked = async (): Promise<void> => {
    if (!wallet || !selectedCompany) {
      setNotice("Connect the wallet and select the synthetic subject before recovering the filing.");
      return;
    }
    setNotice(null);
    setWorking(true);
    setWorkingStage("Recovering the existing private filing state");
    try {
      const completed = await deriveCompanySlot(selectedCompany.subject.registrationNumber);
      const contract = await connectThirdmark(wallet, completed);
      setWorkingStage("Reading the finalized threshold state");
      const snapshot = await contract.readSlot(completed);
      if (!snapshot.unlocked || !snapshot.records) {
        throw new Error("the selected subject has not reached the threshold in this wallet");
      }
      setRecoveredSlotKey(completed.slotKey);
      setSlotSnapshot(snapshot);
      setPrepared(true);
      setDossier(null);
      setDossierEvidence([]);
      setDossierSignatures([]);
      setDossierVerification(null);
      setUploadedVerification(null);
      setStep("unlocked");
      setNotice("Existing threshold state recovered locally. No new filing was submitted.");
    } catch (error) {
      const diagnostic = diagnosticMessage(error);
      setNotice(`The existing filing could not be recovered.${diagnostic ? ` Diagnostic: ${diagnostic}.` : ""}`);
    } finally {
      setWorking(false);
      setWorkingStage(null);
    }
  };

  const handleBuildDossier = async (): Promise<void> => {
    const slotKey = fileReceipt?.slotKey ?? recoveredSlotKey;
    if (!wallet || !slotKey || !slotSnapshot?.unlocked || !slotSnapshot.records) {
      setNotice("The dossier requires a finalized threshold filing in this browser.");
      return;
    }
    if (publicAppConfig.dossierTransactionHashes.length !== 3) {
      setNotice("The public dossier evidence is not configured with three filing transactions.");
      return;
    }
    setNotice(null);
    setWorking(true);
    setWorkingStage("Reading finalized filing evidence from the Preprod indexer");
    try {
      const walletConfiguration = await wallet.api.getConfiguration();
      const evidence = await fetchDossierTransactions(
        walletConfiguration.indexerUri,
        publicAppConfig.dossierTransactionHashes,
        getContractAddress(),
      );
      const records = slotSnapshot.records.map((record, index) => ({
        entryKey: record.entryKey,
        filedAt: evidence[index].filedAt,
        attestation: record.attestation,
        transaction: evidence[index],
      }));
      const unlockedAt = [...evidence].map((transaction) => transaction.filedAt).sort().at(-1);
      if (!unlockedAt) throw new Error("the indexer returned no unlock timestamp");
      const built = createDossier({
        contractAddress: getContractAddress(),
        slotKey,
        threshold: slotSnapshot.threshold,
        unlockedAt,
        records,
      });
      setDossierEvidence(evidence);
      setDossier(built);
      setDossierSignatures([]);
      setDossierVerification(null);
      setUploadedVerification(null);
      setStep("dossier");
      setNotice("Dossier assembled from the three decrypted attestations and public indexer evidence.");
    } catch (error) {
      const diagnostic = diagnosticMessage(error);
      setNotice(`The dossier could not be assembled.${diagnostic ? ` Diagnostic: ${diagnostic}.` : ""}`);
    } finally {
      setWorking(false);
      setWorkingStage(null);
    }
  };

  const handleDossierApproval = async (index: number): Promise<void> => {
    if (!dossier) {
      setNotice("Assemble the dossier before approving it.");
      return;
    }
    const reference = `filing-${index + 1}`;
    if (dossierSignatures.some((signature) => signature.reference === reference)) return;
    setNotice(null);
    setWorking(true);
    setWorkingStage(`Collecting signer approval ${index + 1} of 3`);
    try {
      const keyPair = (await globalThis.crypto.subtle.generateKey(
        { name: "Ed25519" },
        true,
        ["sign", "verify"],
      )) as CryptoKeyPair;
      const signature = await signDossier(dossier, { reference, keyPair });
      const next = [...dossierSignatures, signature].sort((left, right) => left.reference.localeCompare(right.reference));
      setDossierSignatures(next);
      if (next.length === 3) {
        const signed = {
          dossier,
          signatures: next as [DossierSignature, DossierSignature, DossierSignature],
        } satisfies SignedDossier;
        const valid = await verifySignedDossier(signed);
        setDossierVerification(valid);
        setNotice(valid ? "Three distinct signer approvals captured and independently verified." : "The signer approvals could not be verified.");
      } else {
        setNotice(`Signer approval ${index + 1} captured. Two or more approvals are still required.`);
      }
    } catch (error) {
      const diagnostic = diagnosticMessage(error);
      setNotice(`Signer approval failed.${diagnostic ? ` Diagnostic: ${diagnostic}.` : ""}`);
    } finally {
      setWorking(false);
      setWorkingStage(null);
    }
  };

  const handleDownloadDossier = (): void => {
    if (!dossier || dossierSignatures.length !== 3 || dossierVerification !== true) {
      setNotice("Complete and verify all three signer approvals before exporting.");
      return;
    }
    const signed = {
      dossier,
      signatures: dossierSignatures as [DossierSignature, DossierSignature, DossierSignature],
    } satisfies SignedDossier;
    const serialized = serializeSignedDossier(signed);
    const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "thirdmark-dossier.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Signed dossier exported as thirdmark-dossier.json.");
  };

  const handleVerifyUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = parseSignedDossier(await file.text());
      const valid = await verifySignedDossier(parsed);
      setUploadedVerification(valid);
      setNotice(valid ? "Independent dossier verification passed." : "Independent dossier verification failed.");
    } catch (error) {
      setUploadedVerification(false);
      const diagnostic = diagnosticMessage(error);
      setNotice(`The uploaded dossier is invalid.${diagnostic ? ` Diagnostic: ${diagnostic}.` : ""}`);
    } finally {
      input.value = "";
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
      rememberContractAddress(receipt.contractAddress);
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

      {(!hasContractConfiguration() || deployment) && (
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
          <button className="primary-button" type="button" onClick={() => void handleDeploy()} disabled={working || !wallet || !hasIssuerConfiguration() || hasContractConfiguration()}>
            {hasContractConfiguration() ? "Thirdmark contract connected" : working ? "Preparing deployment…" : "Deploy Thirdmark through wallet"}
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
              {wallet && selectedCompany.source === "synthetic" && (
                <div className="recovery-note">
                  <p className="field-note">Already completed this synthetic filing in this browser? Recover its threshold state after a reload without submitting again.</p>
                  <button className="quiet-button" type="button" onClick={() => void handleRecoverUnlocked()} disabled={working}>
                    {working ? "Recovering existing filing…" : "Recover existing threshold filing"}
                  </button>
                </div>
              )}
            </section>
          )}

          {step === "sealed" && <StatePanel step="sealed" receipt={fileReceipt} snapshot={slotSnapshot} onBack={() => setStep("file")} />}
          {step === "unlocked" && <StatePanel step="unlocked" receipt={fileReceipt} snapshot={slotSnapshot} onBack={() => setStep("sealed")} onOpenDossier={() => void handleBuildDossier()} working={working} />}
          {step === "dossier" && (
            <DossierPanel
              dossier={dossier}
              evidence={dossierEvidence}
              signatures={dossierSignatures}
              verified={dossierVerification}
              uploadedVerification={uploadedVerification}
              working={working}
              onApprove={(index) => void handleDossierApproval(index)}
              onDownload={handleDownloadDossier}
              onVerifyUpload={handleVerifyUpload}
              onBack={() => setStep("unlocked")}
            />
          )}
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
        <div className="boundary-card public-boundary"><p className="eyebrow">Visible to the ledger</p><h2>Opaque state</h2><ul><li>Encrypted report envelope</li><li>Opaque filer nullifier</li><li>Ciphertext replay guard</li><li>Threshold result</li></ul></div>
        <div className="boundary-card private-boundary"><p className="eyebrow">Kept in the browser</p><h2>Report details</h2><ul><li>Company reference</li><li>Amount and days late</li><li>Invoice reference</li><li>Slot secret and filer secret</li></ul></div>
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
        <ul>{publicState.map((item) => <li key={item}>{item}</li>)}{receipt && <li>filing nullifier {shortValue(Array.from(receipt.nullifier, (byte) => byte.toString(16).padStart(2, "0")).join(""))}</li>}</ul>
      </div>
      <div className="inspector-group private-group">
        <span className="inspector-label">Kept in this browser</span>
        <ul><li>company reference</li><li>report details</li><li>slot secret</li><li>filer secret</li></ul>
      </div>
      <p className="inspector-footnote">The ledger sees opaque occupancy. Without the private company reference, it cannot label that state with a company.</p>
    </aside>
  );
}

function StatePanel({ step, receipt, snapshot, onBack, onOpenDossier, working }: { readonly step: "sealed" | "unlocked" | "dossier"; readonly receipt: FilingReceipt | null; readonly snapshot: SlotSnapshot | null; readonly onBack: () => void; readonly onOpenDossier?: () => void; readonly working?: boolean }) {
  const copy = {
    sealed: { eyebrow: "Step 03", title: "Filed. Still sealed.", body: "Nothing is visible until two more independent suppliers file against the same company reference. No sub-threshold count is shown." },
    unlocked: { eyebrow: "Step 04", title: "The third mark changed the state.", body: "Only the three participating filers can decrypt their records locally. No service receives the report details." },
    dossier: { eyebrow: "Step 05", title: "The dossier is the settlement.", body: "The final artifact joins the three attestations with public ledger evidence. Dates and approvals must come from the completed chain read path." },
  }[step];
  return (
    <section className="panel state-panel">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h2>{copy.title}</h2>
      <p className="muted">{copy.body}</p>
      <div className="state-placeholder">
        <Tally unlocked={step !== "sealed"} />
        <span>
          {step === "sealed"
            ? (receipt ? `Transaction ${shortValue(receipt.txId)} is sealed at the threshold.` : "Waiting for an actual filing transaction")
            : snapshot?.unlocked
              ? `${snapshot.records?.length ?? 0} decrypted attestations are held in this browser.`
              : "Unlock requires a finalized threshold transaction."}
        </span>
      </div>
      {step === "unlocked" && snapshot?.records && (
        <div className="record-list" aria-label="Decrypted attestations">
          {snapshot.records.map((record, index) => (
            <article className="record-card" key={`${record.attestation.invoiceReference}-${index}`}>
              <span className="label">Attestation {index + 1}</span>
              <strong>{record.attestation.amountOverdueMinorUnits} minor units overdue</strong>
              <span>{record.attestation.daysLate} days late · {record.attestation.invoiceReference}</span>
            </article>
          ))}
        </div>
      )}
      <div className="state-actions">
        <button className="quiet-button" type="button" onClick={onBack}>Back</button>
        {step === "unlocked" && onOpenDossier && (
          <button className="primary-button" type="button" onClick={onOpenDossier} disabled={working}>
            {working ? "Preparing dossier…" : "Build the dossier"}
          </button>
        )}
      </div>
    </section>
  );
}

function DossierPanel({
  dossier,
  evidence,
  signatures,
  verified,
  uploadedVerification,
  working,
  onApprove,
  onDownload,
  onVerifyUpload,
  onBack,
}: {
  readonly dossier: Dossier | null;
  readonly evidence: readonly IndexedTransaction[];
  readonly signatures: readonly DossierSignature[];
  readonly verified: boolean | null;
  readonly uploadedVerification: boolean | null;
  readonly working: boolean;
  readonly onApprove: (index: number) => void;
  readonly onDownload: () => void;
  readonly onVerifyUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onBack: () => void;
}) {
  const signatureReferences = new Set(signatures.map((signature) => signature.reference));
  return (
    <section className="panel state-panel dossier-panel">
      <p className="eyebrow">Step 05</p>
      <h2>The dossier is the settlement.</h2>
      <p className="muted">
        Three decrypted attestations are joined with public Preprod transaction evidence. The signed JSON can be
        downloaded and verified independently without sending report details to a Thirdmark service.
      </p>
      {!dossier ? (
        <div className="configuration-note">
          <strong>Dossier evidence is not ready.</strong>
          <span>Return to the unlocked step and build the dossier from the connected wallet’s indexer.</span>
        </div>
      ) : (
        <>
          <div className="dossier-summary">
            <div><span className="label">Contract</span><code>{shortValue(dossier.contractAddress)}</code></div>
            <div><span className="label">Unlocked at</span><span>{dossier.unlockedAt}</span></div>
            <div><span className="label">Records</span><strong>{dossier.records.length} / {dossier.threshold}</strong></div>
          </div>
          <div className="dossier-evidence" aria-label="Public filing evidence">
            <p className="label">Public indexer evidence</p>
            {evidence.map((transaction, index) => (
              <article className="evidence-row" key={transaction.txHash}>
                <span>Filing {index + 1}</span>
                <code title={transaction.txId}>ID {shortValue(transaction.txId)}</code>
                <code title={transaction.txHash}>hash {shortValue(transaction.txHash)}</code>
                <span>block {transaction.blockHeight} · {transaction.filedAt}</span>
              </article>
            ))}
          </div>
          <div className="dossier-approvals">
            <p className="label">Signer approvals</p>
            <p className="field-note">Each approval creates a distinct Ed25519 signature in this browser and is checked against the canonical dossier bytes.</p>
            {[0, 1, 2].map((index) => {
              const reference = `filing-${index + 1}`;
              const approved = signatureReferences.has(reference);
              return (
                <div className="approval-row" key={reference}>
                  <span><strong>Filing {index + 1} signer</strong><small>{reference}</small></span>
                  <button className={approved ? "quiet-button approval-complete" : "primary-button"} type="button" onClick={() => onApprove(index)} disabled={working || approved}>
                    {approved ? "Approved" : `Approve ${index + 1}`}
                  </button>
                </div>
              );
            })}
            {verified !== null && <p className={verified ? "verification-pass" : "verification-fail"}>{verified ? "✓ Three signatures verified" : "× Signature verification failed"}</p>}
          </div>
          <div className="dossier-actions">
            <button className="primary-button" type="button" onClick={onDownload} disabled={working || verified !== true}>Download signed dossier</button>
            <label className="quiet-button upload-button">Verify a dossier file<input type="file" accept="application/json,.json" onChange={onVerifyUpload} /></label>
          </div>
          {uploadedVerification !== null && <p className={uploadedVerification ? "verification-pass" : "verification-fail"}>{uploadedVerification ? "✓ Uploaded dossier independently verified" : "× Uploaded dossier rejected"}</p>}
        </>
      )}
      <button className="quiet-button" type="button" onClick={onBack}>Back</button>
    </section>
  );
}

export default App;
