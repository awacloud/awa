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
//   typeScreenAnnot, typeMediaDict, MEDIA_KINDS, SOUND_MODES,
//   MOVIE_OP_MODES }
```

## API

| Member | Signature | Returns |
|--------|-----------|---------|
| `typeSoundAnnot` | `(dict) => SoundAnnot` | `{ subtype: 'Sound', sound, iconName?, raw, _extras }`. |
| `typeSoundStream` | `(stream) => { samplingRate?, channels?, bitsPerSample?, encoding?, compression?, mode?, type?, length?, filter?, decodeParms?, raw, _extras }` | `/Sound` stream payload. |
| `typeMovieAnnot` | `(dict) => MovieAnnot` | `{ subtype: 'Movie', movie, title?, activation?, raw, _extras }`. |
| `typeScreenAnnot` | `(dict) => ScreenAnnot` | `{ subtype: 'Screen', title?, mk?, action?, additionalActions?, page?, raw, _extras }`. |
| `typeMediaDict` | `(dict, kind) => object` | One multimedia dictionary of `kind` (a key of `MEDIA_KINDS`): one field per key of the kind's table, present only when the key is — a name, string, integer, number or boolean by its value (`null` for a value of another type), a dictionary, array, stream or reference as read — plus `raw` (the dictionary) and `_extras` (the other keys). No default is filled in (the ISO defaults depend on the MH / BE context). |
| `MEDIA_KINDS` | frozen object | Kind → `{ key: [field, read] }` (`read`: `name`, `text`, `int`, `num`, `bool`, `raw`); the kinds below. |
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

### A rendition and its media clip

```js
const r = ext.typeMediaDict(renditionDict, 'Rendition');
r.subtype;          // 'MR' (media rendition) or 'SR' (selector)
r.clip;             // the /C media clip, as read (a reference or a dictionary)
const clip = ext.typeMediaDict(clipDict, 'MediaClipData');
clip.contentType;   // the /CT bytes, e.g. 'video/mp4'
```

### Media kinds

The kinds follow the dictionaries of ISO 32000-2 § 13.2 (multimedia) and, for the two movie kinds, ISO 32000-1 § 13.4.

| Kind | Dictionary | Fields |
|------|------------|--------|
| `Rendition` | media and selector renditions | `type`, `subtype`, `name`, `mustHonor`, `bestEffort`, `clip`, `playParameters`, `screenParameters`, `renditions` |
| `RenditionMHBE` | a rendition's MH / BE | `criteria` |
| `MediaClipData` | media clip data | `type`, `subtype`, `name`, `data`, `contentType`, `permissions`, `alt`, `players`, `mustHonor`, `bestEffort` |
| `MediaClipDataMHBE` | its MH / BE | `baseUrl` |
| `MediaClipSection` | media clip section | `type`, `subtype`, `name`, `clip`, `alt`, `mustHonor`, `bestEffort` |
| `MediaClipSectionMHBE` | its MH / BE | `begin`, `end` |
| `MediaCriteria` | media criteria | `type`, `audioDescriptions`, `captions`, `overdubs`, `subtitles`, `bitrate`, `bitDepth`, `screenSize`, `viewers`, `pdfVersions`, `languages` |
| `MediaDuration` | media duration | `type`, `subtype`, `timespan` |
| `MediaOffset` | time, frame and marker offsets | `type`, `subtype`, `timespan`, `frame`, `marker` |
| `MediaPermissions` | media permissions | `type`, `tempFile` |
| `MediaPlayParameters` | media play parameters | `type`, `players`, `mustHonor`, `bestEffort` |
| `MediaPlayParametersMHBE` | their MH / BE | `volume`, `showControls`, `fit`, `duration`, `autoPlay`, `repeatCount` |
| `MediaPlayerInfo` | media player info | `type`, `softwareIdentifier`, `mustHonor`, `bestEffort` |
| `MediaPlayers` | media players | `type`, `mustUse`, `available`, `notUsed` |
| `MediaScreenParameters` | media screen parameters | `type`, `mustHonor`, `bestEffort` |
| `MediaScreenParametersMHBE` | their MH / BE | `windowType`, `background`, `opacity`, `monitor`, `floatingWindow` |
| `MinimumScreenSize` | minimum screen size | `type`, `size`, `monitor` |
| `SoftwareIdentifier` | software identifier | `type`, `uri`, `lowVersion`, `lowInclusive`, `highVersion`, `highInclusive`, `os` |
| `Movie` | movie | `file`, `aspect`, `rotate`, `poster` |
| `MovieActivation` | movie activation | `start`, `duration`, `rate`, `volume`, `showControls`, `mode`, `synchronous`, `fwScale`, `fwPosition` |

## Errors

| Code | Class | When |
|------|-------|------|
| `pdf/legacy-annot/not-dict` | `ParseError` | Argument is not a dictionary. |
| `pdf/legacy-annot/media-not-dict` | `ParseError` | `typeMediaDict`: the argument is not a dictionary. |
| `pdf/legacy-annot/media-kind` | `ContractError` | `typeMediaDict`: `kind` is not a key of `MEDIA_KINDS`. |
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
