---
module: media
category: dom/query
dependencies: []
returns: object
worker-safe: false
status: complete
---

# media

> Browser media access — audio/video/screen capture, device enumeration, active stream management.

**Module** `media` | **Source** `packages/front/fw/src/dom/query/media.js` | **Deps** none | **Worker-safe** no

## Resolve

```js
const media = runtime.resolve('media');
// Returns: { isSupported, permissions, devices, audio, video, screen, streams, select, selected }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `isSupported` | `() => { audio, video, screen }` | Available capabilities |
| `permissions` | `() => { audio, video }` | Inferred from device labels |
| `devices.refresh` | `() => Promise<{ audio[], video[] }>` | Up-to-date device list |
| `devices.list` | `() => { audio[], video[] }` | Current cache |
| `audio.start` | `(opts?) => Promise<StreamHandle>` | Microphone stream |
| `video.start` | `(opts?) => Promise<StreamHandle>` | Camera stream |
| `screen.start` | `(opts?) => Promise<StreamHandle>` | Screen capture stream |
| `streams.stopAll` | `() => void` | Stops all streams |
| `select` | `(type, deviceId) => void` | Saves the preferred device |
| `selected` | `() => { audio, video }` | Saved devices |
| `dispose` | `() => void` | Stops everything, detaches listeners, clears caches |

### Capabilities

```js
const caps = media.isSupported();
// → { audio: boolean, video: boolean, screen: boolean }

const perms = media.permissions();
// → { audio: boolean, video: boolean }
// Inferred from the presence of labels on devices (not a native permissions API)
```

### Devices — `devices`

```js
// Refresh the list (permission must be granted to get labels)
await media.devices.refresh();

// Read
const all = media.devices.list();    // → { audio: MediaDeviceInfo[], video: MediaDeviceInfo[] }
const mics = media.devices.audio();  // → MediaDeviceInfo[]
const cams = media.devices.video();  // → MediaDeviceInfo[]

// Listen for changes (connect/disconnect)
media.devices.listen.add('myListener', ({ audio, video }) => {
    console.log('devices updated');
});
media.devices.listen.del('myListener');
```

The list is automatically refreshed after a successful `start()` and on the `devicechange` event.

### Audio capture — `audio.start(opts?)`

```js
const handle = await media.audio.start({
    deviceId?: string,          // microphone ID (from devices.audio())
    sampleRate?: number,        // e.g. 44100, 48000
    sampleSize?: number,        // e.g. 16
    channelCount?: number,      // 1 = mono, 2 = stereo
    echoCancellation?: boolean,
    noiseSuppression?: boolean,
    autoGainControl?: boolean
});
```

### Video capture — `video.start(opts?)`

```js
const handle = await media.video.start({
    deviceId?: string,
    width?: number | { ideal: number },    // e.g. 1280 or { ideal: 1280 }
    height?: number | { ideal: number },   // e.g. 720
    frameRate?: number | { ideal: number, max: number },
    aspectRatio?: number,
    facingMode?: 'user' | 'environment'
});
```

### Screen capture — `screen.start(opts?)`

```js
const handle = await media.screen.start({
    frameRate?: number | { ideal: number },
    cursor?: 'always' | 'motion' | 'never',
    width?: number,
    height?: number,
    audio?: boolean   // include system audio
});
```

### `StreamHandle` — object returned by `start()`

```js
{
    id: string,                     // MediaStream.id
    type: 'audio' | 'video' | 'screen',
    stream: MediaStream,            // native stream
    tracks: MediaStreamTrack[],
    settings: MediaTrackSettings[], // applied parameters
    constraints: MediaTrackConstraints[],
    stop(): void                    // stops tracks and removes from registry
}
```

### Active streams — `streams`

```js
media.streams.list()                 // → StreamHandle[]
media.streams.get(id)                // → StreamHandle | null
media.streams.byType('video')        // → StreamHandle[]
media.streams.stop(id)               // → void
media.streams.stopAll()              // → void
media.streams.stopType('audio')      // → void
```

### Device selection memory

```js
media.select('audio', deviceId);  // saves the choice for the next start()
media.selected();                 // → { audio: string|null, video: string|null }
```

### Global cleanup — `dispose()`

```js
media.dispose();
// Stops all active streams, detaches the devicechange listener,
// clears device caches and named listeners. Safe to call multiple times.
```

## Examples

### Complete — camera with stop

```js
const media  = runtime.resolve('media');
const events = runtime.resolve('events');

// Check support
const caps = media.isSupported();
if (!caps.video) {
    console.error('Camera not available');
    return;
}

// List cameras
await media.devices.refresh();
const cameras = media.devices.video();
console.log('Available cameras:', cameras.map(d => d.label));

// Start capture
const handle = await media.video.start({ width: 1280, height: 720 });
videoElement.srcObject = handle.stream;
videoElement.play();

// Stop
events.on('stopBtn', stopBtn, 'click', () => handle.stop());
```

## Notes

- Device labels are masked until a permission is granted via `start()`.
- The list is automatically updated after each `start()` and on `devicechange`.
- Screen streams are automatically removed from the registry when the user clicks "Stop sharing".
- `dispose()` stops all streams, detaches the `devicechange` listener, and clears caches and named listeners. Idempotent.

## See also

- [dom](./dom.md), [events](./events.md)
- [fullscreen](../display/fullscreen.md)
