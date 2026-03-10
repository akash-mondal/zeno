import type { MirrorNodeMessage, TokenBalance, NFTInfo } from './types';

const MIRROR_BASE = process.env.HEDERA_MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com';

interface TopicMessageFilters {
  timestampGte?: string;
  limit?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mirror Node error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getTopicMessages(
  topicId: string,
  filters?: TopicMessageFilters
): Promise<MirrorNodeMessage[]> {
  const params = new URLSearchParams();
  params.set('order', 'asc');

  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.timestampGte) params.set('timestamp', `gte:${filters.timestampGte}`);

  const allMessages: MirrorNodeMessage[] = [];
  let url: string | null = `${MIRROR_BASE}/api/v1/topics/${topicId}/messages?${params}`;

  while (url) {
    const data = await fetchJSON(url);
    const messages: MirrorNodeMessage[] = data.messages || [];
    allMessages.push(...messages);

    url = data.links?.next ? `${MIRROR_BASE}${data.links.next}` : null;
  }

  return allMessages;
}

export async function getAccountTokens(accountId: string): Promise<TokenBalance[]> {
  const data = await fetchJSON(`${MIRROR_BASE}/api/v1/accounts/${accountId}/tokens`);

  return (data.tokens || []).map((t: Record<string, unknown>) => ({
    token_id: t.token_id as string,
    balance: Number(t.balance),
    decimals: Number(t.decimals),
  }));
}

/**
 * Query transaction details from Mirror Node.
 * Accepts SDK format (0.0.X@sss.nnn) or Mirror Node format (0.0.X-sss-nnn).
 */
export async function getTransactionDetails(txId: string): Promise<Record<string, unknown>> {
  // Convert SDK format "0.0.X@sss.nnn" → Mirror Node format "0.0.X-sss-nnn"
  let mirrorTxId = txId;
  if (txId.includes('@')) {
    const [account, timestamp] = txId.split('@');
    mirrorTxId = `${account}-${timestamp.replace('.', '-')}`;
  }
  const data = await fetchJSON(`${MIRROR_BASE}/api/v1/transactions/${mirrorTxId}`);
  return data.transactions?.[0] || data;
}

export async function getNFTInfo(tokenId: string, serial: number): Promise<NFTInfo> {
  return await fetchJSON(`${MIRROR_BASE}/api/v1/tokens/${tokenId}/nfts/${serial}`);
}

export async function getAccountBalance(accountId: string): Promise<{ hbar: number }> {
  const data = await fetchJSON(`${MIRROR_BASE}/api/v1/accounts/${accountId}`);
  return { hbar: Number(data.balance?.balance || 0) / 1e8 };
}
