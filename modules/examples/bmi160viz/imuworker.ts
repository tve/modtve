import { startIMU, stopIMU } from "./imu"

self.onmessage = function (msg: any) {
  if (typeof msg != "object") return
  switch (msg.cmd) {
    case "start":
      globalThis.device = msg.device
      trace("startIMU: " + msg.freq + "\n")
      startIMU(msg.freq, imuSample)
      break
    case "stop":
      trace("stopIMU\n")
      stopIMU()
      break
  }
}

function imuSample(q: any) {
  self.postMessage(q)
}
