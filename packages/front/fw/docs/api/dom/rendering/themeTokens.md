---
module: themeTokens
category: dom/rendering
dependencies: [dom]
returns: object
worker-safe: false
status: complete
---

# themeTokens

> CSS design-token manager — definition, variants, light/dark/a11y modes.

**Module** `themeTokens` | **Source** `packages/front/fw/src/dom/rendering/themeTokens.js` | **Deps** `dom` | **Worker-safe** no

Manages the application's CSS Custom Properties via dedicated `<style>` elements per instance (no conflict between multiple instances).
Supports tokens as scalar values or mode variants (`light`, `dark`, `highContrast`, `reducedMotion`),
automatically synchronises with system media queries (`prefers-color-scheme`,
`prefers-contrast`, `prefers-reduced-motion`, `forced-colors`), and exposes ready-to-use presets (`neutral`, `material`, `tailwind`).

Out of scope: theme inheritance / `extends` — that is the responsibility of the `sde_lib_style` loader.

## Resolve

```js
const themeTokens = runtime.resolve('themeTokens');
// Returns: { create, presets }

const theme = themeTokens.create({ prefix: 'fw-', scope: ':root' });
// Returns: { define, mode, current, get, onChange, dispose, applyPreset }
```

## API

### `themeTokens.presets`

Static object exposing three ready-to-use token maps:

| Preset | Description |
|--------|-------------|
| `themeTokens.presets.neutral` | Neutral system-ui palette (spacing, radii, durations, base colours) |
| `themeTokens.presets.material` | Simplified Material Design 3 baseline |
| `themeTokens.presets.tailwind` | Distilled Tailwind slate/blue palette |

### `themeTokens.create(opts?)`

Each call to `create()` produces an **isolated** instance with its own `<style id="data-fw-theme-tokens-N">` — multiple instances coexist without clobbering each other.

| Option | Type | Default | Description |
|--------|------|--------|-------------|
| `scope` | `string \| Element` | `':root'` | CSS selector or target element for the vars. |
| `prefix` | `string` | `''` | Prefix added to all var names (`--<prefix><name>`). |

Returns a `ThemeInstance`:

| Method | Signature | Returns |
|---------|-----------|---------|
| `define` | `(map: Record<string, scalar \| Variant>) => void` | `void` — injects CSS vars |
| `mode` | `('light' \| 'dark' \| 'auto' \| 'high-contrast') => void` | `void` — switches mode |
| `current` | `() => { mode, resolved, reducedMotion }` | Current resolved state |
| `get` | `(name: string) => string` | Active value via `getComputedStyle` |
| `onChange` | `(fn: function) => () => void` | Returns unsubscribe |
| `applyPreset` | `(nameOrMap: string \| Object) => void` | Applies a preset by name or direct token map |
| `dispose` | `() => void` | Detaches listeners, removes the `<style>` |

### Type `Variant`

```ts
type Variant = {
    default?:       string;
    light?:         string;
    dark?:          string;
    highContrast?:  string;
    reducedMotion?: string;
}
```

### `define(map)`

Registers or updates tokens. Values can be scalar (string/number) or `Variant` objects.
Generates the CSS rule `--<prefix><name>: <value>` according to the current resolved mode.

### `mode(name)`

Explicitly switches between `'light'`, `'dark'`, `'high-contrast'`, or `'auto'`.
In `'auto'` mode, the resolved mode follows `prefers-color-scheme` and `prefers-contrast`.
Notifies all listeners registered via `onChange`.

Throws an `Error` if `name` is not a valid value.

### `current()`

Returns the current state:

```ts
{
    mode:         'light' | 'dark' | 'auto' | 'high-contrast',
    resolved:     'light' | 'dark' | 'high-contrast',
    reducedMotion: boolean
}
```

### `get(name)`

Reads the active value of the token `name` via `getComputedStyle`. Returns an empty string if the property does not exist.

### `onChange(fn)`

Registers a callback called on every change (a `mode()` call or a system media-query change).
Returns an `off()` function to unsubscribe.

## Examples

### Basic — scalar tokens

```js
const themeTokens = runtime.resolve('themeTokens');
const theme = themeTokens.create();

theme.define({
    'color-bg':   '#ffffff',
    'color-text': '#111111',
    'spacing-sm': '8px',
});
// Injects into :root { --color-bg: #ffffff; --color-text: #111111; --spacing-sm: 8px; }
```

### Variant tokens

```js
const theme = themeTokens.create({ prefix: 'app-' });

theme.define({
    bg: { light: '#fff', dark: '#1a1a1a', highContrast: '#000' },
    fg: { light: '#111', dark: '#eee',    highContrast: '#fff' },
    duration: { default: '300ms', reducedMotion: '0ms' },
});

theme.mode('dark');
// :root { --app-bg: #1a1a1a; --app-fg: #eee; --app-duration: 300ms; }
```

### Tracking changes

```js
const off = theme.onChange(({ mode, resolved, reducedMotion }) => {
    document.body.dataset.theme = resolved;
    document.body.dataset.motion = reducedMotion ? 'reduced' : 'full';
});

theme.mode('auto'); // follows system preferences

// Later:
off(); // unsubscribe
```

### Cleanup

```js
theme.dispose(); // removes the <style>, detaches all MQ listeners
```

## Notes

- A single `<style id="data-fw-theme-tokens">` element is created in `<head>`; successive calls to `define()` or `mode()` rewrite its entire content.
- The fallback cascade for `highContrast` without an explicit variant is: `highContrast` → `dark` → `light` → `default`.
- `forced-colors: active` (Windows High Contrast) is detected and automatically forces `resolved: 'high-contrast'`, regardless of the configured mode.
- Listeners passed to `onChange` are called on **every** `mode()` call, even if the resolved mode does not change (the caller's explicit intent is honoured).
- `dispose()` should be called when the component unmounts to avoid listener leaks on `MediaQueryList` objects.

## See also

- [dom](../query/dom.md) — low-level DOM manipulation
- [template](./template.md) — elm-array → DOM render engine
- [uiSession](./uiSession.md) — high-level facade
