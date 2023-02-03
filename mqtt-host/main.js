// Simple 'mod' host
// Copyright 2023 by Thorsten von Eicken

import Modules from "modules"
import WiFi from "wifi"
import Net from "net"
import Timer from "timer"
import { connectAsync } from "async-mqtt"
const Digital = device.io.Digital

const credentials = { ssid: "xxx", password: "xxx" }
const broker = {
  server: "mqtt://core.voneicken.com:1883",
  options: {
    username: "xs/test",
    password: "xxx",
  },
}

let led_wifi

function mqtt_manager() {
  trace(`MQTT connecting to "${broker.server}"\n`)
  connectAsync(broker.server, broker.options)
    .then(client => {
      trace("MQTT connected\n")
      launch_app(client)
    })
    .catch(err => {
      trace(`MQTT error: ${err}\n`)
    })
}

function wifi_manager() {
  trace(`WiFi connecting to "${credentials.ssid}"\n`)

  WiFi.mode = 1

  if (!led_wifi) led_wifi = new Digital({ pin: device.pin.led_wifi, mode: Digital.Output })
  led_wifi.write(1)

  const monitor = new WiFi(credentials, (msg, code) => {
    // try {
    switch (msg) {
      case WiFi.gotIP:
        trace(`IP address ${Net.get("IP")}\n`)
        mqtt_manager()
        break

      case WiFi.connected:
        led_wifi.write(0)
        trace(`WiFi connected to "${Net.get("SSID")}"\n`)
        break

      case WiFi.disconnected:
        monitor.close()
        if (code == -1) {
          trace("WiFi password rejected\n")
          WiFi.disconnect()
          Timer.set(() => {
            wifi_manager()
          }, 6000)
        } else {
          trace("WiFi disconnected\n")
          WiFi.disconnect()
          Timer.set(() => {
            wifi_manager()
          }, 1000)
        }
        break
    }
    // } catch (e) {
    //   trace(e.stack)
    //   trace("\n")
    // }
  })
}

function launch_app(mqtt) {
  if (Modules.has("check")) {
    // try {
    Modules.importNow("check")()
    if (!Modules.has("app")) throw new Error("Module 'app' not found")
    let app = Modules.importNow("app")
    trace("===== Launching app =====\n")
    app(mqtt)
    trace("App is done\n")
    // } catch (e) {
    //   trace(`Error running mod: ${e.stack}\n`)
    // }
  } else {
    trace("MQTTHost ready, no module installed...\n")
  }
}

export default function () {
  // try {
  trace("===== MQTTHost starting =====\n")
  Timer.repeat(() => trace("Alive...\n"), 10000)

  // const led = new device.io.Digital({ pin: device.pin.led, mode: Digital.Output })
  // let val = 0
  // Timer.repeat(() => {
  //   val = 1 - val
  //   led.write(val)
  // }, 1000)

  wifi_manager()
  //launch_app()
  // } catch (e) {
  //   trace(e.stack)
  //   trace("\n")
  // }
}
