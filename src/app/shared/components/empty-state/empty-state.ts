import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'dlr-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state-root">
      @if (icon()) {
        <div class="empty-icon-box" aria-hidden="true">{{ icon() }}</div>
      }
      <h3 class="empty-title">{{ title() }}</h3>
      @if (message()) {
        <p class="empty-message">{{ message() }}</p>
      }
      @if (actionLabel()) {
        <button
          type="button"
          class="empty-action-btn"
          (click)="action.emit()"
        >
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }
    .empty-state-root {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 44px 20px;
      text-align: center;
      color: var(--color-text-secondary);
    }
    .empty-icon-box {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      margin-bottom: 12px;
      border-radius: var(--radius-lg);
      background: var(--color-surface-subtle);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      font-size: 20px;
      line-height: 1;
    }
    .empty-title {
      margin: 0;
      font-size: var(--text-md);
      font-weight: 700;
      letter-spacing: -0.2px;
      color: var(--color-text-main);
    }
    .empty-message {
      margin: 6px 0 0;
      max-width: 420px;
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      line-height: 1.55;
    }
    .empty-action-btn {
      margin-top: 16px;
      padding: 8px 16px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-money-green);
      font-size: var(--text-sm);
      font-weight: 700;
      cursor: pointer;
      transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
    }
    .empty-action-btn:hover {
      background: var(--color-money-green-light);
      border-color: var(--color-money-green-border);
      color: var(--color-money-green-dark);
    }
  `]
})
export class EmptyState {
  readonly icon = input<string>('◇');
  readonly title = input<string>('No items found');
  readonly message = input<string>('');
  readonly actionLabel = input<string>('');
  readonly action = output<void>();
}
