import WDT from "embedded:system/WatchdogTimer"
import Timer from "timer"

function later(delay) {
  return new Promise(function (resolve) {
    Timer.set(resolve, delay)
  })
}

;(async function () {
  trace("\n===== WDT TEST =====\n")

  const to = WDT.timeout_ms
  trace(`WDT timeout: ${to}ms\n`)

  const wdt = new WDT("wdt")

  for (let i = 0; i < 5; i++) {
    trace("Feeding WDT\n")
    wdt.write()
    await later(to / 2)
  }

  trace("Stop feeding WDT\n")
  WDT.timeout_ms = to >> 2
  trace(`New WDT timeout: ${WDT.timeout_ms}ms\n`)
  await later(to / 2)
  trace("WDT should have reset the system by now!\n")
})().then(() => {})
