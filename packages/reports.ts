import { AccountingEngine, DecimalMoney, type BusinessAccount, type JournalEntry } from './accounting';
import type { BillingFeature, SubscriptionService } from './subscriptions';

export interface GeneralLedgerRow {
  date: string;
  journalNo: string;
  reference: string;
  description: string;
  accountId: string;
  accountName: string;
  debit: string;
  credit: string;
  balance: string;
}

export interface GeneralLedgerReport {
  businessId: string;
  rows: GeneralLedgerRow[];
  openingBalance: string;
  closingBalance: string;
  totalDebit: string;
  totalCredit: string;
}

export interface AccountStatementRow {
  date: string;
  journalNo: string;
  reference: string;
  description: string;
  debit: string;
  credit: string;
  runningBalance: string;
}

export interface AccountStatementReport {
  businessId: string;
  accountId: string;
  accountName: string;
  openingBalance: string;
  closingBalance: string;
  totalDebit: string;
  totalCredit: string;
  transactions: AccountStatementRow[];
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface TrialBalanceReport {
  businessId: string;
  rows: TrialBalanceRow[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
  isBalanced: boolean;
}

export interface ProfitAndLossReport {
  businessId: string;
  revenueTotal: string;
  cogsTotal: string;
  expensesTotal: string;
  grossProfit: string;
  netProfit: string;
  sections: {
    revenue: Array<{ accountId: string; accountName: string; amount: string }>;
    cogs: Array<{ accountId: string; accountName: string; amount: string }>;
    expenses: Array<{ accountId: string; accountName: string; amount: string }>;
  };
}

export interface BalanceSheetReport {
  businessId: string;
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  balanceDifference: string;
  isBalanced: boolean;
  assets: Array<{ accountId: string; accountName: string; amount: string }>;
  liabilities: Array<{ accountId: string; accountName: string; amount: string }>;
  equity: Array<{ accountId: string; accountName: string; amount: string }>;
}

export interface CashFlowReport {
  businessId: string;
  openingCash: string;
  operatingCashFlow: string;
  investingCashFlow: string;
  financingCashFlow: string;
  netCashFlow: string;
  closingCash: string;
}

export interface FinancialReportRepositoryLike {
  getBusinessAccounts?: (businessId: string) => BusinessAccount[];
  getPostedJournals?: (businessId: string) => JournalEntry[];
  getAccount?: (businessId: string, accountId: string) => BusinessAccount | undefined;
}

export interface FinancialReportServiceOptions {
  engine?: AccountingEngine;
  repository?: FinancialReportRepositoryLike;
  subscriptionService?: SubscriptionService;
}

export class FinancialReportService {
  private readonly engine: AccountingEngine;
  private readonly repository?: FinancialReportRepositoryLike;
  private readonly subscriptionService?: SubscriptionService;

  constructor(engineOrOptions: AccountingEngine | FinancialReportServiceOptions = new AccountingEngine({ businessId: '', accounts: [] }), options: FinancialReportServiceOptions = {}) {
    if (engineOrOptions instanceof AccountingEngine) {
      this.engine = engineOrOptions;
      this.repository = options.repository;
      this.subscriptionService = options.subscriptionService;
      return;
    }

    this.engine = engineOrOptions.engine ?? new AccountingEngine({ businessId: '', accounts: [] });
    this.repository = engineOrOptions.repository ?? options.repository;
    this.subscriptionService = engineOrOptions.subscriptionService ?? options.subscriptionService;
  }

  private requireReportActionAccess(businessId: string, action: 'view' | 'print' | 'download' | 'export', actor: string, featureOverride?: BillingFeature): void {
    void businessId;
    void action;
    void actor;
    void featureOverride;
  }

  getReportAccessState(businessId: string, actor: string, action: 'view' | 'print' | 'download' | 'export' = 'view', featureOverride?: BillingFeature): boolean {
    void businessId;
    void actor;
    void action;
    void featureOverride;
    return true;
  }

  getSubscriptionRequiredMessage(feature: BillingFeature): string {
    return this.subscriptionService?.getFeatureAccessMessage(feature) ?? 'Standalone accounting access is enabled; billing gates are disabled for this application.';
  }

  assertReportActionAccess(businessId: string, action: 'view' | 'print' | 'download' | 'export', actor: string, featureOverride?: BillingFeature): void {
    this.requireReportActionAccess(businessId, action, actor, featureOverride);
  }

  viewReport(businessId: string, actor: string, featureOverride?: BillingFeature): string {
    this.requireReportActionAccess(businessId, 'view', actor, featureOverride);
    return 'view-ready';
  }

  printReport(businessId: string, actor: string, featureOverride?: BillingFeature): string {
    this.requireReportActionAccess(businessId, 'print', actor, featureOverride);
    return 'print-ready';
  }

  downloadReport(businessId: string, actor: string, featureOverride?: BillingFeature): string {
    this.requireReportActionAccess(businessId, 'download', actor, featureOverride);
    return 'download-ready';
  }

  exportReport(businessId: string, actor: string, featureOverride?: BillingFeature): string {
    this.requireReportActionAccess(businessId, 'export', actor, featureOverride);
    return 'export-ready';
  }

  private getBusinessAccounts(businessId: string): BusinessAccount[] {
    if (this.repository?.getBusinessAccounts) {
      return this.repository.getBusinessAccounts(businessId);
    }

    return [...((this.engine as any).accounts as Map<string, BusinessAccount>).values()].filter(
      (account) => account.businessId === businessId,
    );
  }

  private getPostedJournals(businessId: string): JournalEntry[] {
    if (this.repository?.getPostedJournals) {
      return this.repository.getPostedJournals(businessId);
    }

    return [...((this.engine as any).journals as Map<string, JournalEntry>).values()].filter(
      (journal) => journal.businessId === businessId && journal.status === 'POSTED',
    );
  }

  private getAccount(businessId: string, accountId: string): BusinessAccount {
    const repositoryAccount = this.repository?.getAccount?.(businessId, accountId);
    if (repositoryAccount) {
      return repositoryAccount;
    }

    const account = this.getBusinessAccounts(businessId).find((entry) => entry.id === accountId);
    if (!account) throw new Error('Account not found.');
    return account;
  }

  private assertBusinessOwnedAccount(businessId: string, accountId: string): void {
    const account = this.repository?.getAccount?.(businessId, accountId) ?? this.getBusinessAccounts(businessId).find((entry) => entry.id === accountId);
    if (!account) {
      throw new Error(`Account ${accountId} does not belong to this business.`);
    }
  }

  private isWithinDateRange(date: string, from?: string, to?: string): boolean {
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  }

  private getBalanceImpact(account: BusinessAccount, line: { debit?: string; credit?: string }): DecimalMoney {
    const debit = new DecimalMoney(line.debit ?? '0.00');
    const credit = new DecimalMoney(line.credit ?? '0.00');
    if (account.normalBalance === 'DEBIT') {
      return debit.subtract(credit);
    }
    return credit.subtract(debit);
  }

  private getOpeningBalance(businessId: string, accountId: string, dateFrom?: string): DecimalMoney {
    if (!dateFrom) return DecimalMoney.zero();

    const account = this.getAccount(businessId, accountId);
    let balance = DecimalMoney.zero();
    for (const journal of this.getPostedJournals(businessId)) {
      if (journal.journalDate > dateFrom) continue;
      if (journal.journalDate === dateFrom && !this.shouldExcludeOpeningJournal(journal, dateFrom)) continue;
      for (const line of journal.lines) {
        if (line.accountId !== accountId) continue;
        balance = balance.add(this.getBalanceImpact(account, line));
      }
    }
    return balance;
  }

  private shouldExcludeOpeningJournal(journal: JournalEntry, dateFrom?: string): boolean {
    if (!dateFrom || journal.journalDate !== dateFrom) return false;
    if (journal.sourceType !== 'SYSTEM') return false;

    const journalNo = (journal.journalNo ?? '').toUpperCase();
    const description = (journal.description ?? '').toLowerCase();
    return journalNo.startsWith('OB-') || journalNo.startsWith('OPEN-') || description.includes('opening balance');
  }

  private getRangeJournalLines(businessId: string, dateFrom?: string, dateTo?: string) {
    return this.getPostedJournals(businessId)
      .filter((journal) => !this.shouldExcludeOpeningJournal(journal, dateFrom))
      .filter((journal) => this.isWithinDateRange(journal.journalDate, dateFrom, dateTo))
      .sort((a, b) => a.journalDate.localeCompare(b.journalDate));
  }

  getGeneralLedger(input: {
    businessId: string;
    dateFrom?: string;
    dateTo?: string;
    accountId?: string;
    accountType?: string;
    postedStatus?: 'POSTED' | 'ALL';
  }): GeneralLedgerReport {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);

    if (input.accountId) {
      this.assertBusinessOwnedAccount(input.businessId, input.accountId);
    }

    const accounts = this.getBusinessAccounts(input.businessId).filter((account) => {
      if (input.accountType && account.accountType !== input.accountType) return false;
      return true;
    });

    const selectedAccounts = input.accountId ? accounts.filter((account) => account.id === input.accountId) : accounts;
    const rows: GeneralLedgerRow[] = [];
    let openingBalance = DecimalMoney.zero();
    let closingBalance = DecimalMoney.zero();
    let totalDebit = DecimalMoney.zero();
    let totalCredit = DecimalMoney.zero();

    for (const account of selectedAccounts) {
      const start = this.getOpeningBalance(input.businessId, account.id, input.dateFrom);
      let running = start;
      openingBalance = openingBalance.add(start);
      for (const journal of this.getRangeJournalLines(input.businessId, input.dateFrom, input.dateTo)) {
        for (const line of journal.lines) {
          if (line.accountId !== account.id) continue;
          const debit = new DecimalMoney(line.debit ?? '0.00');
          const credit = new DecimalMoney(line.credit ?? '0.00');
          totalDebit = totalDebit.add(debit);
          totalCredit = totalCredit.add(credit);
          running = running.add(this.getBalanceImpact(account, line));
          rows.push({
            date: journal.journalDate,
            journalNo: journal.journalNo,
            reference: journal.referenceNo ?? journal.sourceId ?? '',
            description: journal.description ?? '',
            accountId: account.id,
            accountName: account.name,
            debit: debit.toString(),
            credit: credit.toString(),
            balance: running.toString(),
          });
        }
      }
      closingBalance = closingBalance.add(running);
    }

    rows.sort((a, b) => a.date.localeCompare(b.date) || a.journalNo.localeCompare(b.journalNo));

    return {
      businessId: input.businessId,
      rows,
      openingBalance: openingBalance.toString(),
      closingBalance: closingBalance.toString(),
      totalDebit: totalDebit.toString(),
      totalCredit: totalCredit.toString(),
    };
  }

  getAccountStatement(input: {
    businessId: string;
    accountId: string;
    dateFrom?: string;
    dateTo?: string;
  }): AccountStatementReport {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);
    this.assertBusinessOwnedAccount(input.businessId, input.accountId);
    const account = this.getAccount(input.businessId, input.accountId);
    const openingBalance = this.getOpeningBalance(input.businessId, input.accountId, input.dateFrom);
    let runningBalance = openingBalance;
    let totalDebit = DecimalMoney.zero();
    let totalCredit = DecimalMoney.zero();
    const transactions: AccountStatementRow[] = [];

    for (const journal of this.getRangeJournalLines(input.businessId, input.dateFrom, input.dateTo)) {
      for (const line of journal.lines) {
        if (line.accountId !== input.accountId) continue;
        const debit = new DecimalMoney(line.debit ?? '0.00');
        const credit = new DecimalMoney(line.credit ?? '0.00');
        totalDebit = totalDebit.add(debit);
        totalCredit = totalCredit.add(credit);
        runningBalance = runningBalance.add(this.getBalanceImpact(account, line));
        transactions.push({
          date: journal.journalDate,
          journalNo: journal.journalNo,
          reference: journal.referenceNo ?? journal.sourceId ?? '',
          description: journal.description ?? '',
          debit: debit.toString(),
          credit: credit.toString(),
          runningBalance: runningBalance.toString(),
        });
      }
    }

    return {
      businessId: input.businessId,
      accountId: account.id,
      accountName: account.name,
      openingBalance: openingBalance.toString(),
      closingBalance: runningBalance.toString(),
      totalDebit: totalDebit.toString(),
      totalCredit: totalCredit.toString(),
      transactions,
    };
  }

  getTrialBalance(input: {
    businessId: string;
    dateFrom?: string;
    dateTo?: string;
  }): TrialBalanceReport {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);
    const rows: TrialBalanceRow[] = [];
    let totalDebit = DecimalMoney.zero();
    let totalCredit = DecimalMoney.zero();

    for (const account of this.getBusinessAccounts(input.businessId)) {
      let debit = DecimalMoney.zero();
      let credit = DecimalMoney.zero();
      for (const journal of this.getRangeJournalLines(input.businessId, input.dateFrom, input.dateTo)) {
        for (const line of journal.lines) {
          if (line.accountId !== account.id) continue;
          debit = debit.add(new DecimalMoney(line.debit ?? '0.00'));
          credit = credit.add(new DecimalMoney(line.credit ?? '0.00'));
        }
      }
      if (debit.isPositive() || credit.isPositive()) {
        rows.push({
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          debit: debit.toString(),
          credit: credit.toString(),
        });
        totalDebit = totalDebit.add(debit);
        totalCredit = totalCredit.add(credit);
      }
    }

    const difference = totalDebit.subtract(totalCredit);
    return {
      businessId: input.businessId,
      rows,
      totalDebit: totalDebit.toString(),
      totalCredit: totalCredit.toString(),
      difference: difference.toString(),
      isBalanced: difference.isZero(),
    };
  }

  getProfitAndLoss(input: {
    businessId: string;
    dateFrom?: string;
    dateTo?: string;
  }): ProfitAndLossReport {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);
    const revenue: Array<{ accountId: string; accountName: string; amount: string }> = [];
    const cogs: Array<{ accountId: string; accountName: string; amount: string }> = [];
    const expenses: Array<{ accountId: string; accountName: string; amount: string }> = [];

    let revenueTotal = DecimalMoney.zero();
    let cogsTotal = DecimalMoney.zero();
    let expensesTotal = DecimalMoney.zero();

    for (const account of this.getBusinessAccounts(input.businessId)) {
      let amount = DecimalMoney.zero();
      for (const journal of this.getRangeJournalLines(input.businessId, input.dateFrom, input.dateTo)) {
        for (const line of journal.lines) {
          if (line.accountId !== account.id) continue;
          if (account.accountType === 'REVENUE') amount = amount.add(new DecimalMoney(line.credit ?? '0.00'));
          if (account.accountType === 'COGS') amount = amount.add(new DecimalMoney(line.debit ?? '0.00'));
          if (account.accountType === 'EXPENSE') amount = amount.add(new DecimalMoney(line.debit ?? '0.00'));
        }
      }

      if (account.accountType === 'REVENUE' && amount.isPositive()) {
        revenue.push({ accountId: account.id, accountName: account.name, amount: amount.toString() });
        revenueTotal = revenueTotal.add(amount);
      }
      if (account.accountType === 'COGS' && amount.isPositive()) {
        cogs.push({ accountId: account.id, accountName: account.name, amount: amount.toString() });
        cogsTotal = cogsTotal.add(amount);
      }
      if (account.accountType === 'EXPENSE' && amount.isPositive()) {
        expenses.push({ accountId: account.id, accountName: account.name, amount: amount.toString() });
        expensesTotal = expensesTotal.add(amount);
      }
    }

    const grossProfit = revenueTotal.subtract(cogsTotal);
    const netProfit = grossProfit.subtract(expensesTotal);

    return {
      businessId: input.businessId,
      revenueTotal: revenueTotal.toString(),
      cogsTotal: cogsTotal.toString(),
      expensesTotal: expensesTotal.toString(),
      grossProfit: grossProfit.toString(),
      netProfit: netProfit.toString(),
      sections: { revenue, cogs, expenses },
    };
  }

  getBalanceSheet(input: {
    businessId: string;
    dateFrom?: string;
    dateTo?: string;
  }): BalanceSheetReport {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);
    const accounts = this.getBusinessAccounts(input.businessId);
    const assets: Array<{ accountId: string; accountName: string; amount: string }> = [];
    const liabilities: Array<{ accountId: string; accountName: string; amount: string }> = [];
    const equity: Array<{ accountId: string; accountName: string; amount: string }> = [];

    let totalAssets = DecimalMoney.zero();
    let totalLiabilities = DecimalMoney.zero();
    let totalEquity = DecimalMoney.zero();

    for (const account of accounts) {
      const opening = this.getOpeningBalance(input.businessId, account.id, input.dateFrom);
      let closing = opening;
      for (const journal of this.getRangeJournalLines(input.businessId, input.dateFrom, input.dateTo)) {
        for (const line of journal.lines) {
          if (line.accountId !== account.id) continue;
          closing = closing.add(this.getBalanceImpact(account, line));
        }
      }

      if (account.accountType === 'ASSET') {
        assets.push({ accountId: account.id, accountName: account.name, amount: closing.toString() });
        totalAssets = totalAssets.add(closing);
      }
      if (account.accountType === 'LIABILITY') {
        liabilities.push({ accountId: account.id, accountName: account.name, amount: closing.toString() });
        totalLiabilities = totalLiabilities.add(closing);
      }
      if (account.accountType === 'EQUITY') {
        equity.push({ accountId: account.id, accountName: account.name, amount: closing.toString() });
        totalEquity = totalEquity.add(closing);
      }
    }

    const pnl = this.getProfitAndLoss(input);
    totalEquity = totalEquity.add(new DecimalMoney(pnl.netProfit));
    const balanceDifference = totalAssets.subtract(totalLiabilities.add(totalEquity));

    return {
      businessId: input.businessId,
      totalAssets: totalAssets.toString(),
      totalLiabilities: totalLiabilities.toString(),
      totalEquity: totalEquity.toString(),
      balanceDifference: balanceDifference.toString(),
      isBalanced: balanceDifference.isZero(),
      assets,
      liabilities,
      equity,
    };
  }

  getCashFlow(input: {
    businessId: string;
    dateFrom?: string;
    dateTo?: string;
  }): CashFlowReport {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);
    const accounts = this.getBusinessAccounts(input.businessId);
    const cashAccounts = accounts.filter((account) => account.accountType === 'ASSET' && (account.name.toLowerCase().includes('cash') || account.name.toLowerCase().includes('bank') || account.name.toLowerCase().includes('maybank')));

    let openingCash = DecimalMoney.zero();
    for (const account of cashAccounts) {
      openingCash = openingCash.add(this.getOpeningBalance(input.businessId, account.id, input.dateFrom));
    }

    let operatingCashFlow = DecimalMoney.zero();
    let investingCashFlow = DecimalMoney.zero();
    let financingCashFlow = DecimalMoney.zero();

    for (const journal of this.getRangeJournalLines(input.businessId, input.dateFrom, input.dateTo)) {
      const cashLines = journal.lines.filter((line) => cashAccounts.some((account) => account.id === line.accountId));
      const hasExternalImpact = journal.lines.some((line) => !cashAccounts.some((account) => account.id === line.accountId));

      if (cashLines.length > 0 && cashLines.length === journal.lines.length) {
        continue;
      }

      for (const line of cashLines) {
        const account = cashAccounts.find((entry) => entry.id === line.accountId);
        if (!account || !hasExternalImpact) continue;
        operatingCashFlow = operatingCashFlow.add(this.getBalanceImpact(account, line));
      }
    }

    const netCashFlow = operatingCashFlow.add(investingCashFlow).add(financingCashFlow);
    const closingCash = openingCash.add(netCashFlow);

    return {
      businessId: input.businessId,
      openingCash: openingCash.toString(),
      operatingCashFlow: operatingCashFlow.toString(),
      investingCashFlow: investingCashFlow.toString(),
      financingCashFlow: financingCashFlow.toString(),
      netCashFlow: netCashFlow.toString(),
      closingCash: closingCash.toString(),
    };
  }
}
