export type PublicAppConfig = {
  readonly networkId: "preprod";
  readonly contractAddress: string;
  readonly issuerUrl: string;
  readonly issuerPublicKeyX: string;
  readonly issuerPublicKeyY: string;
  readonly registryAdapterUrl: string;
  readonly syntheticSubjectName: string;
  readonly syntheticSubjectRc: string;
};

const env = import.meta.env as Record<string, string | undefined>;
const envContractAddress = env.VITE_CONTRACT_ADDRESS ?? "";
const RUNTIME_CONTRACT_ADDRESS_KEY = "thirdmark:contract-address:v1";

const isContractAddress = (value: string): boolean => /^[0-9a-f]{64}$/iu.test(value);

const storedContractAddress = (): string => {
  if (typeof window === "undefined") return "";
  try {
    const value = window.localStorage.getItem(RUNTIME_CONTRACT_ADDRESS_KEY) ?? "";
    return isContractAddress(value) ? value : "";
  } catch {
    return "";
  }
};

/** Return the build-time address, or a wallet-deployed replacement for this browser. */
export const getContractAddress = (): string => envContractAddress || storedContractAddress();

/** Persist a public wallet deployment so this browser can continue without a rebuild. */
export const rememberContractAddress = (address: string): void => {
  if (envContractAddress || !isContractAddress(address) || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RUNTIME_CONTRACT_ADDRESS_KEY, address);
  } catch {
    // Filing can still continue during this session; persistence is best effort.
  }
};

/**
 * All deployment-specific values are explicit public build configuration.
 * There is intentionally no fallback endpoint, contract address, or issuer key.
 */
export const publicAppConfig: PublicAppConfig = {
  networkId: "preprod",
  contractAddress: env.VITE_CONTRACT_ADDRESS ?? "",
  issuerUrl: env.VITE_ISSUER_URL ?? "",
  issuerPublicKeyX: env.VITE_ISSUER_PUBLIC_KEY_X ?? "",
  issuerPublicKeyY: env.VITE_ISSUER_PUBLIC_KEY_Y ?? "",
  registryAdapterUrl: env.VITE_REGISTRY_ADAPTER_URL ?? "",
  syntheticSubjectName: env.VITE_SYNTHETIC_SUBJECT_NAME ?? "",
  syntheticSubjectRc: env.VITE_SYNTHETIC_SUBJECT_RC ?? "",
};

export const hasIssuerConfiguration = (): boolean =>
  publicAppConfig.issuerUrl.length > 0 &&
  publicAppConfig.issuerPublicKeyX.length > 0 &&
  publicAppConfig.issuerPublicKeyY.length > 0;

export const hasContractConfiguration = (): boolean =>
  getContractAddress().length > 0;

export const hasSyntheticSubjectConfiguration = (): boolean =>
  publicAppConfig.syntheticSubjectName.length > 0 &&
  publicAppConfig.syntheticSubjectRc.length > 0;
