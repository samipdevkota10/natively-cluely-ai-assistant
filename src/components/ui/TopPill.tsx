import { ChevronUp, ChevronDown, Zap } from "lucide-react";
import icon from "../icon.png";
import type { OverlayAppearance } from "../../lib/overlayAppearance";

interface TopPillProps {
    expanded: boolean;
    onToggle: () => void;
    onQuit: () => void;
    appearance: OverlayAppearance;
    onLogoClick?: () => void;
    /** Smart Mode (F3): coding-interview bias toggle state. */
    smartMode?: boolean;
    onToggleSmartMode?: () => void;
}

export default function TopPill({
    expanded,
    onToggle,
    onQuit,
    appearance,
    onLogoClick,
    smartMode,
    onToggleSmartMode,
}: TopPillProps) {
    // Manual window drag. CSS -webkit-app-region drag is unreliable on this
    // transparent overlay (it toggles setIgnoreMouseEvents for click-through),
    // so we move the window ourselves via screen-coordinate deltas.
    const handleDragStart = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // left button only
        // Don't start a drag from an interactive control (button/img).
        if ((e.target as HTMLElement).closest("button")) return;
        e.preventDefault();
        let lastX = e.screenX;
        let lastY = e.screenY;
        let frame = 0;
        let pendingDx = 0;
        let pendingDy = 0;
        const flush = () => {
            frame = 0;
            if (pendingDx || pendingDy) {
                window.electronAPI?.moveWindowBy?.(pendingDx, pendingDy);
                pendingDx = 0;
                pendingDy = 0;
            }
        };
        const onMove = (ev: MouseEvent) => {
            pendingDx += ev.screenX - lastX;
            pendingDy += ev.screenY - lastY;
            lastX = ev.screenX;
            lastY = ev.screenY;
            if (!frame) frame = requestAnimationFrame(flush);
        };
        const onUp = () => {
            if (frame) cancelAnimationFrame(frame);
            flush();
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    return (
        <div className="flex justify-center select-none z-50">
            <div
                onMouseDown={handleDragStart}
                className="
          relative z-50
          flex items-center gap-2
          rounded-full
          border
          overlay-pill-surface
          backdrop-blur-md
          px-1.5 py-1.5
          transition-all duration-300 ease-sculpted
        "
                style={{ ...appearance.pillStyle, cursor: "grab" }}
            >
                <div>
                    {/* LOGO BUTTON */}
                    <button
                        onClick={onLogoClick}
                        className={`
              w-7 h-7
              rounded-full
              overlay-icon-surface
              overlay-icon-surface-hover
              flex items-center justify-center
              relative overflow-hidden
              interaction-base interaction-press
            `}
                        style={appearance.iconStyle}
                    >
                        <img
                            src={icon}
                            alt="Natively"
                            className="w-[24px] h-[24px] object-contain opacity-95 scale-105 force-black-icon"
                            draggable="false"
                            onDragStart={(e) => e.preventDefault()}
                        />
                    </button>
                </div>

                {/* CENTER SEGMENT */}
                <button
                    onClick={onToggle}
                    className={`
            flex items-center gap-2
            group
            px-3 py-1
            rounded-full
            backdrop-blur-md
            overlay-chip-surface
            overlay-text-interactive
            text-[12px]
            font-medium
            border
            interaction-base interaction-hover interaction-press
          `}
                    style={appearance.chipStyle}
                >
                    <span className="opacity-70 group-hover:opacity-100 transition-opacity duration-200">
                        {expanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                        )}
                    </span>
                    <span className="tracking-wide opacity-80 group-hover:opacity-100">{expanded ? "Hide" : "Show"}</span>
                </button>

                {/* SMART MODE (F3) — lightning toggle. Drag guard above already
                    excludes buttons, so clicking never starts a window drag. */}
                {onToggleSmartMode && (
                    <button
                        onClick={onToggleSmartMode}
                        title={smartMode ? "Smart Mode on — coding-interview bias active" : "Smart Mode off"}
                        className={`
              w-7 h-7
              rounded-full
              overlay-icon-surface
              flex items-center justify-center
              interaction-base interaction-press
              ${smartMode
                                ? "text-amber-400 hover:text-amber-300"
                                : "overlay-text-primary opacity-50 hover:opacity-90"}
            `}
                        style={appearance.iconStyle}
                    >
                        <Zap
                            className="w-3.5 h-3.5"
                            fill={smartMode ? "currentColor" : "none"}
                        />
                    </button>
                )}

                {/* STOP / QUIT BUTTON */}
                <button
                    onClick={onQuit}
                    className={`
            w-7 h-7
            rounded-full
            overlay-icon-surface
            overlay-text-primary
            flex items-center justify-center
            interaction-base interaction-press
            hover:bg-red-500/10 hover:text-red-400
          `}
                    style={appearance.iconStyle}
                >
                    <div className="w-3.5 h-3.5 rounded-[3px] bg-current opacity-80" />
                </button>
            </div>
        </div>
    );
}
