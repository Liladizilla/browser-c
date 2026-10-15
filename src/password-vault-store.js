export async function loadEncryptedPasswordVault({
  filePath,
  safeStorage,
  readFile,
  backendAvailable,
  maxEntries = 500
}) {
  if (!backendAvailable()) {
    return {
      available: false,
      entries: [],
      error: "Secure OS-backed password storage is unavailable. No password data was changed."
    };
  }

  let encrypted;
  try {
    encrypted = await readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return { available: true, entries: [], error: "" };
    return {
      available: false,
      entries: [],
      error: "The password vault file could not be read. The existing file was preserved; saving is disabled."
    };
  }

  let entries;
  try {
    entries = JSON.parse(safeStorage.decryptString(encrypted));
  } catch {
    return {
      available: false,
      entries: [],
      error: "The password vault could not be decrypted or is damaged. The existing vault file was preserved; saving is disabled to prevent data loss."
    };
  }

  if (!Array.isArray(entries) || entries.some((entry) =>
    !entry || typeof entry.id !== "string" || typeof entry.origin !== "string" ||
    typeof entry.username !== "string" || typeof entry.password !== "string"
  )) {
    return {
      available: false,
      entries: [],
      error: "The password vault contains invalid data. The existing vault file was preserved; saving is disabled to prevent data loss."
    };
  }

  return { available: true, entries: entries.slice(0, maxEntries), error: "" };
}
