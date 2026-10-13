import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'dlr-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="dlr-card"
      [class.p-none]="padding() === 'none'"
      [class.p-sm]="padding() === 'sm'"
      [class.p-md]="padding() === 'md'"
      [class.p-lg]="padding() === 'lg'"
    >
      <ng-content />
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .dlr-card {
      background: var(--color-surface);
      color: var(--color-text-main);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-sm);
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }
    .p-none { padding: 0; }
    .p-sm { padding: 12px 14px; }
    .p-md { padding: 18px 20px; }
    .p-lg { padding: 24px 28px; }
  `]
})
export class Card {
  readonly padding = input<'none' | 'sm' | 'md' | 'lg'>('md');
}
