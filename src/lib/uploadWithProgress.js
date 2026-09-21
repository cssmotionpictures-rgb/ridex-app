import { appParams } from "@/lib/app-params";

/**
 * Uploads a file with real byte-level upload progress.
 *
 * Primary: Base44 Core UploadFile (permanent storage) — resumes automatically
 * when integration credits reset (2026-09-01).
 * Fallback: tmpfiles.org (CORS-friendly, no key, 60-min expiry) so uploads
 * keep working in-browser while credits are frozen. The returned shape is
 * always { file_url } so every consumer keeps working unchanged.
 */
export function uploadFileWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const { appId, token } = appParams;
    const url = `/api/apps/${appId}/integration-endpoints/Core/UploadFile`;
    const fd = new FormData();
    fd.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Upload failed: bad response"));
        }
      } else {
        // Core UploadFile is unavailable (credit freeze / 402) — fall back to
        // the in-browser tmpfiles.org host so the upload still completes.
        uploadFileToTmpfiles(file, onProgress).then(resolve, reject);
      }
    };
    xhr.onerror = () => uploadFileToTmpfiles(file, onProgress).then(resolve, reject);
    xhr.send(fd);
  });
}

// tmpfiles.org: CORS-friendly, no API key, 100MB max, ~60-min expiry.
// Returns { file_url } using the direct-download (/dl/) path so the URL can be
// embedded in <img>/<video>/fetch without the viewer wrapper page.
// Also exported standalone: the AI Master hands its .wav blob to tmpfiles when
// a sandboxed preview frame blocks the normal blob download (the ".bin" case).
export function uploadFileToTmpfiles(file, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://tmpfiles.org/api/v1/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          const viewer = data?.data?.url || "";
          if (!viewer) throw new Error("No URL in tmpfiles response");
          // https://tmpfiles.org/<id>/<name>  ->  https://tmpfiles.org/dl/<id>/<name>
          const direct = viewer.replace(
            "https://tmpfiles.org/",
            "https://tmpfiles.org/dl/"
          );
          resolve({ file_url: direct, provider: "tmpfiles", expires_in_minutes: 60 });
        } catch (e) {
          reject(new Error("Upload failed: " + (e.message || "bad tmpfiles response")));
        }
      } else {
        reject(new Error(`Upload failed (tmpfiles ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed: tmpfiles unreachable"));
    xhr.send(fd);
  });
}