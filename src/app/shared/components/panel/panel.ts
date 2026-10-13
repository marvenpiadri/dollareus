import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'dlr-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel-root">
      @if (title() || subtitle()) {
        <header class="panel-header">
          <div class="panel-titles">
            @if (title()) {
              <h2 class="panel-title">{{ title() }}</h2>
            }
            @if (subtitle()) {
              <p class="panel-subtitle">{{ subtitle() }}</p>
            }
          </div>
          <div class="panel-actions-slot">
            <ng-content select="[panel-actions]" />
          </div>
        </header>
      }

      <div class="panel-body">
        <ng-content />
      </div>

      @if (footerText()) {
        <footer class="panel-footer">
          <span>{{ footerText() }}</span>
          <ng-content select="[panel-footer]" />
        </footer>
      }
    </section>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 0;
    }
    .panel-root {
      background: var(--color-surface);
      color: var(--color-text-main);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px 16px;
      border-bottom: 1px solid var(--color-border);
    }
    .panel-titles {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .panel-title {
      margin: 0;
      font-size: var(--text-md);
      font-weight: 750;
      letter-spacing: -0.3px;
      color: var(--color-text-main);
      line-height: 1.25;
    }
    .panel-subtitle {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      line-height: 1.45;
    }
    .panel-actions-slot {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .panel-body {
      position: relative;
    }
    .panel-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 20px;
      border-top: 1px solid var(--color-border);
      background: var(--color-surface-subtle);
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }
  `]
})
export class Panel {
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly footerText = input<string>('');
}
