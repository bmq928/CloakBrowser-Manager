import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Profile, type ProfileCreateData } from "../lib/api";

export interface BulkFailure {
  id: string;
  message: string;
  status?: number;
  reason?: string;
  upgradeUrl?: string;
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listProfiles();
      setProfiles(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch profiles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll for status changes every 3 seconds
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const create = useCallback(
    async (data: ProfileCreateData): Promise<Profile | undefined> => {
      try {
        const profile = await api.createProfile(data);
        setProfiles((prev) => [profile, ...prev]);
        return profile;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create profile");
      }
    },
    [],
  );

  const update = useCallback(
    async (id: string, data: Partial<ProfileCreateData>) => {
      try {
        const profile = await api.updateProfile(id, data);
        setProfiles((prev) => prev.map((p) => (p.id === id ? profile : p)));
        return profile;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update profile");
      }
    },
    [],
  );

  // Persist a manual order. Optimistic so the UI updates instantly; the 3s poll
  // then confirms the server order rather than reverting it. Resync on failure.
  const reorder = useCallback(
    async (orderedIds: string[]) => {
      setProfiles((prev) => {
        const byId = new Map(prev.map((p) => [p.id, p]));
        return orderedIds
          .map((id) => byId.get(id))
          .filter((p): p is Profile => p !== undefined);
      });
      try {
        await api.reorderProfiles(orderedIds);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reorder profiles");
        await refresh();
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await api.deleteProfile(id);
        setProfiles((prev) => prev.filter((p) => p.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete profile");
      }
    },
    [],
  );

  const launch = useCallback(
    async (id: string) => {
      // Don't swallow: a launch denial (out of seats, bad/expired key) carries a
      // structured reason + upgrade CTA that LaunchButton renders. Re-throw so it
      // reaches the button's own catch instead of a flat hook-level banner.
      const result = await api.launchProfile(id);
      await refresh();
      return result;
    },
    [refresh],
  );

  const stop = useCallback(
    async (id: string) => {
      try {
        await api.stopProfile(id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to stop profile");
      }
    },
    [refresh],
  );

  // Bulk start/stop, run sequentially (browser boot is heavy; parallel
  // launches hammer the machine) with one refresh at the end. Per-item
  // failures are collected, not thrown — the caller surfaces them.
  const launchMany = useCallback(
    async (ids: string[], onProgress?: (done: number, total: number) => void) => {
      const failed: BulkFailure[] = [];
      let done = 0;
      for (const id of ids) {
        try {
          await api.launchProfile(id);
        } catch (err) {
          failed.push({
            id,
            message: err instanceof Error ? err.message : "Failed to launch profile",
            ...(err instanceof ApiError
              ? { status: err.status, reason: err.reason, upgradeUrl: err.upgradeUrl }
              : {}),
          });
        }
        done += 1;
        onProgress?.(done, ids.length);
      }
      await refresh();
      return failed;
    },
    [refresh],
  );

  const stopMany = useCallback(
    async (ids: string[], onProgress?: (done: number, total: number) => void) => {
      const failed: BulkFailure[] = [];
      let done = 0;
      for (const id of ids) {
        try {
          await api.stopProfile(id);
        } catch (err) {
          failed.push({
            id,
            message: err instanceof Error ? err.message : "Failed to stop profile",
          });
        }
        done += 1;
        onProgress?.(done, ids.length);
      }
      await refresh();
      return failed;
    },
    [refresh],
  );

  // Wipe browser state + re-roll fingerprint. Stays stopped — the profile keeps
  // its config (proxy, locale, bookmarks, default search) and takes a fresh
  // identity; the user launches it when ready.
  const reset = useCallback(
    async (id: string) => {
      try {
        await api.resetProfile(id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reset profile");
      }
    },
    [refresh],
  );

  // Clone a profile into a new profile (same settings + fingerprint). With
  // includeBrowserState the source's cookies, logged-in sessions and history
  // come along too, so the clone opens already signed in. Returns the clone so
  // the caller can select it.
  const duplicate = useCallback(
    async (id: string, includeBrowserState = false): Promise<Profile | undefined> => {
      try {
        const profile = await api.duplicateProfile(id, includeBrowserState);
        setProfiles((prev) => [profile, ...prev]);
        return profile;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to duplicate profile");
      }
    },
    [],
  );

  return { profiles, loading, error, refresh, create, update, remove, reorder, launch, stop, launchMany, stopMany, reset, duplicate };
}
