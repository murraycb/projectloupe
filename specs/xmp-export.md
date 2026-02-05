# XMP Sidecar Export — Interaction Spec

## Purpose
Export culling annotations (flags, ratings, color labels) as Lightroom-compatible .xmp sidecar files alongside the original RAW files.

## Scope
- New Rust command: `export_xmp_sidecars`
- Frontend: Cmd+K palette action + double confirmation dialog
- No new dependencies (XMP is just XML text)

## XMP Field Mapping (verified against Lightroom Classic 15.1.1 output)

| ProjectLoupe | XMP Field(s) | Values |
|---|---|---|
| rating 1-5 | `xmp:Rating` | 1-5 (omit attribute when 0) |
| flag: pick | `xmpDM:pick` + `xmpDM:good` | `pick="1"` + `good="true"` |
| flag: reject | `xmpDM:pick` + `xmpDM:good` | `pick="-1"` + `good="false"` |
| flag: none | `xmpDM:pick` | `pick="0"` (omit `good`) |
| colorLabel: red | `xmp:Label` + `photoshop:LabelColor` | `"Red"` / `"red"` |
| colorLabel: yellow | `xmp:Label` + `photoshop:LabelColor` | `"Yellow"` / `"yellow"` |
| colorLabel: green | `xmp:Label` + `photoshop:LabelColor` | `"Green"` / `"green"` |
| colorLabel: blue | `xmp:Label` + `photoshop:LabelColor` | `"Blue"` / `"blue"` |
| colorLabel: purple | `xmp:Label` + `photoshop:LabelColor` | `"Purple"` / `"purple"` |
| colorLabel: none | — | omit both attributes |

### Key findings from Lightroom reference XMPs:
- **Rating and pick/reject are independent.** A rejected image keeps its star rating. `xmp:Rating` is stars only.
- **Pick/reject uses `xmpDM` namespace** (DynamicMedia), not `xmp:Rating = -1` as commonly assumed.
- **Color labels are dual-encoded**: `xmp:Label` (capitalized) and `photoshop:LabelColor` (lowercase).
- **`photoshop:SidecarForExtension`** should be set to the original file's extension (e.g., "NEF").

### Required namespaces:
```
xmlns:xmp="http://ns.adobe.com/xap/1.0/"
xmlns:xmpDM="http://ns.adobe.com/xmp/1.0/DynamicMedia/"
xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
```

## Interaction Flow

1. User triggers export via Cmd+K → "Export XMP Sidecars"
2. **First dialog**: "This will write .xmp sidecar files for N annotated images to [folder path]. Only images with ratings, flags, or color labels will be exported."
   - [Cancel] [Continue]
3. **Second dialog**: "⚠️ WARNING: This will overwrite any existing .xmp sidecar files in this directory. This cannot be undone."
   - [Cancel] [Export Sidecars]
4. Rust backend writes .xmp files
5. **Success toast**: "Wrote N XMP sidecar files to [folder]"
6. **Error handling**: If any files fail, show "Wrote N of M files. K files failed." with error details in console.

## XMP File Format

Filename: `{original_stem}.xmp` (e.g., `DSC_1234.xmp` for `DSC_1234.NEF`)
Location: Same directory as the original image file.

Minimal template (rating 3, pick, Red label on a NEF):
```xml
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:xmpDM="http://ns.adobe.com/xmp/1.0/DynamicMedia/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
   xmp:Rating="3"
   xmp:Label="Red"
   photoshop:LabelColor="red"
   photoshop:SidecarForExtension="NEF"
   xmpDM:good="true"
   xmpDM:pick="1">
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
```

Minimal template (reject, no rating, no label):
```xml
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:xmpDM="http://ns.adobe.com/xmp/1.0/DynamicMedia/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
   photoshop:SidecarForExtension="NEF"
   xmpDM:good="false"
   xmpDM:pick="-1">
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
```

## Behavioral Notes

- Only writes sidecars for images with at least one annotation (rating > 0, flag != none, or colorLabel != none)
- Rating and flag are independent — a rejected image with 3 stars writes both `Rating="3"` and `pick="-1"`
- If image has rating 0 + flag none + label none → no sidecar written
- Does NOT read/merge existing sidecars — full overwrite (v1 simplicity)
- Folder path comes from the image's own file path (dirname), not a single root folder
- `photoshop:SidecarForExtension` derived from original file extension (uppercase, no dot)

## Systems Affected

- **Rust backend**: New `export_xmp_sidecars` command (reads from session_db, writes .xmp files)
- **Store**: New `exportXmpSidecars` action (calls Rust command)
- **CommandPalette**: New "Export XMP Sidecars" entry
- **App.tsx**: Double-confirm dialog flow before invoking export

## What This Does NOT Change
- No changes to grid rendering, navigation, or selection
- No changes to mutation scoping
- No changes to keyboard shortcuts
