import { render, screen } from '@testing-library/react';
import { StatCard } from '../StatCard';

describe('StatCard', () => {
  it('shows its label, value and hint', () => {
    render(<StatCard label="Revenue / min" value="$12,400" hint="$1.2M all time" accent="revenue" />);

    expect(screen.getByText('Revenue / min')).toBeInTheDocument();
    expect(screen.getByText('$12,400')).toBeInTheDocument();
    expect(screen.getByText('$1.2M all time')).toBeInTheDocument();
  });

  it('flags the card when the metric is breaching a threshold', () => {
    render(<StatCard label="Revenue / min" value="$40,000" accent="revenue" alerting />);

    expect(screen.getByText('Alert')).toBeInTheDocument();
    expect(screen.getByTestId('stat-revenue').className).toContain('border-metric-danger/70');
  });

  it('stays quiet when the metric is in band', () => {
    render(<StatCard label="Revenue / min" value="$9,000" accent="revenue" />);

    expect(screen.queryByText('Alert')).not.toBeInTheDocument();
  });
});
