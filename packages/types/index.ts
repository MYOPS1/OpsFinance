export type Role = 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'STAFF' | 'VIEWER';
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'COGS' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Business {
  id: string;
  name: string;
  registrationNo?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  baseCurrency: string;
  fiscalYearStart?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessMember {
  id: string;
  businessId: string;
  userId: string;
  role: Role;
  createdAt: string;
}

