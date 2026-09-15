export type IndexedTransaction = {
  readonly txId: string;
  readonly txHash: string;
  readonly blockHeight: number;
  readonly blockHash: string;
  readonly filedAt: string;
  readonly status: string;
};

type IndexerTransaction = {
  readonly id: number;
  readonly hash: string;
  readonly block: {
    readonly height: number;
    readonly hash: string;
    readonly timestamp: number;
  };
  readonly contractActions?: readonly { readonly address: string }[];
  readonly identifiers?: readonly string[];
  readonly transactionResult?: { readonly status: string };
};

type IndexerResponse = {
  readonly data?: { readonly transactions?: readonly IndexerTransaction[] };
  readonly errors?: readonly { readonly message: string }[];
};

const TRANSACTION_QUERY = `
  query THIRDMarkTransaction($offset: TransactionOffset!) {
    transactions(offset: $offset) {
      id
      hash
      block { height hash timestamp }
      ... on RegularTransaction {
        identifiers
        transactionResult { status }
        contractActions { address }
      }
    }
  }
`;

const asInstant = (timestamp: number): string => {
  const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp;
  const instant = new Date(milliseconds);
  if (Number.isNaN(instant.getTime())) throw new Error("the indexer returned an invalid block timestamp");
  return instant.toISOString();
};

const fetchTransaction = async (
  indexerUri: string,
  hash: string,
  contractAddress: string,
): Promise<IndexedTransaction> => {
  const response = await fetch(indexerUri, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: TRANSACTION_QUERY, variables: { offset: { hash } } }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`the Midnight indexer returned HTTP ${response.status}`);
  const payload = (await response.json()) as IndexerResponse;
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  const transaction = payload.data?.transactions?.[0];
  if (!transaction) throw new Error(`the indexer could not find transaction ${hash}`);
  if (transaction.transactionResult?.status && transaction.transactionResult.status !== "SUCCESS") {
    throw new Error(`transaction ${hash} did not finalize successfully`);
  }
  if (!transaction.contractActions?.some((action) => action.address.toLowerCase() === contractAddress.toLowerCase())) {
    throw new Error(`transaction ${hash} is not a call to the configured Thirdmark contract`);
  }
  const txId = transaction.identifiers?.[0];
  if (!txId) throw new Error(`transaction ${hash} has no public transaction identifier`);
  return {
    txId,
    txHash: transaction.hash,
    blockHeight: transaction.block.height,
    blockHash: transaction.block.hash,
    filedAt: asInstant(transaction.block.timestamp),
    status: transaction.transactionResult?.status ?? "SUCCESS",
  };
};

export const fetchDossierTransactions = async (
  indexerUri: string,
  hashes: readonly string[],
  contractAddress: string,
): Promise<readonly IndexedTransaction[]> => {
  if (hashes.length !== 3) throw new Error("three filing transaction hashes are required for the dossier");
  const unique = new Set(hashes.map((hash) => hash.toLowerCase()));
  if (unique.size !== hashes.length) throw new Error("dossier transaction hashes must be distinct");
  return Promise.all(hashes.map((hash) => fetchTransaction(indexerUri, hash, contractAddress)));
};
