import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { ProjectRepository } from '../../core/storage/project-repository';
import { QrProject } from '../../core/models/project.model';
import { QrMatrixGenerator } from '../../core/qr/qr-matrix';
import { QrSvgRenderer } from '../../core/qr/qr-svg-renderer';
import { QrCanvasRenderer } from '../../core/qr/qr-canvas-renderer';

@Component({
  selector: 'app-qr-projects-view',
  imports: [CommonModule],
  templateUrl: './qr-projects-view.html',
  styleUrl: './qr-projects-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrProjectsView implements OnInit {
  readonly projectRepo = inject(ProjectRepository);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  ngOnInit(): void {
    this.projectRepo.refresh();
  }

  getThumbnailSvg(project: QrProject): SafeHtml {
    try {
      const matrix = QrMatrixGenerator.generate(project.rawPayload, project.design.eccLevel);
      const svg = QrSvgRenderer.render(matrix, project.design, { cellSize: 6 });
      return this.sanitizer.bypassSecurityTrustHtml(svg);
    } catch {
      return this.sanitizer.bypassSecurityTrustHtml('<svg></svg>');
    }
  }

  openProject(project: QrProject): void {
    this.router.navigate(['/qr'], {
      queryParams: { project: project.id },
    });
  }

  async duplicateProject(project: QrProject): Promise<void> {
    await this.projectRepo.duplicateProject(project.id);
  }

  async deleteProject(project: QrProject): Promise<void> {
    if (confirm(`Delete "${project.name}" from your local projects?`)) {
      await this.projectRepo.deleteProject(project.id);
    }
  }

  downloadSvg(project: QrProject): void {
    try {
      const matrix = QrMatrixGenerator.generate(project.rawPayload, project.design.eccLevel);
      const svg = QrSvgRenderer.render(matrix, project.design, { cellSize: 10 });
      const filename = `${project.name.toLowerCase().replace(/[^a-z0-9_-]/gi, '_')}.svg`;
      QrCanvasRenderer.downloadSvg(svg, filename);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      alert(`Export error: ${msg}`);
    }
  }

  createNew(): void {
    this.router.navigate(['/qr/create']);
  }
}
