// Watchdog Timer to use in application code
// Copyright © 2023 by Thorsten von Eicken

export default class WDT {
  static get timeout_ms(): number
  static set timeout_ms(ms: number)

  constructor(name: string, timeout_ms?: number)
  close(): void
  write(): void // aka feeding the WDT
}
