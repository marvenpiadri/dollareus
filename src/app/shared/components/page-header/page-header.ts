import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'dlr-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header-root">
      <div class="header-titles">
        @if (eyebrow()) {
          <span class="header-eyebrow">{{ eyebrow() }}</span>
        }
        <h1 class="header-main-title">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="header-subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="header-actions-slot">
        <ng-content select="[header-actions]" />
      </div>
    </header>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      margin-bottom: 24px;
    }
    .page-header-root {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 20px;
    }
    .header-titles {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 0;
    }
    .header-eyebrow {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: var(--color-money-green);
    }
    .header-main-title {
      margin: 0;
      font-size: clamp(22px, 3vw, 28px);
      font-weight: 800;
      letter-spacing: -0.7px;
      line-height: 1.2;
      color: var(--color-text-main);
    }
    .header-subtitle {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      line-height: 1.5;
    }
    .header-actions-slot {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    @media (max-width: 640px) {
      .page-header-root {
        flex-direction: column;
        align-items: flex-start;
        gap: 14px;
      }
      .header-actions-slot {
        width: 100%;
      }
    }
  `]
})
export class PageHeader {
  readonly eyebrow = input<string>('');
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
