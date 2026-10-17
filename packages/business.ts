import type { AccountingPeriod } from './accounting';
import type { Business } from './types';

export interface BusinessContext {
  businessId: string;
  userId: string;
}

export interface UpdateBusinessProfileInput {
  businessId: string;
  userId: string;
  name?: string;
  registrationNo?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  baseCurrency?: string;
  fiscalYearStart?: string | null;
}

export interface AccountingPeriodPatch {
  id: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  status?: 'OPEN' | 'CLOSED';
}

export interface UpdateAccountingSettingsInput extends BusinessContext {
  baseCurrency?: string;
  fiscalYearStart?: string | null;
  periods?: AccountingPeriodPatch[];
}

export interface AccountingSettings {
  businessId: string;
  baseCurrency: string;
  fiscalYearStart: string | null;
  periods: AccountingPeriod[];
  openPeriods: AccountingPeriod[];
  closedPeriods: AccountingPeriod[];
  updatedAt: string;
}

export class BusinessService {
  private readonly businesses = new Map<string, Business>();
  private readonly membershipByBusiness = new Map<string, Set<string>>();
  private readonly periodsByBusiness = new Map<string, AccountingPeriod[]>();
  private readonly historicalCurrenciesByBusiness = new Map<string, string[]>();

  constructor(
    initialBusinesses: Business[] = [],
    initialPeriods: AccountingPeriod[] = [],
    historicalCurrencies: Record<string, string[]> = {},
  ) {
    for (const business of initialBusinesses) {
      this.businesses.set(business.id, { ...business });
      const members = this.membershipByBusiness.get(business.id) ?? new Set<string>();
      members.add('owner-user');
      members.add('user-owner');
      this.membershipByBusiness.set(business.id, members);
    }

    for (const period of initialPeriods) {
      this.addAccountingPeriod(period);
    }

    for (const [businessId, currencyHistory] of Object.entries(historicalCurrencies)) {
      this.historicalCurrenciesByBusiness.set(
        businessId,
        [...new Set((currencyHistory ?? []).map((currency) => currency.trim().toUpperCase()).filter(Boolean))],
      );
    }
  }

  private assertBusinessAccess(context: BusinessContext): void {
    const members = this.membershipByBusiness.get(context.businessId) ?? new Set<string>();
    if (!members.has(context.userId)) {
      throw new Error('Business access denied.');
    }
  }

  private cloneBusiness(record: Business): Business {
    return { ...record };
  }

  private cloneAccountingPeriod(record: AccountingPeriod): AccountingPeriod {
    return { ...record };
  }

  private getBusinessPeriods(businessId: string): AccountingPeriod[] {
    return [...(this.periodsByBusiness.get(businessId) ?? [])].map((period) => this.cloneAccountingPeriod(period));
  }

  private addAccountingPeriod(period: AccountingPeriod): void {
    const current = this.periodsByBusiness.get(period.businessId) ?? [];
    const next = [...current.filter((candidate) => candidate.id !== period.id), this.cloneAccountingPeriod(period)];
    next.sort((left, right) => left.startDate.localeCompare(right.startDate));
    this.periodsByBusiness.set(period.businessId, next);
  }

  private parseCurrency(value: string | null | undefined): string {
    return (value ?? '').trim().toUpperCase();
  }

  private validateBaseCurrency(value: string | null | undefined): string {
    const normalized = this.parseCurrency(value);
    if (!normalized || !/^[A-Z]{3}$/.test(normalized)) {
      throw new Error('Base currency must be a valid 3-letter ISO code.');
    }
    return normalized;
  }

  private validateFiscalYearStart(value: string | null | undefined): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error('Fiscal year start must be a valid date.');
    }

    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Fiscal year start must be a valid date.');
    }

    return value;
  }

  private ensureSafeCurrencyChange(businessId: string, existingCurrency: string, nextCurrency: string): void {
    if (existingCurrency === nextCurrency) {
      return;
    }

    const historicalCurrencies = (this.historicalCurrenciesByBusiness.get(businessId) ?? []).map((currency) => currency.trim().toUpperCase()).filter(Boolean);
    if (historicalCurrencies.length === 0) {
      return;
    }

    const admissibleCurrencies = new Set([existingCurrency.trim().toUpperCase(), ...historicalCurrencies]);
    if (!admissibleCurrencies.has(nextCurrency.trim().toUpperCase())) {
      throw new Error('Base currency change is unsafe because historical transaction currencies exist.');
    }
  }

  private ensureClosedPeriodsProtected(businessId: string, candidatePatches?: AccountingPeriodPatch[]): void {
    if (!candidatePatches || candidatePatches.length === 0) {
      return;
    }

    const existingPeriods = this.getBusinessPeriods(businessId);
    const byId = new Map(existingPeriods.map((period) => [period.id, period]));

    for (const patch of candidatePatches) {
      const existing = byId.get(patch.id);
      if (!existing) {
        continue;
      }

      if (existing.status === 'CLOSED') {
        const nextStatus = patch.status ?? existing.status;
        const nextName = patch.name ?? existing.name;
        const nextStartDate = patch.startDate ?? existing.startDate;
        const nextEndDate = patch.endDate ?? existing.endDate;

        if (
          nextStatus !== 'CLOSED' ||
          nextName !== existing.name ||
          nextStartDate !== existing.startDate ||
          nextEndDate !== existing.endDate
        ) {
          throw new Error('Closed accounting periods cannot be modified.');
        }
      }
    }
  }

  registerBusiness(business: Business, userId = 'owner-user'): Business {
    if (!business.name?.trim()) {
      throw new Error('Business name is required.');
    }

    const sanitized: Business = {
      ...business,
      id: business.id,
      name: business.name.trim(),
      registrationNo: business.registrationNo ?? null,
      address: business.address ?? null,
      phone: business.phone ?? null,
      email: business.email ?? null,
      baseCurrency: business.baseCurrency || 'MYR',
      fiscalYearStart: business.fiscalYearStart ?? null,
      createdAt: business.createdAt || new Date().toISOString(),
      updatedAt: business.updatedAt || new Date().toISOString(),
    };

    const existing = this.businesses.get(sanitized.id);
    if (existing) {
      this.assertBusinessAccess({ businessId: sanitized.id, userId });
      return this.cloneBusiness(existing);
    }

    this.businesses.set(sanitized.id, sanitized);
    const members = this.membershipByBusiness.get(sanitized.id) ?? new Set<string>();
    members.add(userId);
    this.membershipByBusiness.set(sanitized.id, members);
    return this.cloneBusiness(sanitized);
  }

  getBusinessProfile(context: BusinessContext): Business {
    this.assertBusinessAccess(context);
    const business = this.businesses.get(context.businessId);
    if (!business) {
      throw new Error('Business not found.');
    }
    return this.cloneBusiness(business);
  }

  updateBusinessProfile(input: UpdateBusinessProfileInput): Business {
    const context: BusinessContext = { businessId: input.businessId, userId: input.userId };
    this.assertBusinessAccess(context);

    const existing = this.businesses.get(input.businessId);
    if (!existing) {
      throw new Error('Business not found.');
    }

    const name = input.name?.trim() ?? existing.name;
    if (!name) {
      throw new Error('Business name is required.');
    }

    const email = input.email ?? existing.email;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Business email is invalid.');
    }

    const baseCurrency = this.validateBaseCurrency(input.baseCurrency ?? existing.baseCurrency ?? 'MYR');

    const updated: Business = {
      ...existing,
      name,
      registrationNo: input.registrationNo ?? existing.registrationNo ?? null,
      address: input.address ?? existing.address ?? null,
      phone: input.phone ?? existing.phone ?? null,
      email: email ?? null,
      baseCurrency,
      fiscalYearStart: this.validateFiscalYearStart(input.fiscalYearStart ?? existing.fiscalYearStart ?? null),
      updatedAt: new Date().toISOString(),
    };

    this.businesses.set(existing.id, updated);
    return this.cloneBusiness(updated);
  }

  getAccountingSettings(context: BusinessContext): AccountingSettings {
    this.assertBusinessAccess(context);
    const business = this.businesses.get(context.businessId);
    if (!business) {
      throw new Error('Business not found.');
    }

    const periods = this.getBusinessPeriods(business.id);
    const openPeriods = periods.filter((period) => period.status === 'OPEN');
    const closedPeriods = periods.filter((period) => period.status === 'CLOSED');

    return {
      businessId: business.id,
      baseCurrency: business.baseCurrency,
      fiscalYearStart: business.fiscalYearStart ?? null,
      periods,
      openPeriods,
      closedPeriods,
      updatedAt: business.updatedAt,
    };
  }

  updateAccountingSettings(input: UpdateAccountingSettingsInput): AccountingSettings {
    const context: BusinessContext = { businessId: input.businessId, userId: input.userId };
    this.assertBusinessAccess(context);

    const existing = this.businesses.get(input.businessId);
    if (!existing) {
      throw new Error('Business not found.');
    }

    const nextBaseCurrency = input.baseCurrency ? this.validateBaseCurrency(input.baseCurrency) : existing.baseCurrency;
    this.ensureSafeCurrencyChange(existing.id, existing.baseCurrency, nextBaseCurrency);

    const nextFiscalYearStart = this.validateFiscalYearStart(
      input.fiscalYearStart === undefined ? existing.fiscalYearStart ?? null : input.fiscalYearStart,
    );

    this.ensureClosedPeriodsProtected(existing.id, input.periods);

    const updated: Business = {
      ...existing,
      baseCurrency: nextBaseCurrency,
      fiscalYearStart: nextFiscalYearStart,
      updatedAt: new Date().toISOString(),
    };

    this.businesses.set(existing.id, updated);

    if (input.periods && input.periods.length > 0) {
      const existingPeriods = this.getBusinessPeriods(existing.id);
      const byId = new Map(existingPeriods.map((period) => [period.id, period]));

      for (const patch of input.periods) {
        const current = byId.get(patch.id);
        if (!current) {
          continue;
        }

        const merged: AccountingPeriod = {
          ...current,
          name: patch.name ?? current.name,
          startDate: patch.startDate ?? current.startDate,
          endDate: patch.endDate ?? current.endDate,
          status: patch.status ?? current.status,
        };

        byId.set(current.id, merged);
      }

      this.periodsByBusiness.set(existing.id, [...byId.values()]);
    }

    return this.getAccountingSettings(context);
  }
}
