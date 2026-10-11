import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthPanelComponent } from './auth-panel.component';

@Component({
  selector: 'dlr-auth-page',
  standalone: true,
  imports: [AuthPanelComponent],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css'
})
export class AuthPageComponent {
  constructor(private readonly router: Router) {}

  protected onSignedIn(): void {
    void this.router.navigateByUrl('/app');
  }
}
