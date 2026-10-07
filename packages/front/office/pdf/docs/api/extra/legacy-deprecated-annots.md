---
module: pdfLegacyDeprecatedAnnots
category: pdf/extra
dependencies: [pdfErrors]
returns: object
worker-safe: true
status: complete
---

# pdfLegacyDeprecatedAnnots

> Sound (§12.5.6.16), Movie (§12.5.6.17), Screen (§12.5.6.18) — legacy.

**Module** `pdfLegacyDeprecatedAnnots` | **Source** `packages/front/office/pdf/src/extra/legacy-deprecated-annots.js` | **Deps** `pdfErrors` | **Worker-safe** yes

Typed payloads for the multimedia subtypes that PDF 2.0 deprecates in favour of `/RichMedia` and the `/Screen` + `/Rendition` pattern:
- `/Subtype /Sound` (ISO 32000-1 §12.5.6.16): `/Sound` stream, `/Name` icon.
- `/Subtype /Movie` (§12.5.6.17): `/Movie` dict, `/A` activation, `/T` title.
- `/Subtype /Screen` (§12.5.6.18): `/MK` appearance, `/A` rendition action, `/AA` additional actions.

## Resolve

```js
const ext = runtime.resolve('pdfLegacyDeprecatedAnnots');
// Returns: { typeSoundAnnot, typeSoundStream, typeMovieAnnot,
//   typeScreenAnnot, SOUND_MODES, MOVIE_OP_MODES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeSoundAnnot` | `(dict) => SoundAnnot` | `{ subtype: 'Sound', sound, iconName?, raw, _extras }`. |
| `typeSoundStream` | `(stream) => { samplingRate?, channels?, bitsPerSample?, encoding?, compression?, mode?, raw, _extras }` | `/Sound` stream payload. |
| `typeMovieAnnot` | `(dict) => MovieAnnot` | `{ subtype: 'Movie', movie, title?, activation?, raw, _extras }`. |
| `typeScreenAnnot` | `(dict) => ScreenAnnot` | `{ subtype: 'Screen', title?, mk?, action?, additionalActions?, page?, raw, _extras }`. |
| `SOUND_MODES` | `Set` | `Mono`, `Stereo`. |
| `MOVIE_OP_MODES` | `Set` | `Once`, `Open`, `Repeat`, `Palindrome`. |

## Examples

### Sound

```js
const ext = runtime.resolve('pdfLegacyDeprecatedAnnots');
const s = ext.typeSoundAnnot(annot);
s.sound;      // stream ref
s.iconName;   // 'Speaker'
```

### Movie

```js
const m = ext.typeMovieAnnot(annot);
m.activation.mode;  // 'Once' (when /A is a dict with /Mode)
```

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/legacy-annot/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/legacy-annot/bad-subtype` | `ParseError` | Subtype is not Sound/Movie/Screen. |
| `pdf/legacy-annot/sound-missing` | `ParseError` | `/Sound` absent. |
| `pdf/legacy-annot/sound-bad-stream` | `ParseError` | `/Sound` is not a stream or ref. |
| `pdf/legacy-annot/sound-bad-name` | `ParseError` | `/Name` is not a name. |
| `pdf/legacy-annot/sound-stream` | `ParseError` | Sound payload is not a stream. |
| `pdf/legacy-annot/sound-bad-R` | `ParseError` | `/R` is not numeric. |
| `pdf/legacy-annot/sound-bad-C` | `ParseError` | `/C` is not numeric. |
| `pdf/legacy-annot/sound-bad-B` | `ParseError` | `/B` is not numeric. |
| `pdf/legacy-annot/sound-bad-E` | `ParseError` | `/E` is not a name. |
| `pdf/legacy-annot/sound-bad-CO` | `ParseError` | `/CO` is not a name. |
| `pdf/legacy-annot/sound-bad-mode` | `ParseError` | Mode outside `SOUND_MODES`. |
| `pdf/legacy-annot/movie-missing` | `ParseError` | `/Movie` absent. |
| `pdf/legacy-annot/movie-bad` | `ParseError` | `/Movie` is not a dict. |
| `pdf/legacy-annot/movie-bad-T` | `ParseError` | `/T` is not a string. |
| `pdf/legacy-annot/movie-bad-A` | `ParseError` | `/A` is neither bool nor dict. |
| `pdf/legacy-annot/movie-bad-mode` | `ParseError` | Mode outside `MOVIE_OP_MODES`. |
| `pdf/legacy-annot/screen-bad-T` | `ParseError` | `/T` is not a string. |
| `pdf/legacy-annot/screen-bad-MK` | `ParseError` | `/MK` is not a dict. |
| `pdf/legacy-annot/screen-bad-A` | `ParseError` | `/A` is not a dict. |
| `pdf/legacy-annot/screen-bad-AA` | `ParseError` | `/AA` is not a dict. |
| `pdf/legacy-annot/screen-bad-P` | `ParseError` | `/P` is neither ref nor dict. |

## See also

- [`pdfAnnot`](../annot/annot.md)
- [`pdf3dRichMedia`](./3d-richmedia.md)
- [Extras index](./README.md)
