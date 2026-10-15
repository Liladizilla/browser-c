const RISKY_EXTENSIONS = new Map([
  ["apk", "Android application package"],
  ["appx", "Windows application package"], ["appxbundle", "Windows application bundle"],
  ["bat", "Windows batch script"], ["cmd", "Windows command script"],
  ["com", "Windows executable"], ["deb", "Linux software package"],
  ["dll", "Windows library"], ["dmg", "macOS disk image"],
  ["exe", "Windows executable"], ["hta", "Windows HTML application"],
  ["jar", "Java executable archive"], ["js", "JavaScript file that may be run by a host application"],
  ["jse", "Windows script"], ["msi", "Windows installer"], ["msp", "Windows installer patch"],
  ["msix", "Windows application package"], ["pkg", "macOS installer package"],
  ["ps1", "PowerShell script"], ["reg", "Windows Registry script"],
  ["rpm", "Linux software package"], ["scf", "Windows shell command file"],
  ["scr", "Windows screensaver executable"], ["sh", "shell script"],
  ["sys", "system driver"], ["vbe", "Windows script"], ["vbs", "Windows script"],
  ["wsf", "Windows script"], ["wsh", "Windows script"], ["xll", "Excel add-in that can contain executable code"]
]);

/** Returns a plain-language warning category for file types that can execute code or alter a system. */
export function downloadSafetyWarning(filename) {
  if (typeof filename !== "string" || !filename.trim()) return null;
  const basename = filename.trim().split(/[\\/]/).pop() || "";
  const match = /\.([a-z0-9]{1,16})$/i.exec(basename);
  if (!match) return null;
  return RISKY_EXTENSIONS.get(match[1].toLowerCase()) ?? null;
}
