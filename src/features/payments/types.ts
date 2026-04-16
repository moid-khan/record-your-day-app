export type Transaction = {
  id: string;
  title: string;
  subtitle: string;
  amount: number;
  direction: 'credit' | 'debit';
};
