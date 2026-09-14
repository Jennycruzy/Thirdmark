import "@midnight-ntwrk/dapp-connector-api";
import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";

const COMPATIBLE_API_MAJOR = "4.";

export type WalletSession = {
  readonly api: ConnectedAPI;
  readonly walletName: string;
  readonly networkId: string;
};

const isCompatibleWallet = (value: unknown): value is InitialAPI =>
  typeof value === "object" &&
  value !== null &&
  "apiVersion" in value &&
  String((value as InitialAPI).apiVersion).startsWith(COMPATIBLE_API_MAJOR);

const isOneAmWallet = (wallet: InitialAPI): boolean =>
  `${wallet.name} ${wallet.rdns}`.toLowerCase().includes("1am");

export const detectWallet = (windowValue: Window = window): InitialAPI | null => {
  const injected = windowValue.midnight;
  if (!injected) return null;
  const candidates = Object.values(injected).filter(isCompatibleWallet);
  const keyedOneAm = injected["1am"];
  if (isCompatibleWallet(keyedOneAm)) return keyedOneAm;
  return candidates.find(isOneAmWallet) ?? candidates[0] ?? null;
};

export const connectWallet = async (
  expectedNetworkId: "preprod",
  windowValue: Window = window,
): Promise<WalletSession> => {
  const wallet = detectWallet(windowValue);
  if (!wallet) {
    throw new Error("Install and unlock a Midnight wallet before connecting.");
  }

  let api: ConnectedAPI;
  try {
    api = await wallet.connect(expectedNetworkId);
  } catch {
    throw new Error(
      `The wallet declined the connection. Set it to ${expectedNetworkId} and try again.`,
    );
  }

  await api.hintUsage([
    "getConfiguration",
    "getShieldedAddresses",
    "getProvingProvider",
    "balanceUnsealedTransaction",
    "submitTransaction",
  ]);

  const configuration = await api.getConfiguration();
  if (configuration.networkId !== expectedNetworkId) {
    throw new Error(
      `The wallet is on ${configuration.networkId}; switch it to ${expectedNetworkId}.`,
    );
  }

  return {
    api,
    walletName: wallet.name,
    networkId: configuration.networkId,
  };
};
