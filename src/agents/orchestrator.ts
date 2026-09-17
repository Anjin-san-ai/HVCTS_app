import type { AgentRequest, AgentResult } from './types';

const API_BASE = '/api/agent';

export async function routeToAgent<T = unknown>(request: AgentRequest): Promise<AgentResult<T>> {
  const response = await fetch(`${API_BASE}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Agent route failed: ${response.statusText}`);
  }
  return response.json();
}

export async function routeParallel<T = unknown>(requests: AgentRequest[]): Promise<AgentResult<T>[]> {
  const response = await fetch(`${API_BASE}/parallel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!response.ok) {
    throw new Error(`Agent parallel route failed: ${response.statusText}`);
  }
  const data = await response.json();
  return data.results;
}

export async function getAgentRegistry(): Promise<Array<{ name: string; capabilities: string[]; description: string }>> {
  const response = await fetch(`${API_BASE}/registry`);
  if (!response.ok) {
    throw new Error(`Registry fetch failed: ${response.statusText}`);
  }
  const data = await response.json();
  return data.agents;
}
