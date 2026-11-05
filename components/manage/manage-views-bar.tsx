"use client"

import { useEffect, useState } from "react"
import {
  Check,
  ChevronDown,
  Copy,
  Grid2x2,
  Link2,
  Lock,
  Menu,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { GRID_BASE_FONT_CLASS } from "@/components/grid/grid-row"
import {
  isContactViewVisibility,
  CONTACT_VIEW_TYPES,
  CONTACT_VIEW_TYPE_LABELS,
  CONTACT_VIEW_VISIBILITIES,
  CONTACT_VIEW_VISIBILITY_HINTS,
  CONTACT_VIEW_VISIBILITY_LABELS,
  canEditContactView,
  type ContactViewVisibility,
  type ManageContactView,
} from "@/components/manage/manage-view-types"

export type ViewSaveState = "idle" | "saving" | "saved" | "error"

export interface ManageViewsBarProps {
  views: ManageContactView[]
  activeView: ManageContactView | null
  /** What the grid is showing right now, used to seed a create or a duplicate. */
  saveState: ViewSaveState
  defaultName: string
  onSelectView: (viewId: string) => void
  /** Clears `view` and returns the grid to its unsaved arrangement. */
  onSelectUnsaved: () => void
  onCreateView: (name: string, visibility: ContactViewVisibility) => Promise<void>
  onRenameView: (viewId: string, name: string) => Promise<void>
  onDuplicateView: (viewId: string) => Promise<void>
  onDeleteView: (viewId: string) => Promise<void>
  /** The signed-in operator, for "can I edit this view". */
  currentUserId: string
  /** Whether the sidebar is expanded. */
  open: boolean
  /** Toggles the sidebar; the parent owns the persisted choice. */
  onToggle: () => void
}

const SAVE_LABELS: Record<ViewSaveState, string> = {
  idle: "",
  saving: "Saving…",
  saved: "All changes saved",
  error: "Could not save",
}

type NameDialog =
  | { mode: "create"; value: string; visibility: ContactViewVisibility }
  | { mode: "rename"; value: string; viewId: string }
  | null

/**
 * The saved-views sidebar, beside the grid on desktop.
 *
 * The header names the open view and opens that view's actions (rename,
 * duplicate, copy link, delete); the list under it is the switcher, the way the
 * reference product keeps views in a sidebar. The component is mounted only on
 * desktop — the phone has its own list and no views surface — so every control
 * here is desktop chrome.
 */
export function ManageViewsBar({
  views,
  activeView,
  saveState,
  defaultName,
  onSelectView,
  onSelectUnsaved,
  onCreateView,
  onRenameView,
  onDuplicateView,
  onDeleteView,
  currentUserId,
  open,
  onToggle,
}: ManageViewsBarProps) {
  const [dialog, setDialog] = useState<NameDialog>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }

    const timer = setTimeout(() => setCopied(false), 2000)

    return () => clearTimeout(timer)
  }, [copied])

  const activeLabel = activeView?.name ?? "All contacts"

  const run = async (action: () => Promise<void>) => {
    setPending(true)
    setError(null)

    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setPending(false)
    }
  }

  const submitName = () => {
    if (!dialog) {
      return
    }

    const name = dialog.value.trim()

    if (name.length === 0) {
      setError("A view needs a name.")
      return
    }

    const current = dialog
    setDialog(null)

    void run(async () => {
      if (current.mode === "create") {
        await onCreateView(name, current.visibility)
      } else {
        await onRenameView(current.viewId, name)
      }
    })
  }

  return (
    <aside
      data-grid-views-bar=""
      data-state={open ? "expanded" : "collapsed"}
      aria-label="Views"
      className={`${GRID_BASE_FONT_CLASS} bg-card relative flex shrink-0 flex-col transition-[width] duration-150 ease-out ${
        open
          ? "w-[280px] border-r border-r-[color:var(--grid-cell-border)]"
          : "w-0 border-r-0"
      }`}
    >
      <div className="absolute left-0 top-0 z-30 flex h-12 w-[280px] shrink-0 items-center gap-1 border-b border-b-[color:var(--grid-header-border)] bg-[var(--grid-chrome-bg)] pl-3 pr-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "Close list of views" : "Open list of views"}
          aria-expanded={open}
          data-grid-views-toggle=""
          className="hover:bg-[var(--grid-chrome-hover)] flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--grid-control-icon)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
        >
          <Menu aria-hidden="true" className="size-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label={`View menu for ${activeLabel}`}
              data-grid-view-switcher=""
              data-grid-view-menu=""
              className="hover:bg-[var(--grid-chrome-hover)] h-[26px] min-w-0 flex-1 justify-start gap-1.5 rounded-[3px] px-2 text-[13px] font-semibold has-[>svg]:px-2"
            >
              <Grid2x2 aria-hidden="true" className="size-4 shrink-0 text-[var(--tag-1)]" />
              <span className="truncate">{activeLabel}</span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-[var(--tag-1)]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[240px] rounded-[6px] p-1">
            {activeView ? (
              <>
                <DropdownMenuItem
                  className="h-8 gap-2 text-[13px]"
                  disabled={!canEditContactView(activeView, currentUserId)}
                  onSelect={() => {
                    setError(null)
                    setDialog({ mode: "rename", value: activeView.name, viewId: activeView.id })
                  }}
                >
                  <Pencil aria-hidden="true" className="size-3.5" />
                  Rename view
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="h-8 gap-2 text-[13px]"
                  onSelect={() => void run(() => onDuplicateView(activeView.id))}
                >
                  <Copy aria-hidden="true" className="size-3.5" />
                  Duplicate view
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="h-8 gap-2 text-[13px]"
                  onSelect={() => {
                    void navigator.clipboard
                      .writeText(window.location.href)
                      .then(() => setCopied(true))
                      .catch(() => setError("This browser would not let the link be copied."))
                  }}
                >
                  <Link2 aria-hidden="true" className="size-3.5" />
                  Copy link to this view
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive h-8 gap-2 text-[13px]"
                  disabled={!canEditContactView(activeView, currentUserId)}
                  onSelect={() => setConfirmDelete(true)}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Delete view
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem
                className="h-8 gap-2 text-[13px]"
                onSelect={() => {
                  setError(null)
                  setDialog({ mode: "create", value: defaultName, visibility: "personal" })
                }}
              >
                <Plus aria-hidden="true" className="size-3.5" />
                Create new view
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-14 ${
          open ? "" : "hidden"
        }`}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              data-grid-view-create=""
              aria-label="Create new view"
              disabled={pending}
              className="hover:bg-[var(--grid-control-hover)] text-[var(--grid-control-ink)] h-8 w-full justify-start gap-2 rounded-[3px] px-2 text-[13px] font-normal has-[>svg]:px-2"
            >
              <Plus aria-hidden="true" className="size-4 text-[var(--grid-control-icon)]" />
              New view
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[240px] rounded-[6px] p-1">
            <DropdownMenuLabel>Create new view</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/*
              One entry per renderable view type. Adding Calendar or Kanban is an
              entry in `CONTACT_VIEW_TYPES` plus a renderer — never a second menu
              built here.
            */}
            {CONTACT_VIEW_TYPES.map((viewType) => (
              <DropdownMenuItem
                key={viewType}
                data-grid-view-type={viewType}
                className="gap-2 text-[13px]"
                onSelect={() => {
                  setError(null)
                  setDialog({ mode: "create", value: defaultName, visibility: "personal" })
                }}
              >
                <Grid2x2 aria-hidden="true" className="text-[var(--tag-1)] size-3.5" />
                {CONTACT_VIEW_TYPE_LABELS[viewType]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <p className="text-[var(--grid-footer-ink)] px-2 pb-0.5 pt-3 text-[12px] font-medium">
          Views
        </p>

        <button
          type="button"
          data-grid-view-list-option="unsaved"
          aria-current={activeView === null ? "page" : undefined}
          onClick={onSelectUnsaved}
          className={`flex h-8 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[13px] text-[var(--grid-control-ink)] ${
            activeView === null
              ? "bg-[var(--grid-list-selected)]"
              : "hover:bg-[var(--grid-control-hover)]"
          }`}
        >
          <Grid2x2 aria-hidden="true" className="size-4 shrink-0 text-[var(--tag-1)]" />
          <span className="min-w-0 flex-1 truncate">All contacts</span>
          {activeView === null ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}
        </button>

        {views.map((view) => (
          <button
            key={view.id}
            type="button"
            data-grid-view-list-option={view.id}
            aria-current={view.id === activeView?.id ? "page" : undefined}
            onClick={() => onSelectView(view.id)}
            className={`flex h-8 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[13px] text-[var(--grid-control-ink)] ${
              view.id === activeView?.id
                ? "bg-[var(--grid-list-selected)]"
                : "hover:bg-[var(--grid-control-hover)]"
            }`}
          >
            <Grid2x2 aria-hidden="true" className="size-4 shrink-0 text-[var(--tag-1)]" />
            <span className="min-w-0 flex-1 truncate">{view.name}</span>
            {view.visibility === "collaborative" ? (
              <Users aria-hidden="true" className="size-3.5 shrink-0 text-[var(--grid-control-icon)]" />
            ) : (
              <Lock aria-hidden="true" className="size-3.5 shrink-0 text-[var(--grid-control-icon)]" />
            )}
            {view.id === activeView?.id ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}
          </button>
        ))}
      </div>

      {open && (saveState !== "idle" || copied || error) ? (
        <div className="shrink-0 border-t border-t-[color:var(--grid-cell-border)] px-3 py-2">
          <p
            role="status"
            data-grid-view-save={saveState}
            className={`text-[12px] ${
              saveState === "error" ? "text-destructive" : "text-[var(--grid-footer-ink)]"
            }`}
          >
            {copied ? "Link copied" : SAVE_LABELS[saveState]}
          </p>

          {error ? (
            <p role="alert" className="text-destructive mt-1 text-[12px]">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <Dialog open={dialog !== null} onOpenChange={(open) => (open ? undefined : setDialog(null))}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "rename" ? "Rename view" : "Create new view"}</DialogTitle>
            <DialogDescription>
              {dialog?.mode === "rename"
                ? "The name is shown in the view switcher and in shared links."
                : "It starts as a copy of the arrangement on screen, and keeps its own sort, filters, fields and row height from there."}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={dialog?.value ?? ""}
            aria-label="View name"
            onChange={(event) => {
              const value = event.target.value
              setDialog((current) => (current ? { ...current, value } : current))
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                submitName()
              }
            }}
          />

          {dialog?.mode === "create" ? (
            <div className="space-y-2">
              <p className="text-[12px] font-medium">Who can edit</p>
              <RadioGroup
                value={dialog.visibility}
                aria-label="Who can edit"
                className="gap-2"
                onValueChange={(value) => {
                  if (!isContactViewVisibility(value)) {
                    return
                  }

                  setDialog((current) =>
                    current?.mode === "create" ? { ...current, visibility: value } : current,
                  )
                }}
              >
                {CONTACT_VIEW_VISIBILITIES.map((visibility) => (
                  <label
                    key={visibility}
                    htmlFor={`view-visibility-${visibility}`}
                    className="border-border flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2"
                  >
                    <RadioGroupItem
                      id={`view-visibility-${visibility}`}
                      value={visibility}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">
                        {CONTACT_VIEW_VISIBILITY_LABELS[visibility]}
                      </span>
                      <span className="text-muted-foreground block text-[12px] leading-snug">
                        {CONTACT_VIEW_VISIBILITY_HINTS[visibility]}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitName} disabled={pending}>
              {dialog?.mode === "rename" ? "Rename" : "Create new view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{activeView?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeView?.visibility === "collaborative"
                ? "The view and its saved arrangement are removed for everyone in this programme. The contacts themselves are not affected."
                : "The view and its saved arrangement are removed. The contacts themselves are not affected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep view</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const viewId = activeView?.id
                setConfirmDelete(false)

                if (viewId) {
                  void run(() => onDeleteView(viewId))
                }
              }}
            >
              Delete view
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}
