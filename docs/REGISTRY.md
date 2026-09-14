# Wave 1 registry

Thirdmark Wave 1 is scoped to Nigerian companies registered with the Corporate
Affairs Commission (CAC). The official [CAC public search](https://icrp.cac.gov.ng/public-search/)
offers `RC Number`, `AV Code`, and `Approved Name` search. Thirdmark deliberately
uses only the `RC Number` identifier for companies; it does not mix company,
business-name, or AV-code identifiers in the same subject namespace.

## Canonical subject

The public search result is normalized as follows:

1. Trim and uppercase the copied identifier.
2. Remove display separators (spaces, periods, slashes, underscores, and hyphens).
3. Remove an optional leading `RC` label.
4. Require at least one decimal digit and preserve every significant digit,
   including leading zeroes. No width or zero-padding is assumed because CAC's
   public source does not publish a fixed RC-number width.
5. Bind the result to the explicit subject namespace:
   `NG:CAC:company:RC:<digits>`.

The current Compact OPRF circuit accepts `Bytes<32>`, so the client uses
`SHA-256("thirdmark:subject:v1\\0" || canonicalSubject)` as a fixed-width,
domain-separated preimage. This is an OPRF input, not a slot key. The issuer
still sees only the blinded curve point.

## Lookup boundary

The CAC public-search page is an official interactive lookup. Its source is an
Angular application that issues `POST` requests to
`https://authapp.cac.gov.ng/name_similarity_app/api/public_search/search` with
`SearchType` and `searchTerm`. The adapter in [`registry/server.ts`](../registry/server.ts)
uses that exact source-backed request, sends the official page origin and referrer,
filters the response to `classificationName === "COMPANY"`, and returns only the
approved name, RC number, and coarse status to the browser. It does not put a CAC
credential in the client or store registry records.

The upstream endpoint is rate-limited and is not presented by CAC as a versioned
third-party API. That is a residual integration risk: the adapter is a narrow
server-side boundary for the buildathon, not a claim of a commercial CAC VAS
agreement. Production deployment should move to an authorized CAC VAS integration
when one is available. The browser never calls the CAC endpoint directly because
CAC's response allows the official iCRP origin, not arbitrary localhost origins.

## Local adapter setup

The adapter requires only public endpoint and binding configuration:

```sh
export THIRDMARK_CAC_PUBLIC_SEARCH_URL='https://authapp.cac.gov.ng/name_similarity_app/api/public_search/search'
export THIRDMARK_REGISTRY_HOST=127.0.0.1
export THIRDMARK_REGISTRY_PORT=8788
export THIRDMARK_REGISTRY_ALLOWED_ORIGIN=http://localhost:5173
npm run registry:start
```

The browser then uses `http://127.0.0.1:8788/v1/cac/search` as
`VITE_REGISTRY_ADAPTER_URL`. The adapter does not accept an RC number directly
from the user interface; it returns the RC number only after CAC name search.

Synthetic demo subjects must remain clearly invalid and labelled synthetic. No
real company's registration number is used in screenshots, tests, or recordings.
