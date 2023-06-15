BMI160 IMU driver
=================

Driver for the Bosch BMI160 IMU, intended to conform with ECMA419.
Tested using `embedded:io/I2C` although SPI might work as well...

The BMI160 is a 6-axis IMU with a 16-bit accelerometer and a 16-bit gyroscope.
This driver supports polling the chip for individual samples as well as using its
FIFO to collect samples in bulk.
The main use-case is to collect samples periodically, feed them through a
sensor fusion algorithm and then use the resulting orientation data.
For sample code, see the bmi160viz example in this repository as well as
the lib/ahrs library

Quick start:
- include the `manifest.json`.
- instatiate the driver using an I2C bus instance.
- call `sample()` to get accelerometer & gyroscope X, Y, Z data.

Using the FIFO:
- if `options.fifo` is set to `false` then calling `sample()` fetches the most
  recent sample from the device and returns it; it returns undefined if no
  sample is available, e.g. at start-up.
- if `options.fifo` is set to `true` then calling `sample()` will return the
  oldest sample in the FIFO; it returns undefined if the FIFO is empty.

Real usage:
- With the (physical) device in an upright resting position call `zero()` to
  calibrate the resting position ("offsets"), the data returned will then
  have near zero gyroscope readings and near 1g acceleration readings in the
  Z axis only.
- Optionally save the returned offset data and pass it into `options` on future
  start-ups to calibrate the device even when started in non-upright orientations
  or while moving.
- Use `options.Accelunit` to switch between default m/s^2 accelerometer units and g,
  the gyroscope always uses degrees/sec.
- The driver uses the default 100Hz internal sampling/filtering rate, and
  the internal FIFO can store up to ~0.8s of data at this rate (83 samples).
  This allows the samples to be rapidly fed through a sensor fusion algorithm
  when the current attitude is needed (collecting samples at a relatively high
  frequency is important for good sensor fusion results even if the latter are
  only required at low frequency).

Limitations:
- Changing the sample rate is not supported but can be implemented easily as
  long as accelerometer and gyroscope use the same rate (fifo requirement).
- The driver does not support the BMI160's step counter and activity recognition.
- Interrupts are not supported and no "data ready" callbacks are provided.
