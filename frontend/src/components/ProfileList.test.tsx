import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { ProfileList } from "./ProfileList";
import type { Profile } from "../lib/api";

function makeProfile(overrides: Partial<Profile> & { id: string; name: string }): Profile {
  return {
    fingerprint_seed: 1,
    proxy: null,
    timezone: null,
    locale: null,
    screen_width: 1920,
    screen_height: 1080,
    gpu_family: "auto",
    humanize: false,
    human_preset: "default",
    geoip: false,
    clipboard_sync: false,
    auto_launch: false,
    color_scheme: null,
    launch_args: [],
    extension_paths: [],
    allow_3p_cookies: false,
    set_google_default: false,
    capture_preview: false,
    restore_session: false,
    notes: null,
    user_data_dir: "/tmp/x",
    created_at: "",
    updated_at: "",
    sort_order: 0,
    tags: [],
    status: "stopped",
    runtime_mode: "docker",
    viewer_mode: "vnc",
    vnc_ws_port: null,
    cdp_url: null,
    last_error: null,
    ...overrides,
  };
}

const profiles = [
  makeProfile({ id: "a", name: "Alpha" }),
  makeProfile({ id: "b", name: "Bravo", tags: [{ tag: "work", color: "#ff0000" }] }),
  makeProfile({ id: "c", name: "Charlie", status: "running" }),
  makeProfile({ id: "d", name: "Delta" }),
];

function Harness({
  onSelectionChange,
  onBulkStart,
  onBulkStop,
}: {
  onSelectionChange?: (ids: string[], focused: string | null) => void;
  onBulkStart?: (ids: string[]) => void;
  onBulkStop?: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  return (
    <ProfileList
      profiles={profiles}
      selectedId={focused}
      selectedIds={ids}
      onSelectionChange={(next, f) => {
        setIds(next);
        setFocused(f);
        onSelectionChange?.(next, f);
      }}
      onNew={() => {}}
      onReorder={() => {}}
      onBulkStart={(startIds) => onBulkStart?.(startIds)}
      onBulkStop={(stopIds) => onBulkStop?.(stopIds)}
      bulkBusy={null}
      bulkError={null}
    />
  );
}

describe("ProfileList multi-select", () => {
  it("plain click selects one profile", () => {
    const onSelectionChange = vi.fn();
    render(<Harness onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getByText("Bravo"));
    expect(onSelectionChange).toHaveBeenCalledWith(["b"], "b");
  });

  it("shift+click selects the visible range from the anchor", () => {
    const onSelectionChange = vi.fn();
    render(<Harness onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByText("Charlie"), { shiftKey: true });
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a", "b", "c"], "c");
  });

  it("ctrl+click toggles individual profiles", () => {
    const onSelectionChange = vi.fn();
    render(<Harness onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByText("Charlie"), { ctrlKey: true });
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a", "c"], "c");
    fireEvent.click(screen.getByText("Alpha"), { ctrlKey: true });
    expect(onSelectionChange).toHaveBeenLastCalledWith(["c"], "c");
  });

  it("bulk bar shows counts and starts/stops the actionable subset", () => {
    const onBulkStart = vi.fn();
    const onBulkStop = vi.fn();
    render(<Harness onBulkStart={onBulkStart} onBulkStop={onBulkStop} />);
    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByText("Charlie"), { shiftKey: true });

    expect(screen.getByText("3 selected")).toBeTruthy();
    // Alpha + Bravo stopped, Charlie running
    fireEvent.click(screen.getByText("Start (2)"));
    expect(onBulkStart).toHaveBeenCalledWith(["a", "b"]);
    fireEvent.click(screen.getByText("Stop (1)"));
    expect(onBulkStop).toHaveBeenCalledWith(["c"]);
  });

  it("search still matches tags", () => {
    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText("Search profiles or tags..."), {
      target: { value: "work" },
    });
    expect(screen.queryByText("Bravo")).toBeTruthy();
    expect(screen.queryByText("Alpha")).toBeNull();
  });
});
