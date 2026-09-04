import { Injectable, signal } from '@angular/core';

const TOAST_MS = 2600;

/** Den lilla pillret längst ned i vyn. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal('');
  readonly visible = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string): void {
    this.message.set(message);
    this.visible.set(true);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.visible.set(false), TOAST_MS);
  }
}
