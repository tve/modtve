// ahrs - produce attitude and heading reference system data from an IMU using sensor fusion
// Copright © 2023 by Thorsten von Eicken

import Time from "time"
import { AHRS as FusionAHRS, GyroOffset, Quaternion, Euler } from "embedded:lib/IMU/fusion"
export { Quaternion, Euler }

// const ZERO = Object.freeze([5, 1, 255, 252, 1, 254, 243]) // zero offsets for IMU

export interface Vector {
  x: number
  y: number
  z: number
}

export interface IMUSample {
  ticks: number
  gyroscope: Vector
  accelerometer: Vector
}

export interface IMUSensor {
  constructor(options: Record<string, any>): void
  sample(s: IMUSample | undefined): IMUSample | undefined
  close(): void
}

export interface Options {
  imu: Record<string, any> & {
    io: any // IMU sensor class to instantiate
  }
  onError?: (error: string) => void

  upright?: boolean // true: upright(default), false: upside-down
}

export class AHRS {
  #imu: IMUSensor | null
  #sample_at = 0 // to calculate delta time
  #ahrs: FusionAHRS | null // Fusion library's attitude and heading reference system
  #gyroOff: GyroOffset | null
  #upright = true

  constructor(options: Options) {
    const imu_opts = { ...options.imu, accelUnit: "g", fifo: true }
    this.#imu = new options.imu.io(imu_opts)

    // if (false) {
    //   const offsets = sensor?.zero(!UPRIGHT) ?? []
    //   trace("Offsets: " + JSON.stringify(Array.from(offsets)) + "\n")
    // } else {
    //   sensor.setZero(new Uint8Array(ZERO))
    // }

    this.#ahrs = new FusionAHRS()
    this.#gyroOff = new GyroOffset(100)
    this.#sample_at = Time.ticks
    this.configure(options)
  }

  configure(options: Options) {
    this.#upright = options.upright ?? true
    trace("AHRS: upright=" + this.#upright + "\n")
  }

  sample(): Quaternion | undefined {
    // process samples in bulk from driver
    if (!this.#imu || !this.#ahrs) return
    let sample: IMUSample | undefined
    while ((sample = this.#imu.sample(sample)) != undefined) {
      let { ticks, gyroscope, accelerometer } = sample
      const dt = ticks - this.#sample_at
      if (dt <= 0) return // ignore (could be sensor clock drift)
      this.#sample_at = ticks
      if (dt > 20) trace(`Long IMU step: ${dt}ms\n`)
      // flip axes if sensor is upside-down, then update ahrs
      if (!this.#upright) {
        accelerometer.x = -accelerometer.x
        accelerometer.y = -accelerometer.y
        accelerometer.z = -accelerometer.z
      }
      // update the gyroscope drift filtering
      gyroscope = this.#gyroOff!.update(gyroscope)
      this.#ahrs.updateNoMagnetometer(gyroscope, accelerometer, dt)
    }
    // validate
    const f = this.#ahrs.flags
    if (f.initialising) return // not ready yet
    if (f.acceleationRejectionWarning) trace("Acceleration rejection warning\n")
    if (f.acceleationRejectionTimeout) return
    // callback
    return this.#ahrs.quaternion
  }

  close() {
    this.#imu?.close()
    this.#imu = null
    this.#ahrs = null
    this.#gyroOff = null
  }
}
