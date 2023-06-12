import Timer from "timer"
import Time from "time"
import BMI160 from "embedded:sensor/Accelerometer-Gyroscope/BMI160"
import { AHRS, GyroOffset, Quaternion } from "embedded:lib/IMU/fusion"

const UPRIGHT = false // true: upright, false: upside-down
const ZERO = Object.freeze([5, 1, 255, 252, 1, 254, 243]) // zero offsets for IMU

let sensor: BMI160 | null // BMI160 sensor
let sample_at = 0 // to calculate delta time
let ahrs: AHRS // attitude and heading reference system
let gyroOff: GyroOffset

export function startIMU() {
  sensor = new BMI160({
    sensor: {
      ...device.I2C.default,
      io: device.io.SMBus,
      address: 0x69, // non-standard on my breakout board
    },
    onError: err => trace(`BMI160: ${err}\n`),
    fifo: true,
  })
  sensor.unit = "g"

  if (false) {
    const offsets = sensor?.zero(!UPRIGHT) ?? []
    trace("Offsets: " + JSON.stringify(Array.from(offsets)) + "\n")
  } else {
    sensor.setZero(new Uint8Array(ZERO))
  }

  ahrs = new AHRS()
  gyroOff = new GyroOffset(100)
  sample_at = Time.ticks
}

export function sampleIMU(): Quaternion | null {
  // process samples in bulk from driver
  if (!sensor) return null
  sensor.batch((t, gyr, accel) => {
    const dt = t - sample_at
    if (dt <= 0) return // ignore (could be sensor clock drift)
    sample_at = t
    if (dt > 20) trace(`Long IMU step: ${dt}ms\n`)
    // flip axes if sensor is upside-down, then update ahrs
    if (!UPRIGHT) {
      accel.x = -accel.x
      accel.y = -accel.y
      accel.z = -accel.z
    }
    // update the gyroscope drift filtering
    gyr = gyroOff.update(gyr)
    ahrs.updateNoMagnetometer(gyr, accel, dt)
  })
  // validate
  const f = ahrs.flags
  if (f.initialising) return null // not ready yet
  if (f.acceleationRejectionWarning) trace("Acceleration rejection warning\n")
  if (f.acceleationRejectionTimeout) return null
  // callback
  return ahrs.quaternion
}

export function stopIMU() {
  if (sensor) sensor.close()
  sensor = null
}
