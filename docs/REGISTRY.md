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

The CAC public-search page is an official interactive lookup. CAC also publishes
a separate VAS API site with authenticated validation products, including lookup
by RC number. No stable, unauthenticated autocomplete API is published by the
public-search page, and Thirdmark does not scrape undocumented endpoints or put a
VAS credential in the client. A live autocomplete adapter must use an explicitly
authorized CAC integration path; until that exists, the canonicalization layer is
the only registry code represented as complete.

Synthetic demo subjects must remain clearly invalid and labelled synthetic. No
real company's registration number is used in screenshots, tests, or recordings.
