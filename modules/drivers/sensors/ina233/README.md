TI INA233 Power Monitor
=======================

The INA233 is a power monitor chip that measures voltage and current and calculates power.
A special feature of this chip is to accumulate power internally allowing accurate
energy consumption measurements with relatively infrequent polling.

This driver is intended to conform with ECMA419.

The samples returned contain voltage, current, power, and energy measurements.
The energy is accumulated in the chip and mult be cleared periodically (or can
be cleared automatically at every reading).

Alerts/interrupts are not supported.
