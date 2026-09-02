export type Category = 'Primary' | 'Updates' | 'Promotions' | 'Receipts';
export type ConnectionMode = 'demo' | 'disconnected' | 'readonly' | 'cleanup';

export interface Email {
  id: string;
  sender: string;
  address: string;
  subject: string;
  preview: string;
  date: string;
  size: number;
  read: boolean;
  starred: boolean;
  attachment: boolean;
  category: Category;
  trashed: boolean;
}

export interface AuditEvent {
  id: string;
  action: 'Moved to Trash' | 'Restored';
  count: number;
  detail: string;
  at: string;
}

export interface Filters {
  search: string;
  read: 'all' | 'read' | 'unread';
  starred: boolean;
  attachment: boolean;
  category: 'All' | Category;
  age: 'all' | '30' | '90' | '365';
}
