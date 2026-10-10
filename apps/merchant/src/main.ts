import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
bootstrapApplication(AppComponent).catch((error: unknown) => console.error('Dollareus failed to start', error));
