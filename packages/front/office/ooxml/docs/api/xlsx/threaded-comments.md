---
module: xlsxThreadedComments
category: ooxml/xlsx
dependencies: [ooxmlErrors, xml, ooxmlShared]
returns: object
worker-safe: true
status: complete
---

# xlsxThreadedComments

> Office 2018+ threaded comments — `xl/threadedComments/` + `xl/persons/person.xml` (a Microsoft extension, outside ECMA-376).

**Module** `xlsxThreadedComments` | **Source** `packages/front/office/ooxml/src/xlsx/threadedComments.js` | **Deps** `ooxmlErrors`, `xml`, `ooxmlShared` | **Worker-safe** yes

Replaces legacy comments with **discussion threads**, **@user mentions** and a **resolved/unresolved** state. It coexists with the legacy model for compatibility. Namespace `…/2018/threadedcomments`.

## Resolve

```js
const tc = runtime.resolve('xlsxThreadedComments');
// Returns: { parseThreadedComments, serializeThreadedComments, threadedCommentsBytes,
//            parsePersons, serializePersons, personsBytes,
//            generateId,
//            TC_NS,
//            REL_TYPE_THREADED_COMMENT, REL_TYPE_PERSON,
//            CT_THREADED_COMMENTS, CT_PERSONS }
```

## API

| Method | Signature | Returns |
|---------|-----------|---------|
| `parseThreadedComments` | `(text\|bytes) => entries[]` | Array of threaded comments. |
| `serializeThreadedComments` | `(entries) => string` | `<ThreadedComments>` XML. |
| `threadedCommentsBytes` | `(entries) => Uint8Array` | UTF-8 bytes. |
| `parsePersons` | `(text\|bytes) => persons[]` | Workbook-wide registry. |
| `serializePersons` | `(persons) => string` | `<personList>` XML. |
| `personsBytes` | `(persons) => Uint8Array` | UTF-8 bytes. |
| `generateId` | `() => '{GUID}'` | RFC 4122 v4 from `crypto.getRandomValues`; without it, throws `xlsx/no-random-source` — pass the comment / person `id` explicitly. |
| `TC_NS`, `REL_TYPE_THREADED_COMMENT`, `REL_TYPE_PERSON`, `CT_THREADED_COMMENTS`, `CT_PERSONS` | string | OPC bindings. |

## Model (sheet level)

```js
sheet.threadedComments: [{
    id: '{GUID}',
    ref: 'A1',
    date: '2024-01-15T10:30:00Z',          // ISO 8601 UTC
    personId: '{GUID}',                    // → workbook.persons[].id
    parentId?: '{GUID}',                   // for replies
    text: string,
    done?: boolean,                        // resolved
    mentions?: [{
        mentionpersonId: '{GUID}',
        mentionId: number,
        startIndex: number, length: number
    }]
}]
```

## Model (workbook level)

```js
workbook.persons: [{
    id: '{GUID}',
    displayName: string,
    userId?: string,
    providerId?: 'AD'|'PeoplePicker'|'None'
}]
```

## Examples

### Thread with a reply

```js
const tc = runtime.resolve('xlsxThreadedComments');
const aliceId = tc.generateId();
const bobId   = tc.generateId();

workbook.persons = [
    { id: aliceId, displayName: 'Alice', providerId: 'None' },
    { id: bobId,   displayName: 'Bob',   providerId: 'None' }
];

const root = tc.generateId();
sheet.threadedComments = [
    { id: root, ref: 'B2', date: '2024-01-15T10:00:00Z',
      personId: aliceId, text: 'Can you confirm this figure?' },
    { id: tc.generateId(), ref: 'B2', date: '2024-01-15T11:00:00Z',
      personId: bobId, parentId: root, text: 'Confirmed.' }
];
```

### Letting the orchestrator resolve the person

```js
// xlsx.write resolves `author: 'Alice'` to a personId when
// `workbook.persons` holds a matching displayName; otherwise it creates the
// entry, patches both the comment and the persons array, and drops `author`.
sheet.threadedComments = [
    { ref: 'B2', date: '2024-01-15T10:00:00Z', author: 'Alice', text: '…' }
];
```

## Notes

- `done: true` closes the thread (the check icon in Excel).
- `parentId` must point at a comment in the **same thread**; no `parentId` means a root comment.
- For iOS and older Excel builds, also emit an equivalent legacy [`xlsx-comments`](./comments.md) entry.
- The `xlsx` orchestrator performs the `author → personId` resolution automatically, appending a new person when the display name is unknown.
- Unexpected roots raise `ParseError('xlsx/threaded-comments-bad-root')` or `ParseError('xlsx/persons-bad-root')`.

## See also

- [xlsx-comments](./comments.md) — legacy comments (they coexist).
- [xlsx](./xlsx.md) — orchestrator (automatic person resolution).
