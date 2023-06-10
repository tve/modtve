import Timer from "timer"
import Time from "time"
import BMI160 from "embedded:sensor/Accelerometer-Gyroscope/BMI160"
import { AHRS, Quaternion } from "embedded:lib/IMU/fusion"

const idiv = (Math as any).idiv as (a: number, b: number) => number
const UPRIGHT = false // true: upright, false: upside-down
const SAMPLE_INTVL = 10 // ms

let ticker: Timer | null // sampling timer
let sensor: BMI160 | null // BMI160 sensor

export function startIMU(freq: number, cb: (q: Quaternion) => void) {
  sensor = new BMI160({
    sensor: {
      ...device.I2C.default,
      io: device.io.SMBus,
      address: 0x69, // non-standard on my breakout board
    },
    onError: err => trace(`BMI160: ${err}\n`),
  })
  sensor.unit = "g"

  // trace(`Temperature: ${sensor.temperature().toFixed(1)}°C\n`)

  Timer.delay(100)
  trace("Sample: " + JSON.stringify(sensor.sample()) + "\n")

  if (false) {
    const offsets = sensor?.zero(!UPRIGHT) ?? []
    trace("Offsets: " + JSON.stringify(Array.from(offsets)) + "\n")
  } else {
    const offsets = [5, 1, 255, 252, 1, 254, 243]
    sensor.setZero(new Uint8Array(offsets))
  }

  const ahrs = new AHRS() // attitude and heading reference system
  let sample_at = Time.ticks // to tell AHRS the actual sample interval
  let cb_at = Time.ticks // to gate callbacks
  const cb_intv = idiv(1000, freq) // requested callback interval

  // sampling loop
  let data_cnt = 0 // count data to avoid callbacks when no data
  const data_min = Math.max(1, idiv(cb_intv, SAMPLE_INTVL), 2) // minimum data count
  ticker = Timer.repeat(() => {
    const s0 = Time.ticks
    const sample = sensor?.sample()
    const s1 = Time.ticks
    if (!sample) return
    // update AHRS model
    const g = sample.gyroscope
    const a = sample.accelerometer
    if (!UPRIGHT) {
      a.x = -a.x
      a.y = -a.y
      a.z = -a.z
    }
    const dt = sample.ticks - sample_at
    if (dt > 20) trace(`Long step: <${dt}>ms`)
    ahrs.updateNoMagnetometer(g, a, dt)
    sample_at = sample.ticks
    // validate
    const f = ahrs.flags
    if (f.initialising) return // not ready yet
    if (f.acceleationRejectionWarning) trace("Acceleration rejection warning\n")
    if (f.acceleationRejectionTimeout) return
    data_cnt++

    // trace(`Accel: [ ${a.x.toFixed(2)} ${a.y.toFixed(2)} ${a.z.toFixed(2)} ] `)
    // trace(`Gyro: [ ${g.x.toFixed(2)} ${g.y.toFixed(2)} ${g.z.toFixed(2)} ]\n`)

    // callback
    if (sample.ticks - cb_at < cb_intv) return // not time yet
    if (data_cnt < data_min) return // not enough data, delay 'til got some more samples
    const q = ahrs.quaternion
    const c0 = Time.ticks
    //Timer.set(() => cb(new Quaternion(q.w, q.x, q.y, q.z)), 0)
    cb(q)
    data_cnt = 0
  }, 10)
}

export function stopIMU() {
  if (ticker) Timer.clear(ticker)
  if (sensor) sensor.close()
  ticker = null
  sensor = null
}
