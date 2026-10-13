import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'dlr-metric-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="metric-card" [class]="'accent-' + accent()">
      <div class="metric-header">
        <span class="metric-label">{{ label() }}</span>
        @if (icon()) {
          <span class="metric-icon" [attr.aria-hidden]="true">{{ icon() }}</span>
        }
      </div>

      <div class="metric-body">
        <strong class="metric-value">
          {{ value() }}
          @if (hint()) {
            <small class="metric-hint">{{ hint() }}</small>
          }
        </strong>
      </div>

      <footer class="metric-footer">
        <span class="metric-subtext">{{ subtext() }}</span>
        @if (actionLabel()) {
          <button
            type="button"
            class="metric-action-btn"
            (click)="action.emit()"
          >
            {{ actionLabel() }}
          </button>
        }
      </footer>
    </article>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
    }
    .metric-card {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 16px 18px 14px;
      background: var(--color-surface);
      color: var(--color-text-main);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-sm);
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }
    .metric-card:hover {
      border-color: var(--color-border-dark);
      box-shadow: var(--shadow-md);
    }
    .metric-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .metric-label {
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--color-text-secondary);
      letter-spacing: -0.1px;
    }
    .metric-icon {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-md);
      font-size: 15px;
      line-height: 1;
    }
    .accent-green .metric-icon {
      background: var(--color-money-green-light);
      color: var(--color-money-green);
    }
    .accent-blue .metric-icon {
      background: var(--color-status-sent-bg);
      color: var(--color-status-sent);
    }
    .accent-purple .metric-icon {
      background: rgba(147, 51, 234, 0.12);
      color: #9333ea;
    }
    .accent-amber .metric-icon {
      background: rgba(217, 119, 6, 0.12);
      color: #d97706;
    }
    .accent-slate .metric-icon {
      background: var(--color-surface-subtle);
      color: var(--color-text-secondary);
    }
    .metric-body {
      margin: 12px 0 10px;
    }
    .metric-value {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: 26px;
      font-weight: 750;
      line-height: 1.1;
      letter-spacing: -0.8px;
      color: var(--color-text-main);
    }
    .metric-hint {
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--color-text-secondary);
      letter-spacing: 0;
    }
    .metric-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: auto;
      padding-top: 10px;
      border-top: 1px solid var(--color-border);
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
      min-height: 28px;
    }
    .metric-subtext {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .metric-action-btn {
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--color-money-green);
      font-size: var(--text-xs);
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
      transition: color var(--transition-fast);
    }
    .metric-action-btn:hover {
      color: var(--color-money-green-dark);
      text-decoration: underline;
    }
  `]
})
export class MetricCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly subtext = input<string>('');
  readonly hint = input<string>('');
  readonly icon = input<string>('');
  readonly accent = input<'green' | 'blue' | 'purple' | 'amber' | 'slate'>('green');
  readonly actionLabel = input<string>('');
  readonly action = output<void>();
}
