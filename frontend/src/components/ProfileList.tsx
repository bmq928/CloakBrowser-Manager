import { Plus, Search, Monitor, Tag, Play, Square, Loader2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Profile } from "../lib/api";
import { StatusIndicator } from "./StatusIndicator";

interface ProfileListProps {
  profiles: Profile[];
  selectedId: string | null;
  selectedIds: string[];
  onSelectionChange: (ids: string[], focusedId: string | null) => void;
  onNew: () => void;
  onReorder: (orderedIds: string[]) => void;
  onBulkStart: (ids: string[]) => void;
  onBulkStop: (ids: string[]) => void;
  bulkBusy: string | null;
  bulkError: string | null;
}

interface RowClick {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

interface RowProps {
  profile: Profile;
  index: number;
  selected: boolean;
  focused: boolean;
  showFocusRing: boolean;
  draggable: boolean;
  onRowClick: (e: RowClick, id: string, index: number) => void;
  onTagClick: (tag: string) => void;
}

function SortableProfileRow({ profile, index, selected, focused, showFocusRing, draggable, onRowClick, onTagClick }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: profile.id, disabled: !draggable });

  return (
    <button
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(e) => onRowClick(e, profile.id, index)}
      {...attributes}
      {...listeners}
      className={`w-full text-left px-3 py-2.5 rounded-md mb-1 transition-colors ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${isDragging ? "opacity-50" : ""} ${
        selected
          ? "bg-surface-3 border border-border-hover"
          : "hover:bg-surface-2 border border-transparent"
      } ${showFocusRing && focused ? "ring-1 ring-accent" : ""}`}
    >
      <div className="flex items-center gap-2">
        <StatusIndicator status={profile.status} />
        <span className="text-sm font-medium truncate">{profile.name}</span>
      </div>
      <div className="flex items-center gap-2 mt-1 ml-4">
        {profile.proxy && <span className="text-xs text-gray-500">Proxy</span>}
      </div>
      {(profile.tags ?? []).length > 0 && (
        <div className="flex gap-1 mt-1.5 ml-4 flex-wrap">
          {(profile.tags ?? []).map((t) => (
            <span
              key={t.tag}
              role="button"
              tabIndex={0}
              title={`Filter by "${t.tag}"`}
              onClick={(e) => {
                e.stopPropagation();
                onTagClick(t.tag);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onTagClick(t.tag);
                }
              }}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-4 text-gray-400 cursor-pointer hover:ring-1 hover:ring-gray-500"
              style={t.color ? { backgroundColor: `${t.color}20`, color: t.color } : undefined}
            >
              {t.tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export function ProfileList({
  profiles,
  selectedId,
  selectedIds,
  onSelectionChange,
  onNew,
  onReorder,
  onBulkStart,
  onBulkStop,
  bulkBusy,
  bulkError,
}: ProfileListProps) {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // Shift-click range anchor (profile id). Ref — no re-render needed.
  const anchorRef = useRef<string | null>(null);

  // Every tag used by any profile, sorted A-Z. First-seen color wins.
  const allTags = useMemo(() => {
    const seen = new Map<string, string | null>();
    for (const p of profiles) {
      for (const t of p.tags ?? []) {
        if (!seen.has(t.tag)) seen.set(t.tag, t.color ?? null);
      }
    }
    return [...seen.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tag, color]) => ({ tag, color }));
  }, [profiles]);

  const toggleTag = (tag: string) =>
    setActiveTag((prev) => (prev === tag ? null : tag));

  const query = search.trim().toLowerCase();
  const filtered = profiles.filter((p) => {
    if (activeTag && !(p.tags ?? []).some((t) => t.tag === activeTag)) return false;
    if (!query) return true;
    if (p.name.toLowerCase().includes(query)) return true;
    return (p.tags ?? []).some((t) => t.tag.toLowerCase().includes(query));
  });

  const runningCount = profiles.filter((p) => p.status === "running").length;

  // Plain click = select one. Shift+click = range from anchor through the
  // visible (filtered) list. Ctrl/Cmd+click = toggle one. Focused id drives
  // the detail panel; the whole set drives bulk start/stop.
  const handleRowClick = (e: RowClick, id: string, index: number) => {
    const ids = filtered.map((p) => p.id);
    if (e.shiftKey && anchorRef.current && ids.includes(anchorRef.current)) {
      const a = ids.indexOf(anchorRef.current);
      const from = Math.min(a, index);
      const to = Math.max(a, index);
      onSelectionChange(ids.slice(from, to + 1), id);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      anchorRef.current = id;
      const next = selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id];
      // Keep visible order so bulk ops run top-to-bottom.
      const ordered = [
        ...ids.filter((x) => next.includes(x)),
        ...next.filter((x) => !ids.includes(x)),
      ];
      onSelectionChange(ordered, ordered.includes(id) ? id : (ordered[0] ?? null));
      return;
    }
    anchorRef.current = id;
    onSelectionChange([id], id);
  };

  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const selectedProfiles = selectedIds
    .map((id) => byId.get(id))
    .filter((p): p is Profile => p !== undefined);
  const startIds = selectedProfiles
    .filter((p) => p.status === "stopped")
    .map((p) => p.id);
  const stopIds = selectedProfiles
    .filter((p) => p.status === "running")
    .map((p) => p.id);
  const multi = selectedIds.length > 1;

  // Reordering is disabled while a search/tag filter is active — dragging
  // within a filtered subset is ambiguous. Empty filters mean
  // filtered === profiles order.
  const dragEnabled = search === "" && activeTag === null;

  // A small activation distance so a plain click still selects (no accidental drag).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = profiles.map((p) => p.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Monitor className="h-4 w-4 text-accent" />
          <h1 className="text-sm font-semibold tracking-tight">CloakBrowser Manager</h1>
        </div>
        {runningCount > 0 && (
          <div className="text-xs text-gray-500 mb-3">
            {runningCount} running
          </div>
        )}
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search profiles or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-8 py-1.5 text-xs"
          />
        </div>
        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {allTags.map(({ tag, color }) => {
              const active = activeTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  title={active ? `Clear "${tag}" filter` : `Filter by "${tag}"`}
                  className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                    active
                      ? "border-gray-400 bg-surface-3 text-gray-100"
                      : "border-transparent bg-surface-2 text-gray-400 hover:text-gray-200"
                  }`}
                  style={
                    !active && color
                      ? { backgroundColor: `${color}20`, color }
                      : undefined
                  }
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </button>
              );
            })}
            {activeTag && (
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className="text-[10px] px-1.5 py-0.5 text-gray-500 hover:text-gray-200 underline"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Profile list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <div className="text-center text-gray-500 text-xs py-8">
            {profiles.length === 0 ? "No profiles yet" : "No matches"}
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {filtered.map((profile, index) => (
              <SortableProfileRow
                key={profile.id}
                profile={profile}
                index={index}
                selected={selectedIds.includes(profile.id)}
                focused={selectedId === profile.id}
                showFocusRing={multi}
                draggable={dragEnabled}
                onRowClick={handleRowClick}
                onTagClick={toggleTag}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Bulk actions + new profile button */}
      <div className="p-3 border-t border-border space-y-2">
        {multi ? (
          <div className="rounded-md bg-surface-2 border border-border p-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs text-gray-400">
                {selectedIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => onSelectionChange([], null)}
                className="text-gray-500 hover:text-gray-200 p-0.5"
                title="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onBulkStart(startIds)}
                disabled={startIds.length === 0 || bulkBusy !== null}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bulkBusy !== null ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                <span>Start ({startIds.length})</span>
              </button>
              <button
                type="button"
                onClick={() => onBulkStop(stopIds)}
                disabled={stopIds.length === 0 || bulkBusy !== null}
                className="btn-danger flex-1 flex items-center justify-center gap-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bulkBusy !== null ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
                <span>Stop ({stopIds.length})</span>
              </button>
            </div>
            {bulkBusy !== null && (
              <div className="text-[11px] text-gray-400 mt-1.5 px-1">{bulkBusy}</div>
            )}
            {bulkError !== null && (
              <div className="text-[11px] text-red-400 mt-1.5 px-1">{bulkError}</div>
            )}
            <div className="text-[10px] text-gray-600 mt-1.5 px-1">
              Shift+click range &middot; Ctrl+click toggle
            </div>
          </div>
        ) : (
          profiles.length > 1 && (
            <div className="text-[10px] text-gray-600 text-center">
              Shift+click to select multiple
            </div>
          )
        )}
        <button onClick={onNew} className="btn-secondary w-full flex items-center justify-center gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          <span>New Profile</span>
        </button>
      </div>
    </div>
  );
}
