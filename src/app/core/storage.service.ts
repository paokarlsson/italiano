import { Injectable } from '@angular/core';

export type StorageMode = 'claude' | 'local' | 'memory';

/** Nyckel/värde-lagring: window.storage om den finns, annars localStorage, annars minnet. */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private mode: StorageMode = 'memory';
  private mem: Record<string, string> = {};

  async init(): Promise<void> {
    const host = (window as any).storage;
    if (host && typeof host.get === 'function') {
      try {
        await host.set('__probe__', '1', false);
        this.mode = 'claude';
        return;
      } catch {
        /* faller igenom */
      }
    }
    try {
      localStorage.setItem('__probe__', '1');
      localStorage.removeItem('__probe__');
      this.mode = 'local';
    } catch {
      this.mode = 'memory';
    }
  }

  currentMode(): StorageMode {
    return this.mode;
  }

  async get(key: string): Promise<string | null> {
    try {
      if (this.mode === 'claude') {
        const r = await (window as any).storage.get(key, false);
        return r ? r.value : null;
      }
      if (this.mode === 'local') return localStorage.getItem(key);
      return this.mem[key] ?? null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<boolean> {
    try {
      if (this.mode === 'claude') {
        await (window as any).storage.set(key, value, false);
        return true;
      }
      if (this.mode === 'local') {
        localStorage.setItem(key, value);
        return true;
      }
      this.mem[key] = value;
      return true;
    } catch {
      return false;
    }
  }
}
