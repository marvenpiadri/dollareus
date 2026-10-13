import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

type AppLanguage = 'EN' | 'FR' | 'ES' | 'DE';

const SHELL_COPY: Record<AppLanguage, Record<string, string>> = {
  EN: {
    home: 'Home', business: 'Business', overview: 'Overview', orders: 'Orders', pointOfSale: 'Point of sale',
    products: 'Products', menus: 'Menus', customers: 'Customers', inventory: 'Inventory', tools: 'Tools',
    qrStudio: 'QR Studio', savedProjects: 'Saved QR projects', scanner: 'QR scanner', settings: 'Settings',
    language: 'Language', appearance: 'Appearance', light: 'Light theme', dark: 'Dark theme',
    workspace: 'Open workspace', signIn: 'Sign in', footerTagline: 'Business operations, commerce tools and QR Studio in one connected workspace.',
    platform: 'Platform', resources: 'Tools & resources', legal: 'Preferences & account', copyright: 'All rights reserved.'
  },
  FR: {
    home: 'Accueil', business: 'Entreprise', overview: 'Vue d’ensemble', orders: 'Commandes', pointOfSale: 'Point de vente',
    products: 'Produits', menus: 'Menus', customers: 'Clients', inventory: 'Stock', tools: 'Outils',
    qrStudio: 'Studio QR', savedProjects: 'Projets QR enregistrés', scanner: 'Scanner QR', settings: 'Paramètres',
    language: 'Langue', appearance: 'Apparence', light: 'Thème clair', dark: 'Thème sombre',
    workspace: 'Ouvrir l’espace', signIn: 'Connexion', footerTagline: 'Gestion, commerce et Studio QR dans un espace de travail connecté.',
    platform: 'Plateforme', resources: 'Outils et ressources', legal: 'Préférences et compte', copyright: 'Tous droits réservés.'
  },
  ES: {
    home: 'Inicio', business: 'Negocio', overview: 'Resumen', orders: 'Pedidos', pointOfSale: 'Punto de venta',
    products: 'Productos', menus: 'Menús', customers: 'Clientes', inventory: 'Inventario', tools: 'Herramientas',
    qrStudio: 'Estudio QR', savedProjects: 'Proyectos QR guardados', scanner: 'Escáner QR', settings: 'Configuración',
    language: 'Idioma', appearance: 'Apariencia', light: 'Tema claro', dark: 'Tema oscuro',
    workspace: 'Abrir espacio', signIn: 'Iniciar sesión', footerTagline: 'Operaciones, comercio y Estudio QR en un espacio conectado.',
    platform: 'Plataforma', resources: 'Herramientas y recursos', legal: 'Preferencias y cuenta', copyright: 'Todos los derechos reservados.'
  },
  DE: {
    home: 'Startseite', business: 'Geschäft', overview: 'Übersicht', orders: 'Bestellungen', pointOfSale: 'Kasse',
    products: 'Produkte', menus: 'Menüs', customers: 'Kunden', inventory: 'Lagerbestand', tools: 'Werkzeuge',
    qrStudio: 'QR-Studio', savedProjects: 'Gespeicherte QR-Projekte', scanner: 'QR-Scanner', settings: 'Einstellungen',
    language: 'Sprache', appearance: 'Darstellung', light: 'Helles Design', dark: 'Dunkles Design',
    workspace: 'Arbeitsbereich öffnen', signIn: 'Anmelden', footerTagline: 'Geschäftsabläufe, Commerce-Tools und QR-Studio an einem Ort.',
    platform: 'Plattform', resources: 'Tools und Ressourcen', legal: 'Einstellungen und Konto', copyright: 'Alle Rechte vorbehalten.'
  }
};

@Component({
  selector: 'dlr-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  protected readonly language = signal<AppLanguage>('EN');
  protected readonly dark = signal(false);
  protected readonly openMenu = signal<'business' | 'tools' | 'settings' | ''>('');

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      const storedLanguage = localStorage.getItem('dollareus:language') as AppLanguage | null;
      if (storedLanguage && storedLanguage in SHELL_COPY) this.language.set(storedLanguage);
      this.dark.set(localStorage.getItem('dollareus:theme') === 'dark');
    } catch { /* Storage may be unavailable; defaults remain usable. */ }
    this.applyPreferences();
  }

  protected t(key: string): string {
    return SHELL_COPY[this.language()][key] ?? SHELL_COPY.EN[key] ?? key;
  }

  protected toggleMenu(menu: 'business' | 'tools' | 'settings'): void {
    this.openMenu.update(current => current === menu ? '' : menu);
  }

  protected closeMenus(): void { this.openMenu.set(''); }

  protected setLanguage(value: string): void {
    if (!(value in SHELL_COPY)) return;
    this.language.set(value as AppLanguage);
    try { localStorage.setItem('dollareus:language', value); } catch { /* Ignore unavailable storage. */ }
    this.applyPreferences();
  }

  protected toggleTheme(): void {
    this.dark.update(value => !value);
    try { localStorage.setItem('dollareus:theme', this.dark() ? 'dark' : 'light'); } catch { /* Ignore unavailable storage. */ }
    this.applyPreferences();
  }

  private applyPreferences(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = this.language().toLowerCase();
    document.documentElement.dataset['theme'] = this.dark() ? 'dark' : 'light';
    document.documentElement.classList.toggle('theme-dark', this.dark());
    document.documentElement.classList.toggle('theme-light', !this.dark());
    document.body?.classList.toggle('theme-dark', this.dark());
    document.body?.classList.toggle('theme-light', !this.dark());
  }
}
