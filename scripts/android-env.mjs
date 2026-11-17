// Android betikleri için ortak ortam: Capacitor 8'in Gradle 8.14'ü Java 21 ister. Bu Mac'te varsayılan Java 8,
// Android Studio'nun kendi Java'sı 25; ikisiyle de derleme kırılır. Bu yüzden ANDROID_JAVA_HOME verilmemişse
// Homebrew openjdk@21 kullanılır. SDK: ANDROID_HOME ya da ~/Library/Android/sdk (Android Studio'nun varsayılan yeri).
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const javaHome = process.env.ANDROID_JAVA_HOME || "/opt/homebrew/opt/openjdk@21";
export const sdk = process.env.ANDROID_HOME || join(homedir(), "Library", "Android", "sdk");
export const adb = join(sdk, "platform-tools", "adb");
export const emulator = join(sdk, "emulator", "emulator");

export function checkAndroidEnv() {
  if (!existsSync(adb)) {
    console.error(`Android SDK bulunamadı (${sdk}). Android Studio'yu kurup ilk açılış sihirbazını "Standard" ile bitirin.`);
    process.exit(1);
  }
  if (!existsSync(join(javaHome, "bin", "java"))) {
    console.error(`Java 21 bulunamadı (${javaHome}). Terminal'de: brew install openjdk@21`);
    process.exit(1);
  }
}

// Gradle ve Capacitor komutları için ortam değişkenleri.
export const androidEnv = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
