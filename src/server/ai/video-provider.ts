// ============================================================
// Interactive Guide - Video Provider (Facade)
// ============================================================
// Thin facade re-exporting all types and the factory from
// the providers directory.

export {
  type VideoProviderName,
  type VideoTaskStatus,
  type VideoGenerationRequest,
  type VideoTaskResult,
  type VideoPollResult,
  type VideoDownloadResult,
  type VideoGenerationProvider,
  createVideoProvider,
} from './video/providers/video-provider-interface.js'