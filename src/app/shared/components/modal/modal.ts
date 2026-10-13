import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';

@Component({
  selector: 'dlr-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div
        class="modal-backdrop"
        role="presentation"
        (click)="onBackdropClick()"
      >
        <section
          class="modal-card"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="title() ? 'modal-title' : null"
          [style.max-width]="maxWidth()"
          (click)="$event.stopPropagation()"
        >
          <header class="modal-header">
            <div class="modal-heading-text">
              @if (eyebrow()) {
                <span class="modal-eyebrow">{{ eyebrow() }}</span>
              }
              @if (title()) {
                <h2 id="modal-title" class="modal-title">{{ title() }}</h2>
              }
              @if (subtitle()) {
                <p class="modal-subtitle">{{ subtitle() }}</p>
              }
            </div>
            <button
              type="button"
              class="modal-close-btn"
              aria-label="Close dialog"
              (click)="close()"
            >
              ×
            </button>
          </header>

          <div class="modal-body">
            <ng-content />
          </div>

          <div class="modal-actions-slot">
            <ng-content select="[modal-actions]" />
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal);
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(3, 8, 18, 0.65);
      backdrop-filter: blur(4px);
      animation: modal-fade-in 0.15s ease-out;
    }
    .modal-card {
      width: 100%;
      max-height: min(90dvh, 800px);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 24px 28px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      background: var(--color-surface-modal);
      color: var(--color-text-main);
      box-shadow: var(--shadow-modal);
      display: flex;
      flex-direction: column;
      animation: modal-slide-in 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .modal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
    }
    .modal-heading-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .modal-eyebrow {
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 1.1px;
      text-transform: uppercase;
      color: var(--color-money-green);
    }
    .modal-title {
      margin: 0;
      font-size: 22px;
      font-weight: 750;
      letter-spacing: -0.5px;
      color: var(--color-text-main);
      line-height: 1.25;
    }
    .modal-subtitle {
      margin: 4px 0 0;
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      line-height: 1.5;
    }
    .modal-close-btn {
      display: grid;
      place-items: center;
      flex: 0 0 32px;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      transition: background var(--transition-fast), color var(--transition-fast);
    }
    .modal-close-btn:hover {
      background: var(--color-surface-hover);
      color: var(--color-text-main);
    }
    .modal-body {
      min-width: 0;
    }
    .modal-actions-slot {
      margin-top: 20px;
    }
    @keyframes modal-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes modal-slide-in {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (max-width: 600px) {
      .modal-card {
        padding: 20px;
      }
      .modal-title {
        font-size: 19px;
      }
    }
  `]
})
export class Modal {
  readonly open = input<boolean>(false);
  readonly title = input<string>('');
  readonly eyebrow = input<string>('');
  readonly subtitle = input<string>('');
  readonly maxWidth = input<string>('540px');
  readonly closeableOnBackdrop = input<boolean>(true);
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) {
      this.close();
    }
  }

  onBackdropClick(): void {
    if (this.closeableOnBackdrop()) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }
}
