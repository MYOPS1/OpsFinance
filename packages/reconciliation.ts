import { AccountingEngine, DecimalMoney } from './accounting';
import { TransactionService } from './transactions';

export type ReconciliationStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'LOCKED';
export type MatchType = 'AUTO' | 'MANUAL' | 'PARTIAL';
export type BankDirection = 'DEBIT' | 'CREDIT';
export type BookTransactionType = 'MONEY_IN' | 'MONEY_OUT' | 'TRANSFER' | 'JOURNAL';
export type ReconciliationAction =
  | 'RECONCILIATION_STARTED'
  | 'MATCH_CREATED'
  | 'MATCH_REMOVED'
  | 'MANUAL_MATCH'
  | 'GROUP_CREATED'
  | 'GROUP_MATCHED'
  | 'PARTIAL_MATCH'
  | 'APPROVAL'
  | 'BANK_CHARGE'
  | 'BANK_INTEREST'
  | 'MISSING_TRANSACTION'
  | 'ADJUSTMENT'
  | 'COMPLETION'
  | 'LOCK'
  | 'CORRECTION'
  | 'MODIFICATION_BLOCKED';

export interface FinancialStatement {
  id: string;
  businessId: string;
  financialAccountId: string;
  name: string;
  startDate: string;
  endDate: string;
  openingBalance: string;
  closingBalance: string;
  status: ReconciliationStatus;
  completedBy?: string;
  completedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
  history?: ReconciliationAuditEvent[];
}

export interface ReconciliationAuditEvent {
  id: string;
  businessId: string;
  actor: string;
  action: ReconciliationAction;
  entityType: 'STATEMENT' | 'BANK_TRANSACTION' | 'BOOK_TRANSACTION' | 'MATCH' | 'ADJUSTMENT' | 'SESSION';
  entityId: string;
  timestamp: string;
  details?: string;
}

export interface BankTransaction {
  id: string;
  statementId: string;
  businessId: string;
  financialAccountId: string;
  date: string;
  description: string;
  normalizedDescription: string;
  reference: string;
  debit: string;
  credit: string;
  amount: string;
  balance: string;
  direction: BankDirection;
  source: string;
  transactionId?: string;
  status: 'IMPORTED' | 'MATCHED' | 'UNMATCHED' | 'IGNORED' | 'PARTIAL';
  raw?: Record<string, string>;
}

export interface BookTransaction {
  id: string;
  businessId: string;
  financialAccountId: string;
  date: string;
  description: string;
  referenceNo?: string;
  amount: string;
  type: BookTransactionType;
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'POSTED' | 'VOIDED';
  journalId?: string;
}

export interface ReconciliationMatch {
  id: string;
  sessionId: string;
  bankTransactionId: string;
  bookTransactionIds: string[];
  amount: string;
  direction: BankDirection;
  confidence: number;
  reasons: string[];
  matchType: MatchType;
  status: 'MATCHED' | 'PARTIAL' | 'UNMATCHED';
  businessId: string;
  createdBy: string;
  createdAt: string;
  difference?: string;
  resolutionState?: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  approvedAt?: string;
}

export interface ReconciliationMatchGroup {
  id: string;
  sessionId: string;
  businessId: string;
  bankTransactionIds: string[];
  bookTransactionIds: string[];
  totalAmount: string;
  difference: string;
  status: 'MATCHED' | 'PARTIAL' | 'UNMATCHED';
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  resolutionState?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface ReconciliationSession {
  id: string;
  businessId: string;
  financialAccountId: string;
  statementId: string;
  status: ReconciliationStatus;
  startedAt: string;
  completedBy?: string;
  completedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
  summary: ReconciliationSummary;
  auditTrail: ReconciliationAuditEvent[];
}

export interface MatchCandidate {
  id: string;
  bankTransactionId: string;
  bookTransactionId?: string;
  bookTransactionIds?: string[];
  amount: string;
  direction: BankDirection;
  confidence: number;
  reasons: string[];
  matchType: MatchType;
  status: 'MATCHED' | 'PARTIAL' | 'UNMATCHED';
}

export interface ReconciliationSummary {
  bankTotal: string;
  bookTotal: string;
  difference: string;
  matched: number;
  unmatchedBank: number;
  unmatchedBook: number;
  partial: number;
  status: ReconciliationStatus;
}

export interface ReconciliationException {
  id: string;
  sessionId: string;
  bankTransactionId: string;
  type: 'BANK_CHARGE' | 'BANK_INTEREST' | 'MISSING_TRANSACTION' | 'ADJUSTMENT' | 'INVESTIGATE';
  description: string;
  amount: string;
  approvedBy?: string;
  approvedAt?: string;
  status: 'OPEN' | 'APPROVED' | 'REJECTED';
}

export class ReconciliationService {
  private readonly engine: AccountingEngine;
  private readonly transactionService: TransactionService;
  private readonly statements = new Map<string, FinancialStatement>();
  private readonly bankTransactions = new Map<string, BankTransaction>();
  private readonly bookTransactions = new Map<string, BookTransaction>();
  private readonly matches = new Map<string, ReconciliationMatch>();
  private readonly groups = new Map<string, ReconciliationMatchGroup>();
  private readonly sessions = new Map<string, ReconciliationSession>();
  private readonly exceptions = new Map<string, ReconciliationException>();
  private readonly idempotency = new Map<string, string>();
  private readonly dateToleranceDays = 3;

  constructor(engine: AccountingEngine) {
    this.engine = engine;
    this.transactionService = new TransactionService(engine);
  }

  createSession(input: {
    id: string;
    businessId: string;
    financialAccountId: string;
    statementId: string;
    status?: ReconciliationStatus;
    actor: string;
  }): ReconciliationSession {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);
    const now = new Date().toISOString();
    const session: ReconciliationSession = {
      id: input.id,
      businessId: input.businessId,
      financialAccountId: input.financialAccountId,
      statementId: input.statementId,
      status: input.status ?? 'OPEN',
      startedAt: now,
      summary: {
        bankTotal: '0.00',
        bookTotal: '0.00',
        difference: '0.00',
        matched: 0,
        unmatchedBank: 0,
        unmatchedBook: 0,
        partial: 0,
        status: input.status ?? 'OPEN',
      },
      auditTrail: [],
    };

    this.sessions.set(session.id, session);
    this.addAuditEvent(session.id, input.actor, 'RECONCILIATION_STARTED', 'SESSION', session.id, 'Reconciliation session started');
    return session;
  }

  getSession(sessionId: string): ReconciliationSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Reconciliation session not found.');
    this.engine.authorizeBusiness(session.businessId, this.engine.businessId);
    return session;
  }

  createStatement(input: {
    id: string;
    businessId: string;
    financialAccountId: string;
    name: string;
    startDate: string;
    endDate: string;
    openingBalance: string;
    closingBalance: string;
    status?: ReconciliationStatus;
  }): FinancialStatement {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);
    const statement: FinancialStatement = {
      ...input,
      status: input.status ?? 'OPEN',
      history: [],
    };
    this.statements.set(statement.id, statement);
    return statement;
  }

  getStatement(statementId: string): FinancialStatement {
    const statement = this.statements.get(statementId);
    if (!statement) throw new Error('Statement not found.');
    this.engine.authorizeBusiness(statement.businessId, this.engine.businessId);
    return statement;
  }

  addBankTransactions(statementId: string, transactions: BankTransaction[]): void {
    const statement = this.getStatement(statementId);
    for (const transaction of transactions) {
      if (transaction.statementId !== statementId) {
        throw new Error('Bank transaction does not belong to the statement.');
      }
      if (transaction.businessId !== statement.businessId) {
        throw new Error('Bank transaction does not belong to the statement business.');
      }
      if (transaction.financialAccountId !== statement.financialAccountId) {
        throw new Error('Bank transaction does not belong to the financial account.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
        throw new Error('Bank transaction date must be an ISO date.');
      }
      if (!new DecimalMoney(transaction.amount).isPositive()) {
        throw new Error('Bank transaction amount must be positive.');
      }
      this.bankTransactions.set(transaction.id, transaction);
    }
  }

  addBookTransactions(transactions: BookTransaction[]): void {
    for (const transaction of transactions) {
      this.engine.authorizeBusiness(transaction.businessId, this.engine.businessId);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
        throw new Error('Book transaction date must be an ISO date.');
      }
      if (new DecimalMoney(transaction.amount).compare(DecimalMoney.zero()) < 0) {
        throw new Error('Book transaction amount must be positive.');
      }
      this.bookTransactions.set(transaction.id, transaction);
    }
  }

  getBankTransactions(statementId: string): BankTransaction[] {
    const statement = this.getStatement(statementId);
    return [...this.bankTransactions.values()].filter((tx) => tx.statementId === statementId && tx.businessId === statement.businessId);
  }

  getBookTransactions(businessId: string): BookTransaction[] {
    this.engine.authorizeBusiness(businessId, this.engine.businessId);
    return [...this.bookTransactions.values()].filter((tx) => tx.businessId === businessId && tx.status === 'POSTED');
  }

  generateMatches(statementId: string): MatchCandidate[] {
    const bankTransactions = this.getBankTransactions(statementId);
    const statement = this.getStatement(statementId);
    const bookTransactions = this.getBookTransactions(statement.businessId);
    const matches: MatchCandidate[] = [];

    for (const bankTx of bankTransactions) {
      const candidate = this.findBestMatch(bankTx, bookTransactions);
      if (!candidate) {
        matches.push({
          id: `match-${bankTx.id}-unmatched`,
          bankTransactionId: bankTx.id,
          amount: bankTx.amount,
          direction: bankTx.direction,
          confidence: 0,
          reasons: ['No eligible book transaction'],
          matchType: 'AUTO',
          status: 'UNMATCHED',
        });
      } else {
        matches.push(candidate);
      }
    }

    return matches;
  }

  matchTransaction(sessionId: string, bankTransactionId: string, bookTransactionId: string, actor: string): ReconciliationMatch {
    const session = this.resolveSession(sessionId);
    if (session.status === 'LOCKED') throw new Error('Locked reconciliations cannot be modified.');
    const bankTx = this.bankTransactions.get(bankTransactionId);
    const bookTx = this.bookTransactions.get(bookTransactionId);

    if (!bankTx || !bookTx) throw new Error('Bank or book transaction not found.');
    if (bankTx.businessId !== session.businessId || bookTx.businessId !== session.businessId) {
      throw new Error('Cross-business reconciliation is not allowed.');
    }
    if (bankTx.financialAccountId !== session.financialAccountId || bookTx.financialAccountId !== session.financialAccountId) {
      throw new Error('Financial account mismatch.');
    }
    if (bookTx.status !== 'POSTED') throw new Error('Only posted book transactions are eligible.');
    if (!this.isDirectionCompatible(bankTx, bookTx)) throw new Error('Bank and book transaction directions do not match.');
    const assignedElsewhere = [...this.matches.values()].find((match) => match.sessionId === session.id && (match.bankTransactionId === bankTransactionId || match.bookTransactionIds.includes(bookTransactionId)));
    if (assignedElsewhere && !assignedElsewhere.bookTransactionIds.includes(bookTransactionId)) {
      throw new Error('Bank or book transaction is already matched in this session.');
    }
    if ([...this.matches.values()].some((match) => match.sessionId === session.id && match.bankTransactionId === bankTransactionId && match.bookTransactionIds.includes(bookTransactionId))) {
      return [...this.matches.values()].find((match) => match.sessionId === session.id && match.bankTransactionId === bankTransactionId && match.bookTransactionIds.includes(bookTransactionId))!;
    }

    const key = `match:${session.id}:${bankTransactionId}:${bookTransactionId}`;
    if (this.idempotency.has(key)) {
      const matchId = this.idempotency.get(key)!;
      return this.matches.get(matchId)!;
    }

    const match = this.buildMatch(bankTx, bookTx, session.id, actor, 'AUTO');
    this.matches.set(match.id, match);
    bankTx.status = match.status === 'MATCHED' ? 'MATCHED' : 'PARTIAL';
    this.idempotency.set(key, match.id);
    this.addAuditEvent(session.id, actor, 'MATCH_CREATED', 'MATCH', match.id, `Matched bank ${bankTx.id} with book ${bookTx.id}`);
    return match;
  }

  createMatchGroup(sessionId: string, bankIds: string[], bookIds: string[], actor: string): ReconciliationMatchGroup {
    const session = this.getSession(sessionId);
    if (session.status === 'LOCKED') throw new Error('Locked reconciliations cannot be modified.');
    const bankTxs = bankIds.map((id) => this.bankTransactions.get(id)).filter(Boolean) as BankTransaction[];
    const bookTxs = bookIds.map((id) => this.bookTransactions.get(id)).filter(Boolean) as BookTransaction[];

    if (bankTxs.length === 0 || bookTxs.length === 0) throw new Error('Match group requires at least one bank and one book transaction.');
    if (bankTxs.some((tx) => tx.businessId !== session.businessId || tx.financialAccountId !== session.financialAccountId)) throw new Error('Cross-business or cross-account match group is not allowed.');
    if (bookTxs.some((tx) => tx.businessId !== session.businessId || tx.financialAccountId !== session.financialAccountId)) throw new Error('Cross-business or cross-account match group is not allowed.');
    if (bankTxs.some((bankTx) => bookTxs.some((bookTx) => !this.isDirectionCompatible(bankTx, bookTx)))) throw new Error('Bank and book transaction directions do not match.');

    const sortedBankIds = [...bankIds].sort();
    const sortedBookIds = [...bookIds].sort();
    const duplicateGroup = [...this.groups.values()].find((group) => group.sessionId === session.id && [...group.bankTransactionIds].sort().join('|') === sortedBankIds.join('|') && [...group.bookTransactionIds].sort().join('|') === sortedBookIds.join('|'));
    if (duplicateGroup) {
      return duplicateGroup;
    }

    const overlap = [...this.groups.values()].find((group) => {
      if (group.sessionId !== session.id) return false;
      const groupBankSet = new Set(group.bankTransactionIds);
      const groupBookSet = new Set(group.bookTransactionIds);
      const bankOverlap = bankIds.some((id) => groupBankSet.has(id));
      const bookOverlap = bookIds.some((id) => groupBookSet.has(id));
      return bankOverlap || bookOverlap;
    });
    if (overlap) {
      throw new Error('Match group cannot reuse bank or book transactions already assigned to another group in this session.');
    }

    const bankTotal = bankTxs.reduce((sum, tx) => sum.add(new DecimalMoney(tx.amount)), DecimalMoney.zero());
    const bookTotal = bookTxs.reduce((sum, tx) => sum.add(new DecimalMoney(tx.amount)), DecimalMoney.zero());
    const difference = bankTotal.subtract(bookTotal);
    const group: ReconciliationMatchGroup = {
      id: `group-${sessionId}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      sessionId,
      businessId: session.businessId,
      bankTransactionIds: bankTxs.map((tx) => tx.id),
      bookTransactionIds: bookTxs.map((tx) => tx.id),
      totalAmount: bankTotal.toString(),
      difference: difference.toString(),
      status: difference.isZero() ? 'MATCHED' : 'PARTIAL',
      createdBy: actor,
      createdAt: new Date().toISOString(),
      resolutionState: difference.isZero() ? 'APPROVED' : 'PENDING',
    };

    this.groups.set(group.id, group);
    for (const transaction of bankTxs) transaction.status = group.status === 'MATCHED' ? 'MATCHED' : 'PARTIAL';
    this.addAuditEvent(session.id, actor, 'GROUP_CREATED', 'MATCH', group.id, `Match group created with ${bankTxs.length} bank and ${bookTxs.length} book transactions`);
    return group;
  }

  getMatchGroups(sessionId: string): ReconciliationMatchGroup[] {
    return [...this.groups.values()].filter((group) => group.sessionId === sessionId);
  }

  createManualMatch(sessionId: string, bankIds: string[], bookIds: string[], actor: string): ReconciliationMatch {
    const session = this.getSession(sessionId);
    if (session.status === 'LOCKED') throw new Error('Locked reconciliations cannot be modified.');
    const bankTxs = bankIds.map((id) => this.bankTransactions.get(id)).filter(Boolean) as BankTransaction[];
    const bookTxs = bookIds.map((id) => this.bookTransactions.get(id)).filter(Boolean) as BookTransaction[];

    if (bankTxs.length === 0 || bookTxs.length === 0) throw new Error('Manual match requires at least one bank and one book transaction.');
    if (bankTxs.some((tx) => tx.businessId !== session.businessId)) throw new Error('Cross-business manual match not allowed.');
    if (bookTxs.some((tx) => tx.businessId !== session.businessId)) throw new Error('Cross-business manual match not allowed.');
    if (bankTxs.some((bankTx) => bookTxs.some((bookTx) => !this.isDirectionCompatible(bankTx, bookTx)))) throw new Error('Bank and book transaction directions do not match.');

    const bankTotal = bankTxs.reduce((sum, tx) => sum.add(new DecimalMoney(tx.amount)), DecimalMoney.zero());
    const bookTotal = bookTxs.reduce((sum, tx) => sum.add(new DecimalMoney(tx.amount)), DecimalMoney.zero());
    const difference = bankTotal.subtract(bookTotal);
    if (!difference.isZero()) {
      return this.createPartialMatch(sessionId, bankIds, bookIds, actor, difference.abs().toString());
    }

    const matchId = `manual-${sessionId}-${bankTxs[0].id}-${bookTxs[0].id}`;
    const match: ReconciliationMatch = {
      id: matchId,
      sessionId,
      bankTransactionId: bankTxs[0].id,
      bookTransactionIds: bookTxs.map((tx) => tx.id),
      amount: bankTotal.toString(),
      direction: bankTxs[0].direction,
      confidence: 100,
      reasons: ['Manual match approved'],
      matchType: 'MANUAL',
      status: 'MATCHED',
      businessId: session.businessId,
      createdBy: actor,
      createdAt: new Date().toISOString(),
    };

    this.matches.set(match.id, match);
    for (const transaction of bankTxs) transaction.status = 'MATCHED';
    this.addAuditEvent(sessionId, actor, 'MANUAL_MATCH', 'MATCH', match.id, `Manual match created for ${bankTxs.length} bank and ${bookTxs.length} book transactions`);
    return match;
  }

  createPartialMatch(sessionId: string, bankIds: string[], bookIds: string[], actor: string, difference?: string): ReconciliationMatch {
    const session = this.getSession(sessionId);
    if (session.status === 'LOCKED') throw new Error('Locked reconciliations cannot be modified.');
    const bankTxs = bankIds.map((id) => this.bankTransactions.get(id)).filter(Boolean) as BankTransaction[];
    const bookTxs = bookIds.map((id) => this.bookTransactions.get(id)).filter(Boolean) as BookTransaction[];
    if (bankTxs.length === 0 || bookTxs.length === 0) throw new Error('Partial match requires at least one bank and one book transaction.');
    if (bankTxs.some((bankTx) => bookTxs.some((bookTx) => !this.isDirectionCompatible(bankTx, bookTx)))) throw new Error('Bank and book transaction directions do not match.');
    const bankTotal = bankTxs.reduce((sum, tx) => sum.add(new DecimalMoney(tx.amount)), DecimalMoney.zero());
    const bookTotal = bookTxs.reduce((sum, tx) => sum.add(new DecimalMoney(tx.amount)), DecimalMoney.zero());
    const diff = new DecimalMoney(difference ?? bankTotal.subtract(bookTotal).toString());

    const matchId = `partial-${sessionId}-${bankTxs[0]?.id ?? 'bank'}-${bookTxs[0]?.id ?? 'book'}`;
    const match: ReconciliationMatch = {
      id: matchId,
      sessionId,
      bankTransactionId: bankTxs[0]?.id ?? '',
      bookTransactionIds: bookTxs.map((tx) => tx.id),
      amount: bankTotal.toString(),
      direction: bankTxs[0]?.direction ?? 'DEBIT',
      confidence: 65,
      reasons: [`Partial match. Difference ${diff.toString()}`],
      matchType: 'PARTIAL',
      status: 'PARTIAL',
      businessId: session.businessId,
      createdBy: actor,
      createdAt: new Date().toISOString(),
      difference: diff.toString(),
      resolutionState: 'PENDING',
    };

    this.matches.set(match.id, match);
    for (const transaction of bankTxs) transaction.status = 'PARTIAL';
    this.addAuditEvent(sessionId, actor, 'PARTIAL_MATCH', 'MATCH', match.id, `Partial match created. Difference: ${diff.toString()}`);
    return match;
  }

  approvePartialMatch(sessionId: string, matchId: string, actor: string): ReconciliationMatch {
    const session = this.getSession(sessionId);
    const match = this.matches.get(matchId);
    if (!match) throw new Error('Partial match not found.');
    if (match.sessionId !== session.id) throw new Error('Partial match does not belong to this session.');
    const updated: ReconciliationMatch = {
      ...match,
      resolutionState: 'APPROVED',
      approvedBy: actor,
      approvedAt: new Date().toISOString(),
    };
    this.matches.set(matchId, updated);
    this.addAuditEvent(sessionId, actor, 'APPROVAL', 'MATCH', matchId, `Approved partial match ${matchId}`);
    return updated;
  }

  createBankCharge(sessionId: string, bankTransactionId: string, actor: string, accountId: string, amount: string): { transactionId: string; journalId?: string; status: string } {
    const session = this.getSession(sessionId);
    if (session.status === 'LOCKED') throw new Error('Locked reconciliations cannot be modified.');
    const bankTx = this.bankTransactions.get(bankTransactionId);
    if (!bankTx) throw new Error('Bank transaction not found.');
    if (bankTx.businessId !== session.businessId) throw new Error('Cross-business bank charge not allowed.');
    const result = this.createAdjustmentTransaction({
      businessId: session.businessId,
      financialAccountId: session.financialAccountId,
      date: bankTx.date,
      description: `Bank charge: ${bankTx.description}`,
      amount,
      accountId,
      direction: 'DEBIT',
      actor,
      source: `bank-charge-${bankTransactionId}`,
      sessionId,
    });
    this.addAuditEvent(sessionId, actor, 'BANK_CHARGE', 'ADJUSTMENT', result.transactionId, `Created bank charge adjustment for ${bankTx.id}`);
    return result;
  }

  createBankInterest(sessionId: string, bankTransactionId: string, actor: string, accountId: string, amount: string): { transactionId: string; journalId?: string; status: string } {
    const session = this.getSession(sessionId);
    if (session.status === 'LOCKED') throw new Error('Locked reconciliations cannot be modified.');
    const bankTx = this.bankTransactions.get(bankTransactionId);
    if (!bankTx) throw new Error('Bank transaction not found.');
    if (bankTx.businessId !== session.businessId) throw new Error('Cross-business bank interest not allowed.');
    const result = this.createAdjustmentTransaction({
      businessId: session.businessId,
      financialAccountId: session.financialAccountId,
      date: bankTx.date,
      description: `Bank interest: ${bankTx.description}`,
      amount,
      accountId,
      direction: 'CREDIT',
      actor,
      source: `bank-interest-${bankTransactionId}`,
      sessionId,
    });
    this.addAuditEvent(sessionId, actor, 'BANK_INTEREST', 'ADJUSTMENT', result.transactionId, `Created bank interest adjustment for ${bankTx.id}`);
    return result;
  }

  createMissingTransaction(sessionId: string, input: {
    bankTransactionId: string;
    actor: string;
    businessId: string;
    financialAccountId: string;
    accountId: string;
    type: 'MONEY_IN' | 'MONEY_OUT';
    date: string;
    amount: string;
    description: string;
  }): { transactionId: string; journalId?: string; status: string } {
    const session = this.getSession(sessionId);
    if (session.status === 'LOCKED') throw new Error('Locked reconciliations cannot be modified.');
    const bankTx = this.bankTransactions.get(input.bankTransactionId);
    if (!bankTx) throw new Error('Bank transaction not found.');
    if (session.businessId !== input.businessId) throw new Error('Business mismatch.');
    const key = `missing:${sessionId}:${input.bankTransactionId}:${input.type}:${input.amount}`;
    if (this.idempotency.has(key)) {
      const existingId = this.idempotency.get(key)!;
      const existing = this.transactionService.getTransaction(existingId);
      return { transactionId: existing.id, journalId: existing.journalId, status: existing.status };
    }

    const transaction = this.transactionService.createTransaction({
      businessId: input.businessId,
      type: input.type,
      date: input.date,
      description: input.description,
      amount: input.amount,
      financialAccountId: input.financialAccountId,
      accountId: input.accountId,
      referenceNo: `MISSING-${input.bankTransactionId}`,
      createdBy: input.actor,
      idempotencyKey: key,
    });
    const posted = this.transactionService.postTransaction(transaction.id, input.actor, key);
    this.idempotency.set(key, posted.id);
    this.addAuditEvent(sessionId, input.actor, 'MISSING_TRANSACTION', 'ADJUSTMENT', posted.id, `Created missing ${input.type} transaction for bank item ${input.bankTransactionId}`);
    return { transactionId: posted.id, journalId: posted.journalId, status: posted.status };
  }

  createAdjustmentTransaction(input: {
    businessId: string;
    financialAccountId: string;
    date: string;
    description: string;
    amount: string;
    accountId: string;
    direction: 'DEBIT' | 'CREDIT';
    actor: string;
    source?: string;
    sessionId?: string;
  }): { transactionId: string; status: string; journalId?: string } {
    this.engine.authorizeBusiness(input.businessId, this.engine.businessId);
    const amount = new DecimalMoney(input.amount).toString();
    const txType: 'MONEY_IN' | 'MONEY_OUT' = input.direction === 'CREDIT' ? 'MONEY_IN' : 'MONEY_OUT';
    const key = `adjustment:${input.businessId}:${input.source ?? input.description}:${amount}`;
    if (this.idempotency.has(key)) {
      const existingId = this.idempotency.get(key)!;
      const existing = this.transactionService.getTransaction(existingId);
      return { transactionId: existing.id, status: existing.status, journalId: existing.journalId };
    }

    const transaction = this.transactionService.createTransaction({
      businessId: input.businessId,
      type: txType,
      date: input.date,
      description: input.description,
      amount,
      financialAccountId: input.financialAccountId,
      accountId: input.accountId,
      referenceNo: input.source ?? `REC-${Date.now()}`,
      createdBy: input.actor,
      idempotencyKey: key,
    });

    const posted = this.transactionService.postTransaction(transaction.id, input.actor, key);
    this.idempotency.set(key, posted.id);
    if (input.sessionId) {
      this.addAuditEvent(input.sessionId, input.actor, 'ADJUSTMENT', 'ADJUSTMENT', posted.id, `Adjustment created: ${input.description}`);
    }
    return { transactionId: posted.id, status: posted.status, journalId: posted.journalId };
  }

  unmatchTransaction(sessionId: string, bankTransactionId: string, actor: string): void {
    const session = this.getSession(sessionId);
    if (session.status === 'LOCKED') throw new Error('Locked reconciliations cannot be modified.');
    const existing = [...this.matches.values()].find((match) => match.sessionId === sessionId && match.bankTransactionId === bankTransactionId);
    if (!existing) return;
    this.matches.delete(existing.id);
    this.addAuditEvent(sessionId, actor, 'MATCH_REMOVED', 'MATCH', existing.id, `Removed match for bank transaction ${bankTransactionId}`);
  }

  completeReconciliation(sessionId: string, actor: string): { status: ReconciliationStatus; summary: ReconciliationSummary } {
    const session = this.resolveSession(sessionId);
    if (session.status === 'LOCKED') throw new Error('Locked reconciliation cannot be completed again.');
    const summary = this.calculateSummary(session.statementId);
    const unresolved = this.getUnmatchedBankTransactions(session.statementId).length > 0 || this.getUnmatchedBookTransactionsForSession(session).length > 0;
    const partialPending = this.getPartialMatches(session.statementId).some((match) => match.resolutionState !== 'APPROVED');

    if (unresolved || partialPending) {
      throw new Error('Reconciliation cannot be completed while mandatory exceptions remain.');
    }

    const key = `complete:${session.id}`;
    if (this.idempotency.has(key)) {
      const existing = this.sessions.get(this.idempotency.get(key) ?? '') ?? session;
      return { status: existing.status, summary: existing.summary };
    }

    const statement = this.getStatement(session.statementId);
    statement.status = 'COMPLETED';
    statement.completedBy = actor;
    statement.completedAt = new Date().toISOString();
    session.status = 'COMPLETED';
    session.completedBy = actor;
    session.completedAt = new Date().toISOString();
    session.summary = summary;
    this.idempotency.set(key, session.id);
    this.addAuditEvent(session.id, actor, 'COMPLETION', 'SESSION', session.id, `Reconciliation completed with difference ${summary.difference}`);
    return { status: 'COMPLETED', summary };
  }

  lockReconciliation(sessionId: string, actor: string): ReconciliationSession {
    const session = this.getSession(sessionId);
    if (session.status !== 'COMPLETED') throw new Error('Only completed reconciliations can be locked.');
    const key = `lock:${sessionId}`;
    if (this.idempotency.has(key)) {
      return this.sessions.get(this.idempotency.get(key) ?? '') ?? session;
    }

    const statement = this.getStatement(session.statementId);
    statement.status = 'LOCKED';
    statement.lockedBy = actor;
    statement.lockedAt = new Date().toISOString();
    session.status = 'LOCKED';
    session.lockedBy = actor;
    session.lockedAt = new Date().toISOString();
    this.idempotency.set(key, session.id);
    this.addAuditEvent(sessionId, actor, 'LOCK', 'SESSION', session.id, 'Reconciliation locked and history preserved');
    return session;
  }

  getUnmatchedBankTransactions(statementId: string): BankTransaction[] {
    const bankTransactions = this.getBankTransactions(statementId);
    return bankTransactions.filter((tx) => ![...this.matches.values()].some((match) => match.sessionId === this.getSessionByStatement(statementId)?.id && match.bankTransactionId === tx.id));
  }

  getUnmatchedBookTransactions(businessId: string): BookTransaction[] {
    const sessionBooks = [...this.sessions.values()]
      .filter((session) => session.businessId === businessId)
      .flatMap((session) => this.getBookTransactionsForStatement(this.getStatement(session.statementId)));
    return sessionBooks.filter((tx, index, all) => all.findIndex((candidate) => candidate.id === tx.id) === index && ![...this.matches.values()].some((match) => match.businessId === businessId && match.bookTransactionIds.includes(tx.id)));
  }

  createCorrection(sessionId: string, actor: string, reason: string, target: { entityType: 'MATCH' | 'BANK_TRANSACTION' | 'BOOK_TRANSACTION' | 'SESSION'; entityId: string }): { sessionId: string; action: ReconciliationAction; reason: string } {
    const session = this.getSession(sessionId);
    if (session.status === 'LOCKED') {
      this.addAuditEvent(sessionId, actor, 'CORRECTION', target.entityType, target.entityId, `Correction after lock: ${reason}`);
      return { sessionId, action: 'CORRECTION', reason };
    }
    this.addAuditEvent(sessionId, actor, 'CORRECTION', target.entityType, target.entityId, reason);
    return { sessionId, action: 'CORRECTION', reason };
  }

  calculateSummary(statementId: string): ReconciliationSummary {
    const statement = this.getStatement(statementId);
    const session = this.getSessionByStatement(statementId);
    const bankTransactions = this.getBankTransactions(statementId);
    const bookTransactions = this.getBookTransactionsForStatement(statement);

    const bankTotal = bankTransactions.reduce((sum, tx) => {
      const value = tx.direction === 'DEBIT' ? new DecimalMoney(`-${tx.amount}`) : new DecimalMoney(tx.amount);
      return sum.add(value);
    }, DecimalMoney.zero());

    const bookTotal = bookTransactions.reduce((sum, tx) => sum.add(new DecimalMoney(tx.amount)), DecimalMoney.zero());
    const difference = bankTotal.subtract(bookTotal);
    const summary: ReconciliationSummary = {
      bankTotal: bankTotal.toString(),
      bookTotal: bookTotal.toString(),
      difference: difference.toString(),
      matched: this.getMatchedBankTransactions(statementId).length,
      unmatchedBank: this.getUnmatchedBankTransactions(statementId).length,
      unmatchedBook: this.getUnmatchedBookTransactions(statement.businessId).length,
      partial: this.getPartialMatches(statementId).length,
      status: session?.status ?? statement.status,
    };
    return summary;
  }

  getMatchedBankTransactions(statementId: string): BankTransaction[] {
    const statement = this.getStatement(statementId);
    return this.getBankTransactions(statementId).filter((tx) => {
      const session = this.getSessionByStatement(statementId);
      return !!session && [...this.matches.values()].some((match) => match.sessionId === session.id && match.bankTransactionId === tx.id && match.status === 'MATCHED');
    });
  }

  getPartialMatches(statementId: string): ReconciliationMatch[] {
    const session = this.getSessionByStatement(statementId);
    if (!session) return [];
    return [...this.matches.values()].filter((match) => match.sessionId === session.id && match.status === 'PARTIAL');
  }

  getAuditTrail(sessionId: string): ReconciliationAuditEvent[] {
    return this.getSession(sessionId).auditTrail;
  }

  private getSessionByStatement(statementId: string): ReconciliationSession | undefined {
    return [...this.sessions.values()].find((session) => session.statementId === statementId);
  }

  private getBookTransactionsForStatement(statement: FinancialStatement): BookTransaction[] {
    return this.getBookTransactions(statement.businessId).filter((transaction) => transaction.financialAccountId === statement.financialAccountId && transaction.date >= statement.startDate && transaction.date <= statement.endDate);
  }

  private getUnmatchedBookTransactionsForSession(session: ReconciliationSession): BookTransaction[] {
    const statement = this.getStatement(session.statementId);
    return this.getBookTransactionsForStatement(statement).filter((tx) => ![...this.matches.values()].some((match) => match.sessionId === session.id && match.bookTransactionIds.includes(tx.id)));
  }

  private resolveSession(sessionOrStatementId: string): ReconciliationSession {
    const directSession = this.sessions.get(sessionOrStatementId);
    if (directSession) return directSession;

    const statement = this.statements.get(sessionOrStatementId);
    if (statement) {
      const session = this.getSessionByStatement(statement.id);
      if (session) return session;
    }

    throw new Error('Reconciliation session not found.');
  }

  private addAuditEvent(sessionId: string, actor: string, action: ReconciliationAction, entityType: ReconciliationAuditEvent['entityType'], entityId: string, details?: string): void {
    const session = this.getSession(sessionId);
    const audit: ReconciliationAuditEvent = {
      id: `audit-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      businessId: session.businessId,
      actor,
      action,
      entityType,
      entityId,
      timestamp: new Date().toISOString(),
      details,
    };
    session.auditTrail = [...(session.auditTrail ?? []), audit];
    const statement = this.statements.get(session.statementId);
    if (statement) {
      statement.history = [...(statement.history ?? []), audit];
    }
  }

  private findBestMatch(bankTx: BankTransaction, bookTransactions: BookTransaction[]): MatchCandidate | null {
    const eligible = bookTransactions.filter((bookTx) => {
      if (bookTx.businessId !== bankTx.businessId) return false;
      if (bookTx.financialAccountId !== bankTx.financialAccountId) return false;
      if (bookTx.status !== 'POSTED') return false;
      const amountDelta = Math.abs(Number(bookTx.amount) - Number(bankTx.amount));
      if (amountDelta > 0.01) return false;
      const bankDate = new Date(bankTx.date).getTime();
      const bookDate = new Date(bookTx.date).getTime();
      if (Math.abs(bankDate - bookDate) / 86400000 > this.dateToleranceDays) return false;
      return this.isDirectionCompatible(bankTx, bookTx);
    });

    if (!eligible.length) return null;
    const ranked = eligible
      .map((bookTx) => ({ bookTx, candidate: this.buildMatchCandidate(bankTx, bookTx) }))
      .sort((left, right) => right.candidate.confidence - left.candidate.confidence || left.bookTx.id.localeCompare(right.bookTx.id));
    if (ranked.length > 1 && ranked[0].candidate.confidence === ranked[1].candidate.confidence) return null;
    const best = ranked[0].bookTx;
    return this.buildMatchCandidate(bankTx, best);
  }

  private isDirectionCompatible(bankTx: BankTransaction, bookTx: BookTransaction): boolean {
    return (bankTx.direction === 'CREDIT' && bookTx.type === 'MONEY_IN') || (bankTx.direction === 'DEBIT' && bookTx.type === 'MONEY_OUT');
  }

  private buildMatch(bankTx: BankTransaction, bookTx: BookTransaction, sessionId: string, actor: string, matchType: MatchType): ReconciliationMatch {
    const candidate = this.buildMatchCandidate(bankTx, bookTx, matchType);
    const match: ReconciliationMatch = {
      id: `${candidate.id}-${sessionId}`,
      sessionId,
      bankTransactionId: bankTx.id,
      bookTransactionIds: [bookTx.id],
      amount: bankTx.amount,
      direction: bankTx.direction,
      confidence: candidate.confidence,
      reasons: candidate.reasons,
      matchType: candidate.matchType,
      status: candidate.status,
      businessId: bankTx.businessId,
      createdBy: actor,
      createdAt: new Date().toISOString(),
    };
    return match;
  }

  private buildMatchCandidate(bankTx: BankTransaction, bookTx: BookTransaction, matchType: MatchType = 'AUTO'): MatchCandidate {
    const amountMatch = new DecimalMoney(bankTx.amount).compare(new DecimalMoney(bookTx.amount)) === 0;
    const sameDate = bankTx.date === bookTx.date;
    const referenceMatch = !!bookTx.referenceNo && bankTx.reference.toLowerCase().includes(bookTx.referenceNo.toLowerCase());
    const descriptionMatch = this.similarity(bankTx.normalizedDescription, this.normalizeDescription(bookTx.description)) >= 0.5;
    const dateTolerance = Math.abs(new Date(bankTx.date).getTime() - new Date(bookTx.date).getTime()) / 86400000 <= this.dateToleranceDays;
    const directionValid = this.isDirectionCompatible(bankTx, bookTx);

    const reasons: string[] = [];
    if (amountMatch) reasons.push('Amount matched');
    if (sameDate) reasons.push('Date matched');
    if (referenceMatch) reasons.push('Reference matched');
    if (descriptionMatch) reasons.push('Description normalized');
    if (dateTolerance) reasons.push('Date within tolerance');
    if (directionValid) reasons.push('Direction valid');

    const confidence = this.scoreConfidence({
      amountMatch,
      sameDate,
      referenceMatch,
      descriptionMatch,
      dateTolerance,
      directionValid,
    });

    return {
      id: `match-${bankTx.id}-${bookTx.id}`,
      bankTransactionId: bankTx.id,
      bookTransactionId: bookTx.id,
      amount: bankTx.amount,
      direction: bankTx.direction,
      confidence,
      reasons,
      matchType,
      status: confidence >= 85 ? 'MATCHED' : 'PARTIAL',
    };
  }

  private scoreConfidence(input: {
    amountMatch: boolean;
    sameDate: boolean;
    referenceMatch: boolean;
    descriptionMatch: boolean;
    dateTolerance: boolean;
    directionValid: boolean;
  }): number {
    let total = 0;
    total += input.amountMatch ? 45 : 0;
    total += input.sameDate ? 20 : 0;
    total += input.referenceMatch ? 15 : 0;
    total += input.descriptionMatch ? 10 : 0;
    total += input.dateTolerance ? 10 : 0;
    total += input.directionValid ? 10 : 0;
    return Math.min(100, total);
  }

  private similarity(a: string, b: string): number {
    const first = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    const second = b.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!first || !second) return 0;
    const maxLen = Math.max(first.length, second.length);
    const shared = [...new Set(first.split(''))].filter((char) => second.includes(char)).length;
    return shared / Math.max(1, maxLen);
  }

  private normalizeDescription(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }
}
