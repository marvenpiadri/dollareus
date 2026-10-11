import { Component, input, output } from '@angular/core';

@Component({
  selector: 'dlr-api-credentials',
  standalone: true,
  templateUrl: './api-credentials.component.html',
  styleUrl: './api-credentials.component.css'
})
export class ApiCredentialsComponent {
  readonly organizationId = input('');
  readonly apiCredentialName = input('');
  readonly apiCredentialScopes = input('read');
  readonly apiCredentialExpiry = input('90');
  readonly apiCredentialBusy = input(false);
  readonly apiCredentialError = input('');
  readonly apiCredentialToken = input('');
  readonly apiCredentials = input<any[]>([]);

  readonly createApiCredentialRequested = output<Event>();
  readonly apiCredentialNameChangeRequested = output<string>();
  readonly apiCredentialScopesChangeRequested = output<string>();
  readonly apiCredentialExpiryChangeRequested = output<string>();
  readonly copyApiCredentialTokenRequested = output<void>();
  readonly clearApiCredentialTokenRequested = output<void>();
  readonly revokeApiCredentialRequested = output<any>();
  readonly refreshApiCredentialsRequested = output<void>();
}
