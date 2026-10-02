# Android release signing

Android only installs an update if it is signed with the same key as the version already on the phone. NightReader's release builds are signed in GitHub Actions with a key that you create and keep. The key never goes into the repository.

## One-time setup (Windows, about 5 minutes)

1. In the project folder, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\new-android-keystore.ps1
   ```

   The script:
   - creates the key in `Documents\NightReader-signing\nightreader-release.p12` (RSA 4096, valid for 30 years)
   - shows the certificate's SHA-256 fingerprint and saves it next to the key
   - opens GitHub's *New repository secret* page and puts each value on your clipboard in turn, so you only paste

   If it says Java is missing, run `winget install --id Microsoft.OpenJDK.21 -e`, open a new PowerShell window and run the script again.

2. Add these three secrets (Settings → Secrets and variables → Actions):

   | Name | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | the key file, base64-encoded (the script copies it) |
   | `ANDROID_KEYSTORE_PASSWORD` | the password you chose |
   | `ANDROID_KEY_ALIAS` | `nightreader` |

3. **Back up the key.** Copy the `NightReader-signing` folder to two USB drives kept in different places, and save the password in a password manager.
   - If the key is lost, existing installs can never be updated. Everyone would have to uninstall and reinstall, losing their notes unless they had a backup.
   - If the key leaks, someone else could publish an "update" that phones accept. In that case, rotate the key (see below) and tell users.

## What happens on each release

When a `v*` tag is published, the **Build Android** workflow does the following:
- decodes the key into a temporary file on the build machine (readable only by the build user)
- builds the release APK and AAB, signed with it
- checks the signature with `apksigner`, fails if a debug key was used, and writes the certificate fingerprint to the job summary
- deletes the key file, even if a step failed
- attaches `NightReader_<version>_android.apk` to the GitHub release

The `.aab` is kept as a build artifact; it is only needed for Google Play.

If the secrets are missing, the job stops with a message saying so. Add them, then use **Re-run jobs** on that run.

On pull requests, a separate check builds a release APK with a throwaway key made inside the run. This proves the signing setup works without ever using the real key.

## Certificate fingerprint

The SHA-256 fingerprint identifies the key. It must be the same in every release. Paste it here after the first signed release, so anyone can check a download:

```
(add after the first signed release)
```

To check an APK on a PC with the Android SDK installed:
`apksigner verify --print-certs NightReader_0.8.0_android.apk`

## Installing the APK on a phone

1. Download `NightReader_<version>_android.apk` from the release page on the phone.
2. Open it. Android asks you to allow installs from that app (your browser or Files). Allow it for this install.
3. Updates install over the old version and keep your library and notes, as long as they are signed with the same key.

If NightReader was installed from an earlier test (debug) build, Android refuses the update because the key differs. Make a backup (Settings → Backup), uninstall, install the release, then restore the backup.

## Google's developer verification

Google now requires apps installed outside Google Play on certified Android phones to come from a verified developer.
- **Where it applies:** since 30 September 2026, enforcement covers Brazil, Indonesia, Singapore and Thailand. Global rollout, including the UK, is planned for 2027.
- **What to do before then:** register as a developer in the Android Developer Console. Then register the package name `com.nightreader.app` and this key's certificate.
- **Testing account:** a free "limited distribution" account covers up to 20 devices, which is enough for testing.
- **Without registration:** phones can still install the app through Android's "advanced flow" (a one-off 24-hour wait in Developer options) or with ADB.

## Publishing on Google Play later

Upload the `.aab` and turn on Play App Signing. This key then becomes your *upload key*, and Google keeps the key that signs the copies users download. If the upload key is ever lost, Google can reset it.

## Rotating the key

Android supports key rotation through APK Signature Scheme v3. A new key can be introduced with a proof signed by the old one, so existing installs keep updating. This needs the old key, which is one more reason to back it up.
