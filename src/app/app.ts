import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app">
      <router-outlet />
    </div>
    <div class="copy-toast" [class.show]="toast.visible()">{{ toast.message() }}</div>
  `,
})
export class App {
  protected readonly toast = inject(ToastService);
}
