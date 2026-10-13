import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { QrScannerService, ScanResult } from '../../core/scanner/qr-scanner.service';

@Component({
  selector: 'app-qr-scanner-view',
  imports: [CommonModule],
  templateUrl: './qr-scanner-view.html',
  styleUrl: './qr-scanner-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrScannerView implements OnInit, OnDestroy {
  private scannerService = inject(QrScannerService);
  private router = inject(Router);

  @ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;
  @ViewChild('hiddenCanvas') hiddenCanvas?: ElementRef<HTMLCanvasElement>;

  readonly mode = signal<'camera' | 'file'>('camera');
  readonly isCameraActive = signal<boolean>(false);
  readonly cameraError = signal<string | null>(null);
  readonly facingMode = signal<'environment' | 'user'>('environment');
  readonly hasTorch = signal<boolean>(false);
  readonly torchOn = signal<boolean>(false);

  readonly isProcessingFile = signal<boolean>(false);
  readonly lastResult = signal<ScanResult | null>(null);
  readonly scanHistory = signal<ScanResult[]>([]);
  readonly copyFeedback = signal<boolean>(false);

  private mediaStream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private audioCtx: AudioContext | null = null;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      this.startCamera();
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
    if (this.audioCtx) {
      this.audioCtx.close().catch((err: unknown) => {
        void err;
      });
    }
  }

  switchMode(newMode: 'camera' | 'file'): void {
    this.mode.set(newMode);
    if (newMode === 'camera') {
      this.startCamera();
    } else {
      this.stopCamera();
    }
  }

  async startCamera(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.cameraError.set('Camera access is not supported by this browser.');
      return;
    }

    this.stopCamera();
    this.cameraError.set(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: this.facingMode() },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.isCameraActive.set(true);

      if (this.videoEl?.nativeElement) {
        this.videoEl.nativeElement.srcObject = this.mediaStream;
        await this.videoEl.nativeElement.play();
      }

      // Check torch support
      const track = this.mediaStream.getVideoTracks()[0];
      if (track && 'getCapabilities' in track) {
        const caps = (track as MediaStreamTrack & { getCapabilities: () => Record<string, unknown> }).getCapabilities();
        if (caps && 'torch' in caps && Boolean(caps['torch'])) {
          this.hasTorch.set(true);
        }
      }

      this.runScanLoop();
    } catch (err: unknown) {
      console.warn('Camera error:', err);
      const error = err as Error;
      if (error.name === 'NotAllowedError') {
        this.cameraError.set('Camera permission was denied. Please allow camera permissions to scan live.');
      } else if (error.name === 'NotFoundError') {
        this.cameraError.set('No camera found on this device.');
      } else {
        this.cameraError.set('Could not initialize camera: ' + error.message);
      }
      this.isCameraActive.set(false);
    }
  }

  stopCamera(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.videoEl?.nativeElement) {
      this.videoEl.nativeElement.srcObject = null;
    }

    this.isCameraActive.set(false);
    this.torchOn.set(false);
  }

  toggleCameraFacing(): void {
    this.facingMode.set(this.facingMode() === 'environment' ? 'user' : 'environment');
    this.startCamera();
  }

  async toggleTorch(): Promise<void> {
    if (!this.mediaStream) return;
    const track = this.mediaStream.getVideoTracks()[0];
    if (!track) return;

    try {
      const next = !this.torchOn();
      await (track as MediaStreamTrack & { applyConstraints: (c: Record<string, unknown>) => Promise<void> }).applyConstraints({
        advanced: [{ torch: next }],
      });
      this.torchOn.set(next);
    } catch (e: unknown) {
      console.warn('Torch toggle failed:', e);
    }
  }

  private runScanLoop = async () => {
    if (!this.isCameraActive() || !this.videoEl?.nativeElement || !this.hiddenCanvas?.nativeElement) {
      return;
    }

    const video = this.videoEl.nativeElement;
    const canvas = this.hiddenCanvas.nativeElement;

    try {
      const result = await this.scannerService.scanVideoFrame(video, canvas);
      if (result) {
        this.handleSuccessfulScan(result);
        // Short pause before next scan
        setTimeout(() => {
          this.animationFrameId = requestAnimationFrame(this.runScanLoop);
        }, 1200);
        return;
      }
    } catch {
      // frame decode error ignore
    }

    this.animationFrameId = requestAnimationFrame(this.runScanLoop);
  };

  private handleSuccessfulScan(result: ScanResult): void {
    this.playSuccessBeep();
    this.lastResult.set(result);
    this.scanHistory.update((prev) => [result, ...prev.filter((r) => r.raw !== result.raw).slice(0, 9)]);
  }

  private playSuccessBeep(): void {
    try {
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        if (!this.audioCtx) {
          const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          this.audioCtx = new AudioContextConstructor();
        }
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.12);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.12);
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(80);
      }
    } catch {
      // Audio autoplay restrictions
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    await this.processImageFile(file);
    input.value = '';
  }

  async onFileDropped(event: DragEvent): Promise<void> {
    event.preventDefault();
    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      await this.processImageFile(event.dataTransfer.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  private async processImageFile(file: File): Promise<void> {
    this.isProcessingFile.set(true);
    try {
      const result = await this.scannerService.scanImageFile(file);
      if (result) {
        this.handleSuccessfulScan(result);
      } else {
        alert('Could not detect a valid QR Code in this image. Please ensure the code is well-lit and unobstructed.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Error scanning image: ${msg}`);
    } finally {
      this.isProcessingFile.set(false);
    }
  }

  async copyResultText(): Promise<void> {
    const res = this.lastResult();
    if (!res || !navigator.clipboard) return;
    await navigator.clipboard.writeText(res.raw);
    this.copyFeedback.set(true);
    setTimeout(() => this.copyFeedback.set(false), 2000);
  }

  openExternalUrl(url?: string): void {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  editInStudio(result: ScanResult): void {
    // Navigate to studio with decoded text
    this.router.navigate(['/qr/create'], {
      queryParams: {
        importedText: result.raw,
      },
    });
  }
}
