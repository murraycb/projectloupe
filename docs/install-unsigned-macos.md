# Installing ProjectLoupe (Alpha) on macOS

ProjectLoupe is currently unsigned alpha software. macOS will block it by default — here's how to open it.

## Installation

1. **Open the .dmg file** — double-click `ProjectLoupe_x.x.x_aarch64.dmg`
2. **Drag ProjectLoupe to Applications** (or wherever you'd like)
3. **Eject the .dmg** — right-click the mounted disk on your desktop → Eject

## First Launch

macOS will block the app the first time you try to open it. There are two ways to get past this:

### Option A: Right-Click → Open (simplest)

1. **Right-click** (or Control-click) on ProjectLoupe in your Applications folder
2. Select **Open** from the context menu
3. A dialog will say the app is from an unidentified developer — click **Open**
4. You only need to do this once. After that it opens normally.

### Option B: System Settings

If Option A doesn't show the Open button:

1. Try to open ProjectLoupe normally (it will be blocked)
2. Go to **System Settings → Privacy & Security**
3. Scroll down — you'll see a message: *"ProjectLoupe was blocked from use because it is not from an identified developer"*
4. Click **Open Anyway**
5. Enter your password when prompted
6. Click **Open** in the confirmation dialog

## Apple Silicon Note

This build is for Apple Silicon Macs (M1/M2/M3/M4). If you're on an Intel Mac, let us know and we'll provide an x86 build.

## ⚠️ Alpha Software Warning

This is early alpha software. **Do not use it on real client directories.**

- Work on copies of your files, not originals
- XMP sidecar export will overwrite existing sidecars — use with caution
- Expect bugs — please report them!

## Troubleshooting

**"App is damaged and can't be opened"**
Run this in Terminal, then try opening again:
```
xattr -cr /Applications/ProjectLoupe.app
```

**App won't launch at all**
Make sure you're on macOS 13 (Ventura) or later. Check Console.app for crash logs and send them our way.
