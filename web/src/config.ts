export type PublicAppConfig = {
  readonly networkId: "preprod";
  readonly contractAddress: string;
  readonly issuerUrl: string;
  readonly issuerPublicKeyX: string;
  readonly issuerPublicKeyY: string;
  readonly registryAdapterUrl: string;
};

const env = import.meta.env as Record<string, string | undefined>;

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
};

export const hasIssuerConfiguration = (): boolean =>
  publicAppConfig.issuerUrl.length > 0 &&
  publicAppConfig.issuerPublicKeyX.length > 0 &&
  publicAppConfig.issuerPublicKeyY.length > 0;

export const hasContractConfiguration = (): boolean =>
  publicAppConfig.contractAddress.length > 0;
