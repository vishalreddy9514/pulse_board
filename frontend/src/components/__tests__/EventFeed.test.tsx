import { render, screen, within } from '@testing-library/react';
import { EventFeed } from '../EventFeed';
import type { PulseEvent } from '../../types';

function event(overrides: Partial<PulseEvent> = {}): PulseEvent {
  return {
    id: crypto.randomUUID(),
    type: 'order',
    amount: 249.99,
    userId: 'user_0042',
    region: 'eu-west',
    product: 'Team Plan',
    occurredAt: '2026-09-21T12:34:56.000Z',
    ...overrides,
  };
}

describe('EventFeed', () => {
  it('tells the user it is waiting when no events have arrived', () => {
    render(<EventFeed events={[]} />);

    expect(screen.getByText(/waiting for events/i)).toBeInTheDocument();
  });

  it('renders an order with its product and amount', () => {
    render(<EventFeed events={[event()]} />);

    const row = screen.getByTestId('feed-row');
    expect(within(row).getByText('ORDER')).toBeInTheDocument();
    expect(within(row).getByText(/Team Plan/)).toBeInTheDocument();
    expect(within(row).getByText('$249.99')).toBeInTheDocument();
    expect(within(row).getByText('eu-west')).toBeInTheDocument();
  });

  it('shows a refund as a negative amount', () => {
    render(<EventFeed events={[event({ type: 'refund', amount: -99 })]} />);

    const row = screen.getByTestId('feed-row');
    expect(within(row).getByText('REFUND')).toBeInTheDocument();
    expect(within(row).getByText('-$99.00')).toBeInTheDocument();
  });

  it('shows a dash rather than $0.00 for events with no revenue', () => {
    render(<EventFeed events={[event({ type: 'page_view', amount: 0, product: null })]} />);

    const row = screen.getByTestId('feed-row');
    expect(within(row).getByText('VIEW')).toBeInTheDocument();
    expect(within(row).getByText('—')).toBeInTheDocument();
    // With no product, the row identifies the user instead.
    expect(within(row).getByText(/user_0042/)).toBeInTheDocument();
  });

  it('keeps events in the order given, newest first', () => {
    render(
      <EventFeed
        events={[
          event({ product: 'Newest Plan' }),
          event({ product: 'Middle Plan' }),
          event({ product: 'Oldest Plan' }),
        ]}
      />,
    );

    const rows = screen.getAllByTestId('feed-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Newest Plan');
    expect(rows[2]).toHaveTextContent('Oldest Plan');
  });

  it('animates only the newest row so the feed stays readable', () => {
    render(<EventFeed events={[event(), event(), event()]} />);

    const rows = screen.getAllByTestId('feed-row');
    expect(rows[0].className).toContain('animate-flash-in');
    expect(rows[1].className).not.toContain('animate-flash-in');
  });
});
