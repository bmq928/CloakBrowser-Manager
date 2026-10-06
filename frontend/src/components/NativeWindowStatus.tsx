import { ExternalLink, Monitor, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { CdpEndpointButton } from "./CdpEndpointButton";

interface NativeWindowStatusProps {
  profileName: string;
  cdpUrl: string | null;
  profileId?: string;
  capturePreview?: boolean;
  // Headless profiles have no window at all — swap the copy so the screen
  // doesn't claim a native window is open.
  headless?: boolean;
}

// Native mode has no VNC to embed, so we surface the periodic screenshot the
// backend captures (every ~30s) as a near-live preview of the native window.
const PREVIEW_REFRESH_MS = 15000;

export function NativeWindowStatus({
  profileName,
  cdpUrl,
  profileId,
  capturePreview,
  headless = false,
}: NativeWindowStatusProps) {
  const [buster, setBuster] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);

  const showPreview = Boolean(profileId) && capturePreview !== false;

  useEffect(() => {
    if (!showPreview) return;
    const id = setInterval(() => setBuster(Date.now()), PREVIEW_REFRESH_MS);
    return () => clearInterval(id);
  }, [showPreview]);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-lg rounded-xl border border-border bg-surface-1 p-8 text-center">
        {showPreview && (
          <img
            src={`/api/profiles/${profileId}/screenshot?t=${buster}`}
            onLoad={() => setLoaded(true)}
            alt="Live browser preview"
            className={`mb-6 w-full rounded-lg border border-border ${loaded ? "" : "hidden"}`}
          />
        )}
        {headless ? (
          <Server className="mx-auto mb-4 h-10 w-10 text-accent" />
        ) : (
          <Monitor className="mx-auto mb-4 h-10 w-10 text-accent" />
        )}
        <h2 className="text-lg font-medium text-gray-100">
          {headless ? "Running headless" : "Opened in a native window"}
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          {headless
            ? `${profileName} is running without a visible window. Drive it through Manager CDP.`
            : `${profileName} is running directly on this computer. Use its CloakBrowser window to browse.`}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-gray-500">
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Automation remains available through Manager CDP</span>
          <CdpEndpointButton cdpUrl={cdpUrl} />
        </div>
      </div>
    </div>
  );
}
