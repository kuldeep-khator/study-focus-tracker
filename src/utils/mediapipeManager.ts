/**
 * Module-level MediaPipe Tasks Vision Singleton Manager
 *
 * Uses @mediapipe/tasks-vision (FilesetResolver + FaceLandmarker + PoseLandmarker)
 * with a single shared WASM runtime and zero global Emscripten Module collisions.
 * Runs in IMAGE mode so both live <video> elements and background ImageCapture
 * <canvas> frames can be analyzed seamlessly without timestamp mismatch errors.
 */

import {
  FilesetResolver,
  FaceLandmarker,
  PoseLandmarker,
} from '@mediapipe/tasks-vision';
import type { RawLandmark, RawPoseLandmark } from './computerVision';

const TASKS_VISION_WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export interface VisionModelsState {
  faceReady: boolean;
  poseReady: boolean;
  loading: boolean;
  error: string | null;
}

export interface VisionFrameResult {
  faceLandmarks: RawLandmark[] | null;
  poseLandmarks: RawPoseLandmark[] | null;
  poseUpdated: boolean;
}

let filesetPromise: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | null = null;
let faceLandmarkerInstance: FaceLandmarker | null = null;
let poseLandmarkerInstance: PoseLandmarker | null = null;
let modelsInitPromise: Promise<{
  faceLandmarker: FaceLandmarker | null;
  poseLandmarker: PoseLandmarker | null;
  error: string | null;
}> | null = null;

let modelStatus: VisionModelsState = {
  faceReady: false,
  poseReady: false,
  loading: false,
  error: null,
};

const statusListeners = new Set<(status: VisionModelsState) => void>();

function updateStatus(partial: Partial<VisionModelsState>) {
  modelStatus = { ...modelStatus, ...partial };
  statusListeners.forEach((cb) => cb(modelStatus));
}

export function subscribeVisionModelStatus(
  listener: (status: VisionModelsState) => void
): () => void {
  statusListeners.add(listener);
  listener(modelStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

export function getVisionModelStatus(): VisionModelsState {
  return modelStatus;
}

async function getWasmFileset() {
  if (!filesetPromise) {
    filesetPromise = FilesetResolver.forVisionTasks(TASKS_VISION_WASM_CDN).catch((err) => {
      filesetPromise = null;
      throw err;
    });
  }
  return filesetPromise;
}

async function createFaceLandmarkerWithFallback(
  fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
): Promise<FaceLandmarker> {
  const baseConfig = {
    runningMode: 'IMAGE' as const,
    numFaces: 1,
    minFaceDetectionConfidence: 0.45,
    minFacePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  };

  try {
    return await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: FACE_LANDMARKER_MODEL_URL,
        delegate: 'GPU',
      },
      ...baseConfig,
    });
  } catch (gpuErr) {
    console.warn('FaceLandmarker GPU delegate unavailable, falling back to CPU:', gpuErr);
    return await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: FACE_LANDMARKER_MODEL_URL,
        delegate: 'CPU',
      },
      ...baseConfig,
    });
  }
}

async function createPoseLandmarkerWithFallback(
  fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
): Promise<PoseLandmarker> {
  const baseConfig = {
    runningMode: 'IMAGE' as const,
    numPoses: 1,
    minPoseDetectionConfidence: 0.45,
    minPosePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
    outputSegmentationMasks: false,
  };

  try {
    return await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: POSE_LANDMARKER_MODEL_URL,
        delegate: 'GPU',
      },
      ...baseConfig,
    });
  } catch (gpuErr) {
    console.warn('PoseLandmarker GPU delegate unavailable, falling back to CPU:', gpuErr);
    return await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: POSE_LANDMARKER_MODEL_URL,
        delegate: 'CPU',
      },
      ...baseConfig,
    });
  }
}

/**
 * Loads FaceLandmarker and PoseLandmarker once per page session.
 * Safe under React StrictMode double-mounts and tab switching.
 */
export function initSharedVisionModels(): Promise<{
  faceLandmarker: FaceLandmarker | null;
  poseLandmarker: PoseLandmarker | null;
  error: string | null;
}> {
  if (faceLandmarkerInstance && poseLandmarkerInstance) {
    return Promise.resolve({
      faceLandmarker: faceLandmarkerInstance,
      poseLandmarker: poseLandmarkerInstance,
      error: null,
    });
  }

  if (modelsInitPromise) {
    return modelsInitPromise;
  }

  updateStatus({ loading: true, error: null });

  modelsInitPromise = (async () => {
    let errorMessage: string | null = null;
    try {
      const fileset = await getWasmFileset();

      if (!faceLandmarkerInstance) {
        faceLandmarkerInstance = await createFaceLandmarkerWithFallback(fileset);
        updateStatus({ faceReady: true });
      }

      if (!poseLandmarkerInstance) {
        try {
          poseLandmarkerInstance = await createPoseLandmarkerWithFallback(fileset);
          updateStatus({ poseReady: true });
        } catch (poseErr) {
          console.warn('PoseLandmarker failed to load (using face-geometry posture fallback):', poseErr);
        }
      }
    } catch (err: any) {
      errorMessage = err?.message || 'Failed to initialize AI computer vision models.';
      console.warn('MediaPipe Tasks Vision init error:', err);
      modelsInitPromise = null;
    } finally {
      updateStatus({
        loading: false,
        faceReady: Boolean(faceLandmarkerInstance),
        poseReady: Boolean(poseLandmarkerInstance),
        error: errorMessage,
      });
    }

    return {
      faceLandmarker: faceLandmarkerInstance,
      poseLandmarker: poseLandmarkerInstance,
      error: errorMessage,
    };
  })();

  return modelsInitPromise;
}

function isValidImageSource(
  source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap | null | undefined
): source is HTMLVideoElement | HTMLCanvasElement | ImageBitmap {
  if (!source) return false;
  if (source instanceof HTMLVideoElement) {
    return source.readyState >= 2 && source.videoWidth > 0 && source.videoHeight > 0;
  }
  if (source instanceof HTMLCanvasElement) {
    return source.width > 0 && source.height > 0;
  }
  return source.width > 0 && source.height > 0;
}

/**
 * Synchronously detects facial landmarks (478 points including iris) and,
 * optionally on throttled intervals, upper-body pose landmarks (33 points).
 */
export function detectVisionFrame(
  source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
  options: { runPose: boolean }
): VisionFrameResult {
  if (!isValidImageSource(source) || !faceLandmarkerInstance) {
    return { faceLandmarks: null, poseLandmarks: null, poseUpdated: false };
  }

  let faceLandmarks: RawLandmark[] | null = null;
  let poseLandmarks: RawPoseLandmark[] | null = null;
  let poseUpdated = false;

  try {
    const faceResult = faceLandmarkerInstance.detect(source);
    const detectedFace = faceResult.faceLandmarks?.[0];
    if (detectedFace && detectedFace.length > 0) {
      faceLandmarks = detectedFace.map((lm) => ({
        x: lm.x,
        y: lm.y,
        z: lm.z ?? 0,
      }));
    }
  } catch (err) {
    console.debug('FaceLandmarker detect error:', err);
  }

  if (options.runPose && poseLandmarkerInstance) {
    try {
      const poseResult = poseLandmarkerInstance.detect(source);
      poseUpdated = true;
      const detectedPose = poseResult.landmarks?.[0];
      if (detectedPose && detectedPose.length > 0) {
        poseLandmarks = detectedPose.map((lm) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z ?? 0,
          visibility: typeof lm.visibility === 'number' ? lm.visibility : 1,
        }));
      }
    } catch (err) {
      console.debug('PoseLandmarker detect error:', err);
    }
  }

  return { faceLandmarks, poseLandmarks, poseUpdated };
}
