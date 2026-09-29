# DOM / Sensors

Sensors and peripherals (not worker-safe — main thread).

## Modules

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [geolocation](./geolocation.md) | `{isSupported, current, watch}` | none | GPS / wifi position |
| [battery](./battery.md) | `{isSupported, current, watch}` | none | Battery Status API |
| [networkInfo](./networkInfo.md) | `{isSupported, current, watch}` | none | Network Information API |
| [sensors](./sensors.md) | `{orientation, motion, gyroscope, accelerometer, requestPermission}` | none | Gyro/accel/orientation |
