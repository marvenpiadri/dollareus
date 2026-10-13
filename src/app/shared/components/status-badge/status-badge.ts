import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'dlr-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="status-indicator" [class]="tone()">
      <span class="status-dot" aria-hidden="true"></span>
      <span class="status-text">{{ displayLabel() }}</span>
    </span>
  `,
  styles: [`
    :host {
      display: inline-flex;
      vertical-align: middle;
    }
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      border-radius: var(--radius-full);
      font-size: 11.5px;
      font-weight: 600;
      letter-spacing: -0.1px;
      line-height: 1.3;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* Success / Positive tone */
    .tone-success {
      background: var(--color-status-paid-bg);
      color: var(--color-status-paid);
      border-color: var(--color-status-paid-border);
    }
    .tone-success .status-dot {
      background: var(--color-status-paid);
    }

    /* Info / Processing tone */
    .tone-info {
      background: var(--color-status-sent-bg);
      color: var(--color-status-sent);
      border-color: var(--color-status-sent-border);
    }
    .tone-info .status-dot {
      background: var(--color-status-sent);
    }

    /* Warning / Pending tone */
    .tone-warning {
      background: rgba(217, 119, 6, 0.12);
      color: #b45309;
      border-color: rgba(217, 119, 6, 0.25);
    }
    .tone-warning .status-dot {
      background: #d97706;
    }

    /* Danger / Overdue tone */
    .tone-danger {
      background: var(--color-status-overdue-bg);
      color: var(--color-status-overdue);
      border-color: var(--color-status-overdue-border);
    }
    .tone-danger .status-dot {
      background: var(--color-status-overdue);
    }

    /* Neutral / Draft tone */
    .tone-neutral {
      background: var(--color-status-draft-bg);
      color: var(--color-status-draft);
      border-color: var(--color-status-draft-border);
    }
    .tone-neutral .status-dot {
      background: var(--color-status-draft);
    }
  `]
})
export class StatusBadge {
  readonly status = input.required<string>();
  readonly label = input<string>('');

  protected readonly tone = computed(() => {
    const s = (this.status() || '').toLowerCase();
    if (['paid', 'active', 'succeeded', 'completed', 'delivered', 'open'].includes(s)) {
      return 'tone-success';
    }
    if (['processing', 'preparing', 'shipped', 'out_for_delivery', 'sent', 'confirmed'].includes(s)) {
      return 'tone-info';
    }
    if (['pending', 'ready', 'partially_paid', 'partially_refunded'].includes(s)) {
      return 'tone-warning';
    }
    if (['failed', 'cancelled', 'overdue', 'delivery_failed', 'returned', 'void'].includes(s)) {
      return 'tone-danger';
    }
    return 'tone-neutral';
  });

  protected readonly displayLabel = computed(() => {
    if (this.label()) return this.label();
    const s = this.status() || '';
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  });
}
