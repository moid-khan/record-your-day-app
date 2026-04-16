import { Transaction } from '../types';

export const mockTransactions: Transaction[] = [
  {
    id: '1',
    title: 'Clean up the kitchen',
    subtitle: 'Today, 10:30 AM',
    amount: 12,
    direction: 'credit',
  },
  {
    id: '2',
    title: 'Deliver groceries',
    subtitle: 'Yesterday, 6:20 PM',
    amount: 28.5,
    direction: 'credit',
  },
  {
    id: '3',
    title: 'Platform fee',
    subtitle: 'Yesterday, 6:10 PM',
    amount: -3.5,
    direction: 'debit',
  },
];
