/**
 * ModesSettings — local implementation.
 *
 * The premium submodule (premium/src/ModesSettings.tsx) ships the full-featured
 * editor. When that submodule is absent (self-hosted / open build), this local
 * panel takes its place so Modes remain usable with your own AI provider.
 *
 * It drives the public `window.electronAPI.modes*` IPC channels directly:
 * list / create-from-template / edit name + custom instructions / activate /
 * delete. The Pro-gate in the main process is unlocked for local builds via
 * NATIVELY_LOCAL_MODES=1 or an unpackaged dev build (see ipcHandlers.ts).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Check, Loader2 } from 'lucide-react';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';

interface Mode {
  id: string;
  name: string;
  templateType: string;
  customContext: string;
  isActive: boolean;
  createdAt: string;
  referenceFileCount?: number;
}

interface ModesSettingsProps {
  onClose: () => void;
  isPremium?: boolean;
  isLoaded?: boolean;
  isTrialActive?: boolean;
  onOpenNativelyAPI?: () => void;
}

// Mirrors MODE_TEMPLATES in electron/services/ModesManager.ts.
const TEMPLATES: Array<{ type: string; label: string; description: string }> = [
  { type: 'general', label: 'General', description: 'Universal adaptive copilot for any meeting or conversation.' },
  { type: 'technical-interview', label: 'Technical Interview', description: 'Whiteboard-style coding and system design support.' },
  { type: 'looking-for-work', label: 'Looking for work', description: 'Answer interview questions with confidence and clarity.' },
  { type: 'sales', label: 'Sales', description: 'Close deals with strategic discovery and objection handling.' },
  { type: 'recruiting', label: 'Recruiting', description: 'Evaluate candidates with structured interview insights.' },
  { type: 'team-meet', label: 'Team Meet', description: 'Track action items and key decisions from meetings.' },
  { type: 'lecture', label: 'Lecture', description: 'Capture key concepts and content from lectures.' },
];

const templateLabel = (type: string): string =>
  TEMPLATES.find((t) => t.type === type)?.label ?? type;

const CUSTOM_CONTEXT_MAX = 1200;

// One-click preset for terse, interview-ready answers. Each line starts with an
// imperative verb on purpose: the custom-context classifier only treats short
// imperative directives as "pinned" style guidance, which is the category that
// survives into coding/DSA answers. Noun-led lines would be dropped there.
const CONCISE_PRESET = `Always be maximally concise; lead with the optimal solution and skip brute force unless asked.
Keep the approach to at most three short, interview-speakable bullets.
Use clean, production-ready code with meaningful names and minimal comments.
Keep the dry run to one example and complexity to one line each for time and space.
Keep system design design-first, with at most two short bullets per section.
Always state just the single sharpest tradeoff; skip a section that adds nothing non-obvious.
Never add preamble, restate the question, or add closing remarks.`;

const ModesSettings: React.FC<ModesSettingsProps> = ({ onClose }) => {
  const theme = useResolvedTheme();
  const isLight = theme === 'light';

  const [modes, setModes] = useState<Mode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTemplate, setNewTemplate] = useState('technical-interview');

  // Inline editor for the selected mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editContext, setEditContext] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const all = (await window.electronAPI?.modesGetAll?.()) ?? [];
      setModes(all as Mode[]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load modes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const proRequired = (msg?: string) =>
    setError(
      msg === 'pro_required'
        ? 'This action is gated behind Pro. For a local build, set NATIVELY_LOCAL_MODES=1 (or run the unpackaged dev build) and restart the app.'
        : msg ?? 'Something went wrong',
    );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    setSaving(true);
    try {
      const res = await window.electronAPI?.modesCreate?.({ name, templateType: newTemplate });
      if (!res?.success) return proRequired(res?.error);
      setNewName('');
      setCreating(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create mode');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (mode: Mode) => {
    setError(null);
    setBusyId(mode.id);
    try {
      const target = mode.isActive ? null : mode.id;
      const res = await window.electronAPI?.modesSetActive?.(target);
      if (!res?.success) return proRequired(res?.error);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to set active mode');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (mode: Mode) => {
    setError(null);
    setBusyId(mode.id);
    try {
      const res = await window.electronAPI?.modesDelete?.(mode.id);
      if (!res?.success) return proRequired(res?.error);
      if (editingId === mode.id) setEditingId(null);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete mode');
    } finally {
      setBusyId(null);
    }
  };

  const beginEdit = (mode: Mode) => {
    setEditingId(mode.id);
    setEditName(mode.name);
    setEditContext(mode.customContext ?? '');
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setError(null);
    setSaving(true);
    try {
      const res = await window.electronAPI?.modesUpdate?.(editingId, {
        name: editName.trim() || undefined,
        customContext: editContext,
      });
      if (!res?.success) return proRequired(res?.error);
      setEditingId(null);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save mode');
    } finally {
      setSaving(false);
    }
  };

  // ── Theme tokens ──────────────────────────────────────────────
  const bgPanel = isLight ? 'bg-[#f5f5f7]' : 'bg-[#141414]';
  const textHero = isLight ? 'text-slate-900' : 'text-white';
  const textSub = isLight ? 'text-slate-500' : 'text-white/55';
  const border = isLight ? 'border-black/10' : 'border-white/10';
  const card = isLight ? 'bg-white border-black/5' : 'bg-white/[0.03] border-white/[0.06]';
  const cardHover = isLight ? 'hover:bg-slate-50' : 'hover:bg-white/[0.06]';
  const input = isLight
    ? 'bg-white border-black/10 text-slate-900 placeholder-slate-400'
    : 'bg-white/[0.04] border-white/10 text-white placeholder-white/30';
  const ctaSolid = isLight
    ? 'bg-slate-900 text-white hover:bg-slate-800'
    : 'bg-white text-slate-900 hover:bg-white/90';

  return (
    <div className={`h-full w-full flex flex-col overflow-hidden ${bgPanel}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-4 border-b ${border}`}>
        <div>
          <h1 className={`text-lg font-semibold ${textHero}`}>Modes</h1>
          <p className={`text-xs ${textSub}`}>
            Custom instructions and answer formulas per meeting context.
          </p>
        </div>
        <button
          onClick={onClose}
          className={`p-1.5 rounded-lg transition-colors ${isLight ? 'hover:bg-black/5' : 'hover:bg-white/10'}`}
          aria-label="Close"
        >
          <X className={`w-5 h-5 ${textSub}`} />
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-3 py-2 rounded-lg text-xs bg-amber-500/10 text-amber-500 border border-amber-500/20">
          {error}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading ? (
          <div className={`flex items-center gap-2 text-sm ${textSub}`}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading modes…
          </div>
        ) : (
          <>
            {modes.length === 0 && !creating && (
              <p className={`text-sm ${textSub}`}>No modes yet. Create one to get started.</p>
            )}

            {modes.map((mode) => (
              <div key={mode.id} className={`rounded-xl border ${card} transition-colors`}>
                <div className={`flex items-center gap-3 px-4 py-3 ${cardHover} rounded-xl`}>
                  <button
                    onClick={() => handleActivate(mode)}
                    disabled={busyId === mode.id}
                    title={mode.isActive ? 'Active — click to deactivate' : 'Set active'}
                    className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                      mode.isActive
                        ? 'bg-emerald-500 border-emerald-500'
                        : isLight
                          ? 'border-slate-300'
                          : 'border-white/25'
                    }`}
                  >
                    {busyId === mode.id ? (
                      <Loader2 className="w-3 h-3 animate-spin text-white" />
                    ) : mode.isActive ? (
                      <Check className="w-3 h-3 text-white" />
                    ) : null}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium truncate ${textHero}`}>{mode.name}</span>
                      {mode.isActive && (
                        <span className="text-[10px] font-medium px-1.5 py-[1px] rounded bg-emerald-500/15 text-emerald-500">
                          Active
                        </span>
                      )}
                    </div>
                    <span className={`text-xs ${textSub}`}>{templateLabel(mode.templateType)}</span>
                  </div>

                  <button
                    onClick={() => (editingId === mode.id ? setEditingId(null) : beginEdit(mode))}
                    className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                      isLight ? 'text-slate-600 hover:bg-black/5' : 'text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {editingId === mode.id ? 'Close' : 'Edit'}
                  </button>
                  <button
                    onClick={() => handleDelete(mode)}
                    disabled={busyId === mode.id}
                    className={`p-1.5 rounded-md transition-colors ${
                      isLight ? 'text-slate-400 hover:bg-red-50 hover:text-red-500' : 'text-white/40 hover:bg-red-500/10 hover:text-red-400'
                    }`}
                    aria-label="Delete mode"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {editingId === mode.id && (
                  <div className={`px-4 pb-4 pt-1 space-y-3 border-t ${border}`}>
                    <div>
                      <label className={`block text-xs mb-1 ${textSub}`}>Name</label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-emerald-500/50 ${input}`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={`text-xs ${textSub}`}>
                          Custom instructions (real-time prompt)
                        </label>
                        <button
                          type="button"
                          onClick={() => setEditContext(CONCISE_PRESET)}
                          title="Fill with a concise interview-answer preset"
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                            isLight
                              ? 'text-slate-600 bg-black/5 hover:bg-black/10'
                              : 'text-white/70 bg-white/10 hover:bg-white/15'
                          }`}
                        >
                          Concise preset
                        </button>
                      </div>
                      <textarea
                        value={editContext}
                        maxLength={CUSTOM_CONTEXT_MAX}
                        onChange={(e) => setEditContext(e.target.value)}
                        rows={5}
                        placeholder="e.g. Be maximally concise. Lead with the optimal solution. Code: production-clean, minimal comments. Assume Python unless told otherwise. For system design, keep each section to two short bullets. No preamble."
                        className={`w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none focus:border-emerald-500/50 ${input}`}
                      />
                      <div className={`text-[10px] mt-1 text-right ${textSub}`}>
                        {editContext.length}/{CUSTOM_CONTEXT_MAX}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className={`text-xs px-3 py-1.5 rounded-full ${isLight ? 'text-slate-500 hover:bg-black/5' : 'text-white/60 hover:bg-white/10'}`}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className={`text-xs font-medium px-4 py-1.5 rounded-full transition-all active:scale-95 disabled:opacity-50 ${ctaSolid}`}
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Create form */}
            {creating ? (
              <div className={`rounded-xl border ${card} p-4 space-y-3`}>
                <div>
                  <label className={`block text-xs mb-1 ${textSub}`}>Mode name</label>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    placeholder="e.g. Coding Interview"
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-emerald-500/50 ${input}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs mb-1 ${textSub}`}>Template</label>
                  <select
                    value={newTemplate}
                    onChange={(e) => setNewTemplate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-emerald-500/50 ${input}`}
                  >
                    {TEMPLATES.map((t) => (
                      <option key={t.type} value={t.type} className={isLight ? '' : 'bg-[#1c1c1e]'}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <p className={`text-[11px] mt-1 ${textSub}`}>
                    {TEMPLATES.find((t) => t.type === newTemplate)?.description}
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setCreating(false);
                      setNewName('');
                    }}
                    className={`text-xs px-3 py-1.5 rounded-full ${isLight ? 'text-slate-500 hover:bg-black/5' : 'text-white/60 hover:bg-white/10'}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={saving || !newName.trim()}
                    className={`text-xs font-medium px-4 py-1.5 rounded-full transition-all active:scale-95 disabled:opacity-50 ${ctaSolid}`}
                  >
                    {saving ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed text-sm transition-colors ${
                  isLight ? 'border-black/15 text-slate-600 hover:bg-black/[0.02]' : 'border-white/15 text-white/60 hover:bg-white/[0.03]'
                }`}
              >
                <Plus className="w-4 h-4" /> New mode
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ModesSettings;
