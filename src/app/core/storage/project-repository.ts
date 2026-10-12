import { Injectable, signal } from '@angular/core';
import { QrProject } from '../models/project.model';
import { IndexedDbStorage } from './indexeddb';

@Injectable({
  providedIn: 'root',
})
export class ProjectRepository {
  private storage = new IndexedDbStorage();
  readonly projects = signal<QrProject[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.isLoading.set(true);
    try {
      const list = await this.storage.getAll();
      this.projects.set(list);
    } catch (err) {
      console.warn('Failed to load local projects from IndexedDB:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async getProject(id: string): Promise<QrProject | null> {
    try {
      return await this.storage.getById(id);
    } catch {
      return null;
    }
  }

  async saveProject(project: QrProject): Promise<void> {
    project.updatedAt = Date.now();
    await this.storage.save(project);
    await this.refresh();
  }

  async deleteProject(id: string): Promise<void> {
    await this.storage.delete(id);
    await this.refresh();
  }

  async duplicateProject(id: string): Promise<QrProject | null> {
    const existing = await this.getProject(id);
    if (!existing) return null;

    const copy: QrProject = {
      ...existing,
      id: 'proj_' + Math.random().toString(36).substring(2, 10),
      name: `${existing.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.saveProject(copy);
    return copy;
  }
}
