export function senderDomain(address) { return address.trim().toLowerCase().split('@')[1] ?? ''; }
export function protectedMessage(m, p) { return p.senders.has(m.fromAddress.toLowerCase()) || p.domains.has(senderDomain(m.fromAddress)); }
