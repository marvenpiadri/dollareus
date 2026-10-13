import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface FilterTabOption {
  id: string;
  label: string;
  count?: number;
}

@Component({
  selector: 'dlr-filter-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="filter-tabs-bar" role="tablist" aria-label="Filters">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          class="tab-btn"
          [class.active]="tab.id === activeId()"
          [attr.aria-selected]="tab.id === activeId()"
          (click)="selected.emit(tab.id)"
        >
          <span>{{ tab.label }}</span>
          @if (tab.count !== undefined) {
            <span class="tab-count">{{ tab.count }}</span>
          }
        </button>
      }
    </nav>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }
    .filter-tabs-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 16px;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .filter-tabs-bar::-webkit-scrollbar {
      display: none;
    }
    .tab-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 42px;
      padding: 0 12px;
      border: 0;
      background: transparent;
      color: var(--color-text-secondary);
      font-size: var(--text-sm);
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      transition: color var(--transition-fast);
    }
    .tab-btn:hover {
      color: var(--color-text-main);
    }
    .tab-btn.active {
      color: var(--color-money-green);
      font-weight: 750;
    }
    .tab-btn.active::after {
      content: '';
      position: absolute;
      left: 6px;
      right: 6px;
      bottom: -1px;
      height: 2px;
      background: var(--color-money-green);
      border-radius: var(--radius-full);
    }
    .tab-count {
      display: inline-block;
      padding: 1px 6px;
      border-radius: var(--radius-full);
      background: var(--color-surface-subtle);
      color: var(--color-text-secondary);
      font-size: 11px;
      font-weight: 700;
      line-height: 1.3;
    }
    .tab-btn.active .tab-count {
      background: var(--color-money-green-medium);
      color: var(--color-money-green-dark);
    }
  `]
})
export class FilterTabs {
  readonly tabs = input.required<FilterTabOption[]>();
  readonly activeId = input.required<string>();
  readonly selected = output<string>();
}
