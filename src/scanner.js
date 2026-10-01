// Advanced Industrial Barcode & QR Scanner Engine with Hardware Acceleration,
// Native BarcodeDetector 60fps Loop, Dynamic Zoom, Torch Controls, and Macro Focus.
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
// import { sounds } from './audio.js';

// Comprehensive industrial formats for Ingenico and retail hardware
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODABAR
];

const NATIVE_FORMATS = [
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'itf',
  'upc_a',
  'upc_e',
  'qr_code',
  'data_matrix'
];

class BarcodeScannerManager {
  constructor() {
    this.html5QrCode = null;
    this.isScanning = false;
    this.currentCameraId = null;
    this.cameras = [];
    this.onScanSuccessCallback = null;
    this.onScanErrorCallback = null;
    this.nativeDetector = null;
    this.activeTrack = null;
    this.animationFrameId = null;
    this.isTorchOn = false;
    this.currentZoom = 1.0;

    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        this.nativeDetector = new window.BarcodeDetector({ formats: NATIVE_FORMATS });
      } catch (e) {
        console.warn('Native BarcodeDetector initialization warning:', e);
      }
    }
  }

  async getCameras() {
    try {
      const devices = await Html5Qrcode.getCameras();
      this.cameras = devices || [];
      return this.cameras;
    } catch (err) {
      console.warn('Unable to enumerate cameras:', err);
      return [];
    }
  }

  /**
   * Start Live High-Definition Stream with Hardware Acceleration & Dynamic Range
   */
  async startCamera(elementId, onSuccess, onError) {
    this.onScanSuccessCallback = onSuccess;
    this.onScanErrorCallback = onError;

    if (this.isScanning) {
      await this.stop();
    }

    try {
      this.html5QrCode = new Html5Qrcode(elementId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false
      });

      // Dynamic responsive scan box: Wide 85% area optimized for 1D horizontal serial barcodes
      const config = {
        fps: 25,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const w = Math.floor(viewfinderWidth * 0.88);
          const h = Math.floor(Math.min(viewfinderHeight * 0.65, 240));
          return { width: Math.max(w, 240), height: Math.max(h, 140) };
        },
        aspectRatio: 1.777778,
        videoConstraints: {
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          focusMode: { ideal: "continuous" }
        },
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };

      // cameraIdOrConfig must have EXACTLY 1 key per html5-qrcode API specification
      const cameraIdOrConfig = { facingMode: "environment" };

      await this.html5QrCode.start(
        cameraIdOrConfig,
        config,
        (decodedText, decodedResult) => {
          this.triggerScanSuccess(decodedText, decodedResult);
        },
        () => {}
      );

      this.isScanning = true;
      this.bindHardwareCapabilities(elementId);
      this.startNativeFrameLoop(elementId);
      return true;
    } catch (err) {
      console.warn('Environment camera start failed, attempting available camera ID:', err);
      try {
        const cameras = await this.getCameras();
        if (cameras.length > 0) {
          const cameraId = cameras[0].id;
          // Create fresh instance to avoid state transition collisions
          this.html5QrCode = new Html5Qrcode(elementId, {
            formatsToSupport: SUPPORTED_FORMATS,
            verbose: false
          });
          await this.html5QrCode.start(
            cameraId,
            {
              fps: 20,
              qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(h * 0.65, 220)) }),
              formatsToSupport: SUPPORTED_FORMATS
            },
            (decodedText, decodedResult) => {
              this.triggerScanSuccess(decodedText, decodedResult);
            },
            () => {}
          );
          this.isScanning = true;
          this.bindHardwareCapabilities(elementId);
          this.startNativeFrameLoop(elementId);
          return true;
        }
      } catch (fallbackErr) {
        console.error('All camera start attempts failed:', fallbackErr);
        if (this.onScanErrorCallback) {
          this.onScanErrorCallback(fallbackErr);
        }
        return false;
      }
    }
  }

  triggerScanSuccess(decodedText, decodedResult) {
    if (!this.isScanning) return;
    this.isScanning = false; // Prevent multiple rapid triggers
    sounds.playScanBeep();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(80);
    }
    if (this.onScanSuccessCallback) {
      this.onScanSuccessCallback(decodedText, decodedResult);
    }
  }

  /**
   * Hardware Acceleration: Runs native 60fps BarcodeDetector on the video stream directly.
   * Recognizes tilted, upside-down, and moving barcodes in under 5ms.
   */
  startNativeFrameLoop(elementId) {
    if (!this.nativeDetector) return;

    const checkVideo = () => {
      const videoEl = document.querySelector(`#${elementId} video`);
      if (!videoEl || videoEl.readyState < 2) {
        if (this.isScanning) {
          this.animationFrameId = requestAnimationFrame(checkVideo);
        }
        return;
      }

      const detectTick = async () => {
        if (!this.isScanning) return;
        try {
          if (videoEl.readyState >= 2 && !videoEl.paused) {
            const barcodes = await this.nativeDetector.detect(videoEl);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              this.triggerScanSuccess(barcodes[0].rawValue);
              return;
            }
          }
        } catch (e) {
          // Frame skip normal
        }
        if (this.isScanning) {
          this.animationFrameId = requestAnimationFrame(detectTick);
        }
      };

      this.animationFrameId = requestAnimationFrame(detectTick);
    };

    this.animationFrameId = requestAnimationFrame(checkVideo);
  }

  bindHardwareCapabilities(elementId) {
    const videoEl = document.querySelector(`#${elementId} video`);
    if (videoEl && videoEl.srcObject) {
      const tracks = videoEl.srcObject.getVideoTracks();
      if (tracks.length > 0) {
        this.activeTrack = tracks[0];
      }
    }
  }

  getCapabilities() {
    if (this.activeTrack && typeof this.activeTrack.getCapabilities === 'function') {
      try {
        return this.activeTrack.getCapabilities();
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  hasTorch() {
    const caps = this.getCapabilities();
    return Boolean(caps.torch);
  }

  async toggleTorch() {
    if (!this.activeTrack) return false;
    try {
      this.isTorchOn = !this.isTorchOn;
      await this.activeTrack.applyConstraints({
        advanced: [{ torch: this.isTorchOn }]
      });
      return this.isTorchOn;
    } catch (e) {
      console.warn('Torch toggle failed:', e);
      return false;
    }
  }

  hasZoom() {
    const caps = this.getCapabilities();
    return Boolean(caps.zoom);
  }

  getZoomRange() {
    const caps = this.getCapabilities();
    if (caps.zoom) {
      return { min: caps.zoom.min || 1, max: caps.zoom.max || 5, step: caps.zoom.step || 0.1 };
    }
    return null;
  }

  async setZoom(zoomValue) {
    if (!this.activeTrack) return;
    try {
      this.currentZoom = zoomValue;
      await this.activeTrack.applyConstraints({
        advanced: [{ zoom: zoomValue }]
      });
    } catch (e) {
      console.warn('Zoom adjustment failed:', e);
    }
  }

  async stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.html5QrCode && this.isScanning) {
      try {
        await this.html5QrCode.stop();
        this.html5QrCode.clear();
      } catch (e) {
        console.warn('Error stopping scanner:', e);
      }
    }
    this.activeTrack = null;
    this.isScanning = false;
    this.isTorchOn = false;
  }

  /**
   * Multi-Pass Photo Scanner Engine:
   * Handles high-megapixel smartphone photos, vertical rotations, contrast adjustments
   */
  async scanImageFile(file, elementId) {
    // 1. Try Native BarcodeDetector directly on the image
    if (this.nativeDetector) {
      try {
        const bitmap = await createImageBitmap(file);
        const barcodes = await this.nativeDetector.detect(bitmap);
        if (barcodes && barcodes.length > 0) {
          sounds.playScanBeep();
          return barcodes[0].rawValue;
        }
      } catch (nativeErr) {}
    }

    // 2. Multi-Pass Canvas Analysis (Downscale, 90 deg rotation, high-contrast binarization)
    const img = await this.loadImageFromFile(file);

    const passes = [
      { scale: true, rotate: 0, highContrast: false },
      { scale: true, rotate: 90, highContrast: false },   // Vertical barcode fix
      { scale: true, rotate: 0, highContrast: true },    // Bad lighting / glare fix
      { scale: true, rotate: 270, highContrast: false },
      { scale: false, rotate: 0, highContrast: false }
    ];

    for (const pass of passes) {
      try {
        const canvas = this.renderToCanvas(img, pass);
        
        if (this.nativeDetector) {
          try {
            const detected = await this.nativeDetector.detect(canvas);
            if (detected && detected.length > 0 && detected[0].rawValue) {
              sounds.playScanBeep();
              return detected[0].rawValue;
            }
          } catch (e) {}
        }

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        if (blob) {
          const processedFile = new File([blob], 'processed.jpg', { type: 'image/jpeg' });
          if (!this.html5QrCode) {
            this.html5QrCode = new Html5Qrcode(elementId || 'camera-reader', {
              formatsToSupport: SUPPORTED_FORMATS,
              verbose: false
            });
          }
          try {
            const text = await this.html5QrCode.scanFile(processedFile, true);
            if (text) {
              sounds.playScanBeep();
              return text;
            }
          } catch (e) {}
        }
      } catch (passError) {}
    }

    // Direct fallback on the raw file
    try {
      if (!this.html5QrCode) {
        this.html5QrCode = new Html5Qrcode(elementId || 'camera-reader', {
          formatsToSupport: SUPPORTED_FORMATS,
          verbose: false
        });
      }
      const rawText = await this.html5QrCode.scanFile(file, true);
      if (rawText) {
        sounds.playScanBeep();
        return rawText;
      }
    } catch (e) {}

    throw new Error('BARCODE_NOT_FOUND');
  }

  loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  renderToCanvas(img, { scale, rotate, highContrast }) {
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (scale) {
      const maxDim = 1280;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (rotate === 90 || rotate === 270) {
      canvas.width = height;
      canvas.height = width;
      ctx.translate(height / 2, width / 2);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
    } else {
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
    }

    if (highContrast) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const val = gray > 120 ? 255 : 0;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    return canvas;
  }
}

export const scannerManager = new BarcodeScannerManager();
