export interface GyroPanRange {
  min: number
  max: number
}

export interface GyroPanControllerOptions {
  getCurrentValue: () => number
  getRange: () => GyroPanRange
  onValueChange: (value: number) => void
  deadZoneDeg?: number
  maxTiltDeg?: number
  smoothing?: number
  invert?: boolean
}

type GyroPermissionState = 'unknown' | 'granted' | 'denied' | 'implicit'

type DeviceOrientationPermissionCapable = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeRange(range: GyroPanRange): GyroPanRange {
  const min = Number.isFinite(range.min) ? range.min : 0
  const max = Number.isFinite(range.max) ? range.max : 0
  return min <= max ? { min, max } : { min: max, max: min }
}

export class GyroPanController {
  private enabled = false
  private listening = false
  private suspended = false
  private permissionState: GyroPermissionState = 'unknown'
  private neutralGamma: number | null = null
  private lastGamma: number | null = null
  private baseValue = 0

  constructor(private options: GyroPanControllerOptions) {}

  enable(): void {
    if (this.enabled) return
    this.enabled = true
    this.suspended = false
    this.baseValue = this.options.getCurrentValue()
    this.tryStartListening()
  }

  disable(): void {
    this.enabled = false
    this.suspended = false
    this.neutralGamma = null
    this.lastGamma = null
    this.baseValue = this.options.getCurrentValue()
    this.stopListening()
  }

  suspend(): void {
    if (!this.enabled) return
    this.suspended = true
  }

  resume(): void {
    if (!this.enabled) return
    this.suspended = false
    this.recenter()
  }

  recenter(): void {
    this.baseValue = this.options.getCurrentValue()
    this.neutralGamma = this.lastGamma
  }

  isAuthorized(): boolean {
    return this.permissionState === 'granted' || this.permissionState === 'implicit'
  }

  needsPermissionGesture(): boolean {
    const orientationCtor = this.getDeviceOrientationCtor()
    return !!orientationCtor && typeof orientationCtor.requestPermission === 'function'
  }

  async requestPermissionFromGesture(): Promise<boolean> {
    if (!this.enabled) return false
    const orientationCtor = this.getDeviceOrientationCtor()
    if (!orientationCtor) return false

    const requestPermission = orientationCtor.requestPermission
    if (typeof requestPermission !== 'function') {
      this.permissionState = 'implicit'
      this.startListening()
      return true
    }

    if (this.permissionState === 'granted') {
      this.startListening()
      return true
    }

    if (this.permissionState === 'denied') {
      return false
    }

    try {
      const result = await requestPermission.call(orientationCtor)
      if (result === 'granted') {
        this.permissionState = 'granted'
        this.startListening()
        return true
      }
      this.permissionState = 'denied'
      return false
    } catch {
      this.permissionState = 'denied'
      return false
    }
  }

  destroy(): void {
    this.disable()
  }

  private tryStartListening(): void {
    if (!this.enabled) return
    const orientationCtor = this.getDeviceOrientationCtor()
    if (!orientationCtor) return

    if (typeof orientationCtor.requestPermission === 'function') {
      if (this.permissionState === 'granted') {
        this.startListening()
      }
      return
    }

    this.permissionState = 'implicit'
    this.startListening()
  }

  private startListening(): void {
    if (!this.enabled || this.listening || typeof window === 'undefined') return
    window.addEventListener('deviceorientation', this.handleDeviceOrientation)
    this.listening = true
  }

  private stopListening(): void {
    if (!this.listening || typeof window === 'undefined') return
    window.removeEventListener('deviceorientation', this.handleDeviceOrientation)
    this.listening = false
  }

  private handleDeviceOrientation = (event: DeviceOrientationEvent): void => {
    if (!this.enabled || this.suspended) return
    if (typeof event.gamma !== 'number' || Number.isNaN(event.gamma)) return

    this.lastGamma = event.gamma
    if (this.neutralGamma === null) {
      this.neutralGamma = event.gamma
      this.baseValue = this.options.getCurrentValue()
    }
    this.applyTiltValue()
  }

  private applyTiltValue(): void {
    if (this.lastGamma === null || this.neutralGamma === null) return

    const range = normalizeRange(this.options.getRange())
    const span = range.max - range.min
    if (span <= 0) {
      this.baseValue = clamp(this.options.getCurrentValue(), range.min, range.max)
      this.options.onValueChange(range.min)
      return
    }

    const maxTiltDeg = Math.max(this.options.maxTiltDeg ?? 18, 1)
    const deadZoneDeg = Math.max(this.options.deadZoneDeg ?? 1.2, 0)
    const smoothing = clamp(this.options.smoothing ?? 0.24, 0, 1)
    const direction = this.options.invert === false ? 1 : -1

    let delta = this.lastGamma - this.neutralGamma
    if (Math.abs(delta) < deadZoneDeg) {
      delta = 0
    }

    const rawRatio = clamp(delta, -maxTiltDeg, maxTiltDeg) / maxTiltDeg
    // Deceleration curve: responsive at small tilt, diminishing at larger tilt
    const easedRatio = Math.sign(rawRatio) * Math.pow(Math.abs(rawRatio), 0.5)
    const amplitude = span * 0.1
    const target = clamp(this.baseValue + direction * easedRatio * amplitude, range.min, range.max)
    const current = clamp(this.options.getCurrentValue(), range.min, range.max)
    const next = smoothing >= 1 ? target : current + (target - current) * smoothing

    this.options.onValueChange(Math.abs(target - next) < 0.5 ? target : next)
  }

  private getDeviceOrientationCtor(): DeviceOrientationPermissionCapable | null {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      return null
    }
    return window.DeviceOrientationEvent as DeviceOrientationPermissionCapable
  }
}
