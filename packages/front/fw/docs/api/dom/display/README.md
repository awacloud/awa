# DOM / Display

Modules for animations and fullscreen mode.

## Modules

| Module | Returns | Deps | Description |
|--------|----------|------|-------------|
| [animate](./animate.md) | `function` | easing | Frame-based animation with easing |
| [fullscreen](./fullscreen.md) | `object` | none | Fullscreen API |

## Common pattern

```js
const animate   = runtime.resolve('animate');
const fullscreen = runtime.resolve('fullscreen');

// Animate a property from 0 to 300 over 500ms with easeOutCubic
animate(500, 'easeOutCubic', { init: 0, end: 300 }, (value) => {
    el.style.transform = `translateX(${value}px)`;
});

// Fullscreen
if (fullscreen.isSupported()) {
    await fullscreen.enter(button);
}
```
