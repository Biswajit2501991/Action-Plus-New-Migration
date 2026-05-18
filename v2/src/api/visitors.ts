import { apiFetch } from '@/api/client';
import type { Visitor } from '@/features/visitors/visitors.types';

export async function fetchVisitors(): Promise<Visitor[]> {
  const data = await apiFetch<Visitor[]>('/visitors');
  return Array.isArray(data) ? data : [];
}

export async function saveVisitorsBulk(visitors: Visitor[]): Promise<void> {
  await apiFetch('/visitors/bulk', {
    method: 'PUT',
    body: JSON.stringify({ visitors }),
  });
}
