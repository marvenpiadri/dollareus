import { Injectable, signal } from '@angular/core';
import { QrContentType, QrMode, QrPayloadData } from './qr-payloads';

export interface QrDraft {
  type: QrContentType;
  mode: QrMode;
  data: QrPayloadData;
}

@Injectable({ providedIn: 'root' })
export class QrDraftStore {
  private readonly storageKey = 'qr-studio-draft';
  private readonly draft = signal<QrDraft | null>(this.read());

  readonly current = this.draft.asReadonly();

  set(type: QrContentType, data: QrPayloadData, mode: QrMode = 'static'): void {
    const value = { type, mode, data: { ...data } };
    this.draft.set(value);
    this.write(value);
  }

  clear(): void {
    this.draft.set(null);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(this.storageKey);
    }
  }

  private read(): QrDraft | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as QrDraft;
      return parsed?.type && parsed?.data ? parsed : null;
    } catch {
      return null;
    }
  }

  private write(value: QrDraft): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(value));
    } catch {
      // Session persistence is optional. The in-memory draft remains valid.
    }
  }
}
