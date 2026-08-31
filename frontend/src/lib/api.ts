const BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://upi-offline-mesh-production-1e9e.up.railway.app";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${r.statusText}`);
  return r.json();
}

export const api = {
  health: () => req<{ publicKey: string; algorithm: string }>("/api/server-key"),

  accounts: () =>
    req<Account[]>("/api/accounts"),

  transactions: () =>
    req<Transaction[]>("/api/transactions"),

  meshState: () =>
    req<MeshState>("/api/mesh/state"),

  send: (body: SendRequest) =>
    req<SendResponse>("/api/demo/send", { method: "POST", body: JSON.stringify(body) }),

  gossip: () =>
    req<GossipResult>("/api/mesh/gossip", { method: "POST" }),

  flush: () =>
    req<FlushResult>("/api/mesh/flush", { method: "POST" }),

  reset: () =>
    req<{ status: string }>("/api/mesh/reset", { method: "POST" }),

  ingest: (packet: IngestPacket, bridgeNodeId: string, hopCount: number) =>
    req<IngestResult>("/api/bridge/ingest", {
      method: "POST",
      body: JSON.stringify(packet),
      headers: {
        "Content-Type": "application/json",
        "X-Bridge-Node-Id": bridgeNodeId,
        "X-Hop-Count": String(hopCount),
      },
    }),
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface Account {
  vpa: string;
  holderName: string;
  balance: number;
  version: number;
}

export interface Transaction {
  id: number;
  packetHash: string;
  senderVpa: string;
  receiverVpa: string;
  amount: number;
  signedAt: string;
  settledAt: string;
  bridgeNodeId: string;
  hopCount: number;
  status: "SETTLED" | "REJECTED";
}

export interface DeviceState {
  deviceId: string;
  hasInternet: boolean;
  packetCount: number;
  packetIds: string[];
}

export interface MeshState {
  devices: DeviceState[];
  idempotencyCacheSize: number;
}

export interface SendRequest {
  senderVpa: string;
  receiverVpa: string;
  amount: number;
  pin: string;
  ttl?: number;
  startDevice?: string;
}

export interface SendResponse {
  packetId: string;
  ciphertextPreview: string;
  ttl: number;
  injectedAt: string;
}

export interface GossipResult {
  transfers: number;
  deviceCounts: Record<string, number>;
}

export interface IngestResult {
  outcome: "SETTLED" | "DUPLICATE_DROPPED" | "INVALID";
  packetHash: string;
  reason: string | null;
  transactionId: number | null;
}

export interface FlushResult {
  uploadsAttempted: number;
  results: Array<{
    bridgeNode: string;
    packetId: string;
    outcome: string;
    reason: string;
    transactionId: number;
  }>;
}

export interface IngestPacket {
  packetId: string;
  ttl: number;
  createdAt: number;
  ciphertext: string;
}
