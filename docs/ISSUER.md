# Wave 1 issuer boundary

The Wave 1 issuer is a single OPRF service. It receives only a blinded Jubjub
point and returns an evaluated point plus a DLEQ proof. It never receives the
CAC RC number, a slot key, a filer secret, a report, or a ciphertext.

## HTTP surface

The service implemented in [`issuer/server.ts`](../issuer/server.ts) exposes:

- `GET /health` — `{ "status": "ok" }`.
- `GET /v1/oprf/public-key` — the issuer public point as decimal coordinate
  strings. The browser must compare this with the issuer key sealed in the
  deployed contract before a filing call.
- `POST /v1/oprf/evaluate` — accepts
  `{ "blindedPoint": { "x": "…", "y": "…" } }` and returns the evaluated
  point and DLEQ proof in the same decimal-coordinate representation.

The request body is capped at 4 KiB. Decimal parsing is strict, responses are
`no-store`, and an explicitly configured origin is required for browser CORS.
Invalid requests return an action-safe error without echoing request data.

## Runtime configuration

The issuer scalar is a runtime-only value supplied by the operator through
`THIRDMARK_ISSUER_SCALAR_HEX`. There is no default, fixture, example value, or
repository storage for it. The server also requires explicit
`THIRDMARK_ISSUER_HOST` and `THIRDMARK_ISSUER_PORT` values; an optional
`THIRDMARK_ISSUER_ALLOWED_ORIGIN` controls browser access.

Start it only in an environment where the scalar can be injected without being
logged or persisted:

```sh
npm run issuer:start
```

The command fails closed if the scalar, host, or port is absent or outside the
validated Jubjub range. The server prints only its bind address.

## Trust boundary

Wave 1 still has a single issuer. It can rate-limit or censor requests, and it
can evaluate candidate subjects offline if it deliberately uses its private
scalar. It cannot derive the subject from one blinded request or decrypt a
report. The contract’s sealed public key and DLEQ proof are the authority for a
filing; the HTTP public-key endpoint is not a substitute for reading that
sealed contract state.
