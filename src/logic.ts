import type { Email, Filters } from './types';

export function domainOf(address: string) {
  return address.split('@')[1]?.toLowerCase() ?? '';
}

export function isProtected(email: Email, senders: Set<string>, domains: Set<string>) {
  return senders.has(email.address.toLowerCase()) || domains.has(domainOf(email.address));
}

export function applyFilters(emails: Email[], filters: Filters, now = Date.now()) {
  return emails.filter(email => {
    const text = `${email.sender} ${email.address} ${email.subject} ${email.preview}`.toLowerCase();
    const cutoff = filters.age === 'all' ? Infinity : Number(filters.age) * 86400000;
    return text.includes(filters.search.toLowerCase())
      && (filters.read === 'all' || (filters.read === 'read' ? email.read : !email.read))
      && (!filters.starred || email.starred)
      && (!filters.attachment || email.attachment)
      && (filters.category === 'All' || email.category === filters.category)
      && (filters.age === 'all' || now - new Date(email.date).getTime() <= cutoff);
  });
}

export function enforceKeepNewest(emails: Email[], selected: Set<string>, keep: number) {
  if (keep <= 0) return new Set(selected);
  const bySender = new Map<string, Email[]>();
  for (const email of emails) {
    const list = bySender.get(email.address) ?? [];
    list.push(email);
    bySender.set(email.address, list);
  }
  const blocked = new Set<string>();
  for (const group of bySender.values()) {
    group.sort((a,b) => +new Date(b.date) - +new Date(a.date)).slice(0, keep).forEach(e => blocked.add(e.id));
  }
  return new Set([...selected].filter(id => !blocked.has(id)));
}

export function safeTrashIds(emails: Email[], selected: Set<string>, senders: Set<string>, domains: Set<string>, keep: number) {
  const available = new Set([...selected].filter(id => {
    const email = emails.find(item => item.id === id);
    return email && !email.trashed && !isProtected(email, senders, domains);
  }));
  return enforceKeepNewest(emails.filter(e => !e.trashed), available, keep);
}

export const formatBytes = (bytes: number) => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
