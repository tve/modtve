// import device from "embedded:provider/builtin"
// import BMI160 from "embedded:sensor/Accelerometer-Gyroscope/BMI160"
import { AHRS } from "embedded:lib/IMU/AHRS"
export {}

let ahrs: AHRS | undefined

self.onmessage = function (msg: Record<string, any>) {
  if (typeof msg != "object") return
  switch (msg.cmd) {
    case "start":
      trace("IMU worker start\n")
      ahrs = new AHRS(msg.options)
      const q = ahrs.sample()
      self.postMessage(q ?? "none") // undefined is not sendable
      break
    case "stop":
      trace("IMU worker stop\n")
      ahrs?.close()
      break
    case "sample":
      if (ahrs) {
        const q = ahrs.sample()
        //trace(`IMU worker sample: ${JSON.stringify(q)}\n`)
        self.postMessage(q ?? "none") // undefined is not sendable, not sketchy marshalling of Quaternion
      }
  }
}
