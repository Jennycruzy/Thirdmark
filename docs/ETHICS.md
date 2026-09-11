# Ethics and safety

Thirdmark handles disclosures that can affect a company’s ability to trade and a supplier’s ability to recover money. The threshold is the safety property: a single supplier must never be exposed as the only filer, and a slot must never unlock below k=3.

## Product rules

- Wave 1 uses synthetic companies and clearly invalid registration identifiers in demonstrations. No real company, real registration number, real person, or real allegation is used in fixtures, screenshots, or video.
- Report plaintext is encrypted in the client. The contract stores only a fixed-width opaque ciphertext; no server controlled by this project stores report contents.
- No operator can force a reveal. There is no admin key, pause circuit, emergency disclosure circuit, or upgrade path.
- The contract must reject duplicate filings by the same filer, stale private filing-history openings, wrong-width ciphertext, and every unlock attempt below the threshold.
- The UI must never display a sub-threshold count. “Sealed” is the only state shown until the threshold predicate is true for the authorized filer set.
- Every privacy claim is qualified by its residual leak. An actor who can derive an exact slot key can query that slot and learn its aggregate count. The OPRF protects the slot-key derivation boundary; it does not make a guessable or leaked subject identifier safe.
- The Wave 1 OPRF issuer can rate-limit or censor requests. It must not learn the subject, read report plaintext, or force a reveal. Wave 2 addresses single-issuer trust with a distributed key.

## Demo and disclosure discipline

The dossier is produced only after a real threshold transition. It contains the three dated attestations chosen for mutual disclosure, their on-chain filing dates, the slot key and contract address needed for independent verification, and no hidden identity data that the three filers did not choose to share.

The team will not market the mechanism as a universal whistleblowing system in Wave 1. A more sensitive vertical requires a separate threat model, design partner, legal review, and operational plan before any real-world deployment.
