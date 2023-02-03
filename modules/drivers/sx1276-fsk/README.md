# SX1276 FSK-mode driver

This driver uses the sx1276 "LoRa" radio in FSK mode in order to communicate mostly
with RFM69 radios.

## Interrupts

This driver is designed to use the DIO0 and DIO4 interrupts.
The main reason to require interrupts is that it avoids SPI accesses to the radio while the radio
is in RX mode and that lowers the noise floor.
This adds ~9dB of SNR when in LoRa mode and is bound to
also help a little in FSK mode, although FSK mode can't RX below the noise floor, so it's perhaps
less important.

- DIO0 is used to get a payload-ready interrupt, this avoids having to poll the radio while it's receiving.
- DIO4 is used to get a preamble-detect interrupt, which is used to capture the RSSI, AFC, and AGC
  settings, and avoid lock-ups (see below).

## RSSI, AGC, AFC

Like seemingly all Semtech packet radios the SX1276 has its ugly quirks when it comes to RSSI
measurements as well as AGC/AFC. (The LoRa mode fixes this crap.) Here are my notes:

- The RSSI value register is free running and not frozen when the packet is received. It is most
  accurate during the preamble period after AFC/AGC happen. This means it has to be captured early
  in the packet and is invalid by the time payload-ready is signaled.
- The AGC/AFC process has a flaw, which is that it is not automatically restarted if packet
  reception times out. The driver configures the radio to do AGC/AFC when it detects a preamble and
  what happens is that if sync address match does not occur (e.g. because the signal is too low)
  then AGC/AFC remain locked in until some future packet is received.
- To fix the locked AFC/AGC issue the driver interrupts on preamble-detect, sets a timer, and then
  restarts RX if no sync-address match occurs within a couple of milliseconds.
- From the point of view of capturing RSSI/AFC/AGC it would be possible to use sync-address match
  interrupt on DIO2, however this doesn't provide an opportunity to fix the locked AFC/AGC issue.

## Reset

Connecting the radio's reset pin is not strictly required as it has a proper power-on reset.
However, while experiementing, it is possible to get the radio into odd non-functional states that
can only be cleared by a hardware reset. If the driver is used without modification the probably that
this occurs is very small.
