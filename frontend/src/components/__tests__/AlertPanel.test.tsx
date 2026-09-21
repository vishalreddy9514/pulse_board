import { render, screen } from '@testing-library/react';
import { AlertPanel } from '../AlertPanel';
import type { MetricAlert } from '../../types';

function alert(overrides: Partial<MetricAlert> = {}): MetricAlert {
  return {
    id: crypto.randomUUID(),
    metric: 'revenue',
    direction: 'above',
    severity: 'warning',
    message: 'Revenue spike: $24,000 in the last minute',
    value: 24_000,
    threshold: 20_000,
    raisedAt: '2026-09-21T12:00:00.000Z',
    ...overrides,
  };
}

describe('AlertPanel', () => {
  it('reads all clear when nothing is breached', () => {
    render(<AlertPanel active={[]} history={[]} />);

    expect(screen.getByText(/all clear/i)).toBeInTheDocument();
    expect(screen.queryByTestId('active-alert')).not.toBeInTheDocument();
  });

  it('shows a firing alert with its value and threshold', () => {
    render(<AlertPanel active={[alert()]} history={[]} />);

    expect(screen.getByText('1 firing')).toBeInTheDocument();
    const firing = screen.getByTestId('active-alert');
    expect(firing).toHaveTextContent('Revenue spike');
    expect(firing).toHaveTextContent('24,000 vs threshold 20,000');
  });

  it('counts every firing alert', () => {
    render(
      <AlertPanel
        active={[alert(), alert({ metric: 'orders', message: 'Order surge: 61 orders/min' })]}
        history={[]}
      />,
    );

    expect(screen.getByText('2 firing')).toBeInTheDocument();
    expect(screen.getAllByTestId('active-alert')).toHaveLength(2);
  });

  it('keeps a cleared alert in the history list', () => {
    const past = alert({ metric: 'orders', direction: 'above', message: 'Order surge: 61 orders/min' });

    render(<AlertPanel active={[]} history={[past]} />);

    expect(screen.getByTestId('past-alert')).toHaveTextContent('Order surge');
    expect(screen.getByText(/cleared/)).toBeInTheDocument();
  });

  it('does not list an alert as both firing and cleared', () => {
    const firing = alert();
    const sameConditionEarlier = alert({ id: 'earlier' });

    render(<AlertPanel active={[firing]} history={[sameConditionEarlier]} />);

    expect(screen.getAllByTestId('active-alert')).toHaveLength(1);
    expect(screen.queryByTestId('past-alert')).not.toBeInTheDocument();
  });
});
