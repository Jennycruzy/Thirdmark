import type { ContractAddress, SigningKey } from "@midnight-ntwrk/compact-runtime";
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from "@midnight-ntwrk/midnight-js-types";

const DATABASE_NAME = "thirdmark-private-state";
const DATABASE_VERSION = 1;
const RECORDS_STORE = "records";
const METADATA_STORE = "metadata";
const ENCRYPTION_KEY_ID = "private-state-aes-gcm-v1";
const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type RecordKind = "state" | "signing-key";

type StoredRecord = {
  readonly id: string;
  readonly contractAddress: ContractAddress;
  readonly kind: RecordKind;
  readonly payload: string;
};

type WireValue =
  | null
  | boolean
  | number
  | string
  | { readonly tag: "bigint"; readonly value: string }
  | { readonly tag: "bytes"; readonly value: string }
  | { readonly tag: "array"; readonly value: WireValue[] }
  | { readonly tag: "object"; readonly value: Record<string, WireValue> };

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const toWire = (value: unknown): WireValue => {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (typeof value === "bigint") return { tag: "bigint", value: value.toString(10) };
  if (value instanceof Uint8Array) return { tag: "bytes", value: bytesToHex(value) };
  if (Array.isArray(value)) return { tag: "array", value: value.map(toWire) };
  if (typeof value === "object") {
    const object: Record<string, WireValue> = {};
    for (const [key, entry] of Object.entries(value)) object[key] = toWire(entry);
    return { tag: "object", value: object };
  }
  throw new TypeError("private state contains a value that cannot be encrypted");
};

const fromWire = (value: WireValue): unknown => {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (value.tag === "bigint") return BigInt(value.value);
  if (value.tag === "bytes") {
    if (!/^(?:[0-9a-f]{2})*$/u.test(value.value)) throw new Error("private state contains invalid bytes");
    const result = new Uint8Array(value.value.length / 2);
    for (let index = 0; index < result.length; index += 1) {
      result[index] = Number.parseInt(value.value.slice(index * 2, index * 2 + 2), 16);
    }
    return result;
  }
  if (value.tag === "array") return value.value.map(fromWire);
  const object: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value.value)) object[key] = fromWire(entry);
  return object;
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });

const openDatabase = (): Promise<IDBDatabase> => {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not provide encrypted private-state storage."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDS_STORE)) {
        database.createObjectStore(RECORDS_STORE, { keyPath: ["contractAddress", "kind", "id"] });
      }
      if (!database.objectStoreNames.contains(METADATA_STORE)) database.createObjectStore(METADATA_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open private-state storage."));
  });
};

const getEncryptionKey = async (database: IDBDatabase): Promise<CryptoKey> => {
  const read = database.transaction(METADATA_STORE, "readonly");
  const complete = transactionComplete(read);
  const existing = await requestResult(read.objectStore(METADATA_STORE).get(ENCRYPTION_KEY_ID));
  await complete;
  if (existing instanceof CryptoKey) return existing;

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const write = database.transaction(METADATA_STORE, "readwrite");
  write.objectStore(METADATA_STORE).put(key, ENCRYPTION_KEY_ID);
  await transactionComplete(write);
  return key;
};

const encryptValue = async (key: CryptoKey, value: unknown): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = encoder.encode(JSON.stringify(toWire(value)));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const envelope = new Uint8Array(iv.length + encrypted.length);
  envelope.set(iv, 0);
  envelope.set(encrypted, iv.length);
  return bytesToBase64(envelope);
};

const decryptValue = async (key: CryptoKey, envelope: string): Promise<unknown> => {
  const bytes = base64ToBytes(envelope);
  if (bytes.length <= IV_BYTES) throw new Error("private-state envelope is invalid");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, IV_BYTES) },
    key,
    bytes.slice(IV_BYTES),
  );
  return fromWire(JSON.parse(decoder.decode(plaintext)) as WireValue);
};

const requireAddress = (address: ContractAddress | null): ContractAddress => {
  if (!address) throw new Error("Contract address is not set for private-state storage.");
  return address;
};

const stateRecordId = (address: ContractAddress, kind: RecordKind, id: string): [string, RecordKind, string] => [
  address,
  kind,
  id,
];

const randomSalt = (): string => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));

/**
 * Browser private-state provider backed by IndexedDB and AES-GCM.
 *
 * The browser retains the non-exportable AES key in IndexedDB and stores only
 * encrypted witness state. This is still same-origin storage, not a hardware
 * wallet or a password vault; a compromised page can use the state while it is
 * open. It does ensure report plaintext and witness material are not stored as
 * readable localStorage JSON or sent to a Thirdmark server.
 */
export const encryptedPrivateStateProvider = <PSI extends PrivateStateId, PS = unknown>(): PrivateStateProvider<PSI, PS> => {
  let contractAddress: ContractAddress | null = null;
  let databasePromise: Promise<IDBDatabase> | undefined;
  let keyPromise: Promise<CryptoKey> | undefined;

  const database = (): Promise<IDBDatabase> => (databasePromise ??= openDatabase());
  const key = async (): Promise<CryptoKey> => (keyPromise ??= database().then(getEncryptionKey));

  const readRecord = async (kind: RecordKind, id: string, address = requireAddress(contractAddress)): Promise<unknown | null> => {
    const db = await database();
    const tx = db.transaction(RECORDS_STORE, "readonly");
    const complete = transactionComplete(tx);
    const record = await requestResult(tx.objectStore(RECORDS_STORE).get(stateRecordId(address, kind, id)));
    await complete;
    if (!record) return null;
    return decryptValue(await key(), (record as StoredRecord).payload);
  };

  const writeRecord = async (kind: RecordKind, id: string, value: unknown, address = requireAddress(contractAddress)): Promise<void> => {
    const db = await database();
    const record: StoredRecord = {
      id,
      contractAddress: address,
      kind,
      payload: await encryptValue(await key(), value),
    };
    const tx = db.transaction(RECORDS_STORE, "readwrite");
    tx.objectStore(RECORDS_STORE).put(record);
    await transactionComplete(tx);
  };

  const removeRecord = async (kind: RecordKind, id: string, address = requireAddress(contractAddress)): Promise<void> => {
    const db = await database();
    const tx = db.transaction(RECORDS_STORE, "readwrite");
    tx.objectStore(RECORDS_STORE).delete(stateRecordId(address, kind, id));
    await transactionComplete(tx);
  };

  return {
    setContractAddress(address): void {
      contractAddress = address;
    },
    async set(id, state): Promise<void> {
      await writeRecord("state", id, state);
    },
    async get(id): Promise<PS | null> {
      return (await readRecord("state", id)) as PS | null;
    },
    async remove(id): Promise<void> {
      await removeRecord("state", id);
    },
    async clear(): Promise<void> {
      const address = requireAddress(contractAddress);
      const db = await database();
      const tx = db.transaction(RECORDS_STORE, "readwrite");
      const store = tx.objectStore(RECORDS_STORE);
      const complete = transactionComplete(tx);
      const records = await requestResult(store.getAll(IDBKeyRange.bound([address, "", ""], [address, "\uffff", "\uffff"])));
      for (const record of records as StoredRecord[]) store.delete([record.contractAddress, record.kind, record.id]);
      await complete;
    },
    async setSigningKey(address, signingKey): Promise<void> {
      await writeRecord("signing-key", address, signingKey, address);
    },
    async getSigningKey(address): Promise<SigningKey | null> {
      return (await readRecord("signing-key", address, address)) as SigningKey | null;
    },
    async removeSigningKey(address): Promise<void> {
      await removeRecord("signing-key", address, address);
    },
    async clearSigningKeys(): Promise<void> {
      const db = await database();
      const tx = db.transaction(RECORDS_STORE, "readwrite");
      const store = tx.objectStore(RECORDS_STORE);
      const complete = transactionComplete(tx);
      const records = await requestResult(store.getAll(IDBKeyRange.bound(["", "signing-key", ""], ["\uffff", "signing-key", "\uffff"])));
      for (const record of records as StoredRecord[]) store.delete([record.contractAddress, record.kind, record.id]);
      await complete;
    },
    async exportPrivateStates(options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      if (options?.password) throw new Error("Password-based private-state export is not enabled in the browser provider.");
      const address = requireAddress(contractAddress);
      const db = await database();
      const tx = db.transaction(RECORDS_STORE, "readonly");
      const complete = transactionComplete(tx);
      const records = await requestResult(tx.objectStore(RECORDS_STORE).getAll(IDBKeyRange.bound([address, "state", ""], [address, "state", "\uffff"])));
      await complete;
      const states: Record<string, unknown> = {};
      for (const record of records as StoredRecord[]) states[record.id] = await decryptValue(await key(), record.payload);
      return {
        format: "midnight-private-state-export",
        encryptedPayload: await encryptValue(await key(), { contractAddress: address, states }),
        salt: randomSalt(),
      };
    },
    async importPrivateStates(exportData, options?: ImportPrivateStatesOptions): Promise<ImportPrivateStatesResult> {
      if (options?.password) throw new Error("Password-based private-state import is not enabled in the browser provider.");
      const address = requireAddress(contractAddress);
      const payload = (await decryptValue(await key(), exportData.encryptedPayload)) as { contractAddress?: string; states?: Record<string, unknown> };
      if (payload.contractAddress !== address || !payload.states) throw new Error("private-state export belongs to another contract");
      let imported = 0;
      let skipped = 0;
      let overwritten = 0;
      for (const [id, state] of Object.entries(payload.states)) {
        const existing = await readRecord("state", id);
        if (existing !== null) {
          if (options?.conflictStrategy === "skip") {
            skipped += 1;
            continue;
          }
          if (options?.conflictStrategy !== "overwrite") throw new Error(`Private state conflict for '${id}'`);
          overwritten += 1;
        } else {
          imported += 1;
        }
        await writeRecord("state", id, state);
      }
      return { imported, skipped, overwritten };
    },
    async exportSigningKeys(options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      if (options?.password) throw new Error("Password-based signing-key export is not enabled in the browser provider.");
      const db = await database();
      const tx = db.transaction(RECORDS_STORE, "readonly");
      const complete = transactionComplete(tx);
      const records = await requestResult(tx.objectStore(RECORDS_STORE).getAll(IDBKeyRange.bound(["", "signing-key", ""], ["\uffff", "signing-key", "\uffff"])));
      await complete;
      const keys: Record<string, unknown> = {};
      for (const record of records as StoredRecord[]) keys[record.id] = await decryptValue(await key(), record.payload);
      return {
        format: "midnight-signing-key-export",
        encryptedPayload: await encryptValue(await key(), { keys }),
        salt: randomSalt(),
      };
    },
    async importSigningKeys(exportData, options?: ImportSigningKeysOptions): Promise<ImportSigningKeysResult> {
      if (options?.password) throw new Error("Password-based signing-key import is not enabled in the browser provider.");
      const payload = (await decryptValue(await key(), exportData.encryptedPayload)) as { keys?: Record<string, SigningKey> };
      if (!payload.keys) throw new Error("signing-key export is invalid");
      let imported = 0;
      let skipped = 0;
      let overwritten = 0;
      for (const [address, signingKey] of Object.entries(payload.keys)) {
        const existing = await readRecord("signing-key", address, address);
        if (existing !== null) {
          if (options?.conflictStrategy === "skip") {
            skipped += 1;
            continue;
          }
          if (options?.conflictStrategy !== "overwrite") throw new Error(`Signing key conflict for '${address}'`);
          overwritten += 1;
        } else {
          imported += 1;
        }
        await writeRecord("signing-key", address, signingKey, address);
      }
      return { imported, skipped, overwritten };
    },
  };
};
